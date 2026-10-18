import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  protocol,
  net,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
  type MenuItemConstructorOptions,
} from "electron";
import { join, basename, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, mkdir, stat, access, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import {
  atomicSave,
  readPDF,
  stamp,
  validateBytes,
  writeJSON,
  writeText,
} from "./files";
import { createDocx, createPptx, markupToPDF } from "./conversions";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "studio",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
app.setName("OpenPDF Studio");
if (process.env.OPENPDF_TEST_USER_DATA)
  app.setPath("userData", process.env.OPENPDF_TEST_USER_DATA);
let win: BrowserWindow;
let dirty = false;
let ready = false;
let pendingFile: string | null =
  process.argv.find((arg) => arg.toLowerCase().endsWith(".pdf")) ?? null;
type FileHandle = { path: string; stamp: string | null };
type Recent = { id: string; path: string; name: string; date: number };
const handles = new Map<string, FileHandle>();
let recentFiles: Recent[] = [];
const ocrProcesses = new Map<number, ChildProcessWithoutNullStreams>();
function validOCRResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (
    !Array.isArray(result.pages) ||
    typeof result.markdown !== "string" ||
    result.markdown.length > 10 * 1024 * 1024 ||
    typeof result.processingTimeMs !== "number" ||
    result.engine !== "Apple Vision"
  )
    return false;
  let textLength = 0;
  return result.pages.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const page = entry as Record<string, unknown>;
    if (typeof page.text === "string") textLength += page.text.length;
    return (
      Number.isInteger(page.page) &&
      typeof page.text === "string" &&
      typeof page.confidence === "number" &&
      Number.isFinite(page.confidence) &&
      textLength <= 10 * 1024 * 1024
    );
  });
}
const devURL = process.env.VITE_DEV_SERVER_URL;
const trusted = (event: IpcMainInvokeEvent | IpcMainEvent) => {
  if (
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("Untrusted caller");
  const url = event.senderFrame?.url ?? "";
  if (
    !(devURL
      ? new URL(url).origin === new URL(devURL).origin
      : url.startsWith("studio://app/"))
  )
    throw new Error("Untrusted origin");
};
function command(name: string) {
  win.webContents.send("menu:command", name);
}
function recentsPath() {
  return join(app.getPath("userData"), "recent-files.json");
}
async function remember(path: string, id: string) {
  recentFiles = [
    { path, id, name: basename(path), date: Date.now() },
    ...recentFiles.filter((file) => file.path !== path),
  ].slice(0, 10);
  await writeJSON(recentsPath(), recentFiles);
  app.addRecentDocument(path);
}
async function openPath(path: string) {
  const { bytes, stamp: fileStamp } = await readPDF(path);
  const id = randomUUID();
  handles.set(id, { path, stamp: fileStamp });
  await remember(path, id);
  return { id, name: basename(path), bytes };
}
function runLocalTool(executable: string, args: string[], timeoutMs = 120000) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8000) stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            signal
              ? "Document conversion timed out."
              : stderr.trim() || "The document converter could not complete.",
          ),
        );
    });
  });
}
function rustNativePath() {
  return app.isPackaged
    ? join(process.resourcesPath, "native", "openpdf-native")
    : join(app.getAppPath(), "build", "native", "openpdf-native");
}
function prepareSignatureNative(bytes: Uint8Array, removeWhite: boolean) {
  return new Promise<{
    bytes: Uint8Array;
    width: number;
    height: number;
    engine: "Rust";
  }>((resolvePromise, reject) => {
    const child = spawn(
      rustNativePath(),
      ["signature", ...(removeWhite ? [] : ["--keep-background"])],
      { stdio: ["pipe", "pipe", "pipe"], env: {} },
    );
    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = "";
    let stopped = false;
    const finish = (cause?: Error) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout);
      if (cause) reject(cause);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Native signature preparation timed out."));
    }, 30000);
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 25 * 1024 * 1024) {
        child.kill("SIGTERM");
        finish(new Error("Prepared signature exceeds the 25 MB limit."));
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (stopped) return;
      clearTimeout(timeout);
      if (code !== 0) {
        finish(
          new Error(
            stderr.replace(/^openpdf-native:\s*/, "").trim() ||
              "Native signature preparation failed.",
          ),
        );
        return;
      }
      const output = Buffer.concat(chunks);
      const png =
        output.length >= 24 &&
        output[0] === 0x89 &&
        output.subarray(1, 4).toString() === "PNG";
      const width = png ? output.readUInt32BE(16) : 0;
      const height = png ? output.readUInt32BE(20) : 0;
      if (
        !png ||
        width < 5 ||
        height < 5 ||
        width > 4096 ||
        height > 4096 ||
        width * height > 16_000_000
      ) {
        finish(
          new Error("Native signature preparation returned invalid data."),
        );
        return;
      }
      stopped = true;
      resolvePromise({
        bytes: new Uint8Array(output),
        width,
        height,
        engine: "Rust",
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(Buffer.from(bytes));
  });
}
async function firstAvailable(paths: string[]) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      /* Try the next local application. */
    }
  }
  return null;
}
async function confirmClose(
  name?: string,
): Promise<"save" | "discard" | "cancel"> {
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: name
      ? `Save changes to “${name}”?`
      : "Save changes in your open PDFs?",
    detail: "Your unsaved changes will be lost if you discard them.",
    buttons: ["Save", "Discard Changes", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return (["save", "discard", "cancel"] as const)[response];
}
async function deliverPending() {
  if (!pendingFile || !ready) return;
  const path = pendingFile;
  pendingFile = null;
  try {
    win.webContents.send("files:opened", await openPath(path));
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: "error",
      message: "Could not open PDF",
      detail: String(error),
    });
  }
}
function registerIPC() {
  ipcMain.handle("clipboard:write-text", (event, value: unknown) => {
    trusted(event);
    if (typeof value !== "string" || value.length > 10 * 1024 * 1024)
      throw new Error("Text is too large to copy.");
    clipboard.writeText(value);
  });
  ipcMain.handle("files:open", async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
    });
    return result.canceled ? null : openPath(result.filePaths[0]);
  });
  ipcMain.handle("files:pick-pdf", async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(win, {
      title: "Choose a PDF",
      properties: ["openFile"],
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const { bytes } = await readPDF(result.filePaths[0]);
    return { id: null, name: basename(result.filePaths[0]), bytes };
  });
  ipcMain.handle("files:recents", (event) => {
    trusted(event);
    return recentFiles.map(({ id, name, date }) => ({ id, name, date }));
  });
  ipcMain.handle("files:clear-recents", async (event) => {
    trusted(event);
    await writeJSON(recentsPath(), []);
    recentFiles = [];
    app.clearRecentDocuments();
  });
  ipcMain.handle("files:recent", async (event, id: unknown) => {
    trusted(event);
    const entry = recentFiles.find((file) => file.id === id);
    if (!entry) throw new Error("This recent file is no longer available.");
    return openPath(entry.path);
  });
  ipcMain.handle("files:open-images", async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(win, {
      title: "Choose images in PDF page order",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "PNG and JPEG images", extensions: ["png", "jpg", "jpeg"] },
      ],
    });
    if (result.canceled) return null;
    if (result.filePaths.length < 1 || result.filePaths.length > 100)
      throw new Error("Choose between 1 and 100 images.");
    let total = 0;
    const images = [];
    for (const path of result.filePaths) {
      const info = await stat(path);
      if (!info.isFile() || info.size > 50 * 1024 * 1024)
        throw new Error(`${basename(path)} exceeds the 50 MB image limit.`);
      total += info.size;
      if (total > 250 * 1024 * 1024)
        throw new Error("Selected images exceed the 250 MB conversion limit.");
      const bytes = new Uint8Array(await readFile(path));
      const png =
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!png && !jpeg)
        throw new Error(`${basename(path)} is not a valid PNG or JPEG image.`);
      images.push({ name: basename(path), bytes });
    }
    return images;
  });
  ipcMain.handle(
    "image:prepare-signature",
    async (event, value: unknown, removeWhite: unknown) => {
      trusted(event);
      if (!(value instanceof Uint8Array) || value.length > 5 * 1024 * 1024)
        throw new Error("Choose a signature image under 5 MB.");
      const png = value.length >= 8 && value[0] === 0x89 && value[1] === 0x50;
      const jpeg =
        value.length >= 3 &&
        value[0] === 0xff &&
        value[1] === 0xd8 &&
        value[2] === 0xff;
      if (!png && !jpeg) throw new Error("Choose a valid PNG or JPEG image.");
      if (typeof removeWhite !== "boolean")
        throw new Error("Invalid signature preparation request.");
      return prepareSignatureNative(value, removeWhite);
    },
  );
  ipcMain.handle("files:convert-word", async (event) => {
    trusted(event);
    const picked = await dialog.showOpenDialog(win, {
      title: "Choose a Word document",
      properties: ["openFile"],
      filters: [{ name: "Word documents", extensions: ["docx", "doc"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const source = picked.filePaths[0];
    const info = await stat(source);
    if (!info.isFile() || info.size > 100 * 1024 * 1024)
      throw new Error("Choose a Word document smaller than 100 MB.");
    const folder = await mkdtemp(join(tmpdir(), "openpdf-word-"));
    const output = join(
      folder,
      basename(source).replace(/\.(docx?|DOCX?)$/, "") + ".pdf",
    );
    let engine = "";
    try {
      const soffice = await firstAvailable([
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice",
      ]);
      if (soffice) {
        await runLocalTool(soffice, [
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          folder,
          source,
        ]);
        engine = "LibreOffice";
      } else if (await firstAvailable(["/Applications/Pages.app"])) {
        const script = `on run argv\nset inputPath to item 1 of argv\nset outputPath to item 2 of argv\ntell application "Pages"\nset theDocument to open POSIX file inputPath\nexport theDocument to POSIX file outputPath as PDF\nclose theDocument saving no\nend tell\nend run`;
        await runLocalTool("/usr/bin/osascript", [
          "-e",
          script,
          source,
          output,
        ]);
        engine = "Apple Pages";
      } else {
        throw new Error(
          "Word conversion requires LibreOffice or Apple Pages on this Mac.",
        );
      }
      const converted = await readPDF(output);
      const saved = await dialog.showSaveDialog(win, {
        title: "Save converted PDF",
        defaultPath: basename(output),
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
      });
      if (saved.canceled || !saved.filePath) return null;
      await atomicSave(saved.filePath, converted.bytes, null);
      return { ...(await openPath(saved.filePath)), engine };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  ipcMain.handle("files:convert-presentation", async (event) => {
    trusted(event);
    const picked = await dialog.showOpenDialog(win, {
      title: "Choose a PowerPoint document",
      properties: ["openFile"],
      filters: [{ name: "PowerPoint documents", extensions: ["pptx", "ppt"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const source = picked.filePaths[0];
    const info = await stat(source);
    if (!info.isFile() || info.size > 100 * 1024 * 1024)
      throw new Error("Choose a PowerPoint document smaller than 100 MB.");
    const folder = await mkdtemp(join(tmpdir(), "openpdf-presentation-"));
    const output = join(
      folder,
      basename(source).replace(/\.pptx?$/i, "") + ".pdf",
    );
    let engine = "";
    try {
      const soffice = await firstAvailable([
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice",
      ]);
      if (soffice) {
        await runLocalTool(soffice, [
          `-env:UserInstallation=${pathToFileURL(join(folder, "profile")).href}`,
          "--headless",
          "--convert-to",
          "pdf:impress_pdf_Export",
          "--outdir",
          folder,
          source,
        ]);
        engine = "LibreOffice";
      } else if (await firstAvailable(["/Applications/Keynote.app"])) {
        const script = `on run argv\nset inputPath to item 1 of argv\nset outputPath to item 2 of argv\ntell application "Keynote"\nset theDocument to open POSIX file inputPath\nexport theDocument to POSIX file outputPath as PDF\nclose theDocument saving no\nend tell\nend run`;
        await runLocalTool("/usr/bin/osascript", [
          "-e",
          script,
          source,
          output,
        ]);
        engine = "Apple Keynote";
      } else {
        throw new Error(
          "PowerPoint conversion requires LibreOffice or Apple Keynote on this Mac.",
        );
      }
      const converted = await readPDF(output);
      const saved = await dialog.showSaveDialog(win, {
        title: "Save converted PDF",
        defaultPath: basename(output),
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
      });
      if (saved.canceled || !saved.filePath) return null;
      await atomicSave(saved.filePath, converted.bytes, null);
      return { ...(await openPath(saved.filePath)), engine };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  ipcMain.handle(
    "files:convert-pdf-pptx",
    async (event, pages: unknown, name: unknown) => {
      trusted(event);
      if (!Array.isArray(pages) || pages.length < 1 || pages.length > 100)
        throw new Error("PPTX conversion supports 1–100 pages.");
      const result = await dialog.showSaveDialog(win, {
        title: "Save PowerPoint presentation",
        defaultPath: `${basename(typeof name === "string" ? name : "Document").replace(/\.pdf$/i, "")}.pptx`,
        filters: [{ name: "PowerPoint presentation", extensions: ["pptx"] }],
      });
      if (result.canceled || !result.filePath) return false;
      await createPptx(pages, result.filePath);
      return true;
    },
  );
  ipcMain.handle(
    "files:convert-pdf-docx",
    async (event, pages: unknown, name: unknown, mode: unknown) => {
      trusted(event);
      if (
        !Array.isArray(pages) ||
        pages.length < 1 ||
        pages.length > 100 ||
        (mode !== "layout" && mode !== "editable")
      )
        throw new Error("Invalid DOCX conversion request.");
      const result = await dialog.showSaveDialog(win, {
        title: "Save Word document",
        defaultPath: `${basename(typeof name === "string" ? name : "Document").replace(/\.pdf$/i, "")}.docx`,
        filters: [{ name: "Word document", extensions: ["docx"] }],
      });
      if (result.canceled || !result.filePath) return false;
      await createDocx(
        pages as {
          image?: Uint8Array;
          text?: string;
          width: number;
          height: number;
        }[],
        result.filePath,
        mode,
      );
      return true;
    },
  );
  ipcMain.handle(
    "files:convert-markup",
    async (event, source: unknown, name: unknown, format: unknown) => {
      trusted(event);
      if (
        typeof source !== "string" ||
        typeof name !== "string" ||
        (format !== "markdown" && format !== "latex")
      )
        throw new Error("Invalid text conversion request.");
      const bytes = await markupToPDF(win, source, name, format);
      validateBytes(bytes);
      const result = await dialog.showSaveDialog(win, {
        title: `Save ${format === "markdown" ? "Markdown" : "LaTeX"} PDF`,
        defaultPath: `${basename(name).replace(/\.(md|markdown|tex)$/i, "") || "Document"}.pdf`,
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await atomicSave(result.filePath, bytes, null);
      return openPath(result.filePath);
    },
  );
  ipcMain.handle(
    "files:save",
    async (
      event,
      bytes: unknown,
      id: unknown,
      name: unknown,
      saveAs: unknown,
    ) => {
      trusted(event);
      validateBytes(bytes);
      let handle = typeof id === "string" ? handles.get(id) : undefined;
      let nextId = typeof id === "string" ? id : randomUUID();
      if (!handle || saveAs === true) {
        const result = await dialog.showSaveDialog(win, {
          defaultPath:
            typeof name === "string"
              ? basename(name).replace(/\.pdf$/i, "") + ".pdf"
              : "Untitled.pdf",
          filters: [{ name: "PDF document", extensions: ["pdf"] }],
        });
        if (result.canceled || !result.filePath) return null;
        handle = { path: result.filePath, stamp: await stamp(result.filePath) };
        nextId = randomUUID();
      }
      await atomicSave(handle.path, bytes, handle.stamp);
      handle.stamp = await stamp(handle.path);
      handles.set(nextId, handle);
      await remember(handle.path, nextId);
      return { id: nextId, name: basename(handle.path) };
    },
  );
  ipcMain.handle(
    "document:ocr",
    async (event, bytes: unknown, pages: unknown, language: unknown) => {
      trusted(event);
      validateBytes(bytes);
      if (
        !Array.isArray(pages) ||
        pages.length < 1 ||
        pages.length > 100 ||
        !pages.every(
          (page) => Number.isInteger(page) && page >= 1 && page <= 500,
        )
      )
        throw new Error("OCR supports 1–100 valid pages per run.");
      const safeLanguage =
        typeof language === "string" &&
        /^(auto|[a-z]{2,3}(?:-[A-Za-z]{2,4})?)$/.test(language)
          ? language
          : "auto";
      ocrProcesses.get(event.sender.id)?.kill("SIGTERM");
      const executable = app.isPackaged
        ? join(process.resourcesPath, "native", "openpdf-ocr")
        : resolve("build", "native", "openpdf-ocr");
      return new Promise((resolvePromise, reject) => {
        const child = spawn(executable, [
          "--pages",
          pages.join(","),
          "--language",
          safeLanguage,
        ]);
        ocrProcesses.set(event.sender.id, child);
        let stdout = Buffer.alloc(0);
        let stderr = "";
        const timeout = setTimeout(() => child.kill("SIGTERM"), 120000);
        child.stdout.on("data", (chunk: Buffer) => {
          stdout = Buffer.concat([stdout, chunk]);
          if (stdout.length > 15 * 1024 * 1024) child.kill("SIGTERM");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < 4000) stderr += chunk.toString();
        });
        child.on("error", (cause) => reject(cause));
        child.on("close", (code, signal) => {
          clearTimeout(timeout);
          if (ocrProcesses.get(event.sender.id) === child)
            ocrProcesses.delete(event.sender.id);
          if (code !== 0) {
            reject(
              new Error(
                signal
                  ? "OCR was cancelled."
                  : stderr.trim() || "Offline OCR failed.",
              ),
            );
            return;
          }
          try {
            const result = JSON.parse(stdout.toString("utf8"));
            if (!validOCRResult(result))
              throw new Error("Offline OCR returned an invalid result.");
            resolvePromise(result);
          } catch {
            reject(new Error("Offline OCR returned an invalid result."));
          }
        });
        child.stdin.on("error", () => {});
        child.stdin.end(Buffer.from(bytes));
      });
    },
  );
  ipcMain.on("document:ocr-cancel", (event) => {
    trusted(event);
    ocrProcesses.get(event.sender.id)?.kill("SIGTERM");
    ocrProcesses.delete(event.sender.id);
  });
  ipcMain.handle("files:export", async (event, files: unknown) => {
    trusted(event);
    if (!Array.isArray(files) || !files.length || files.length > 500)
      throw new Error("Invalid export.");
    let totalBytes = 0;
    for (const file of files) {
      if (
        !file ||
        typeof file.name !== "string" ||
        !(file.bytes instanceof Uint8Array)
      )
        throw new Error("Invalid export file.");
      if (/\.pdf$/i.test(file.name)) validateBytes(file.bytes);
      else {
        const png =
          /\.png$/i.test(file.name) &&
          file.bytes.length >= 8 &&
          file.bytes[0] === 0x89 &&
          file.bytes[1] === 0x50;
        const jpeg =
          /\.jpe?g$/i.test(file.name) &&
          file.bytes.length >= 3 &&
          file.bytes[0] === 0xff &&
          file.bytes[1] === 0xd8 &&
          file.bytes[2] === 0xff;
        if (!png && !jpeg)
          throw new Error(
            "Only valid PDF, PNG and JPEG exports are supported.",
          );
      }
      totalBytes += file.bytes.length;
    }
    if (totalBytes > 100 * 1024 * 1024)
      throw new Error("Export is limited to 100 MB at a time.");
    const result = await dialog.showOpenDialog(win, {
      title: "Choose a folder for exported files",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return false;
    const folder = join(
      result.filePaths[0],
      `OpenPDF export ${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`,
    );
    await mkdir(folder);
    for (const [index, file] of files.entries()) {
      const name =
        typeof file.name === "string"
          ? basename(file.name)
          : `Page ${index + 1}.pdf`;
      await atomicSave(join(folder, name), file.bytes, null, false);
    }
    return true;
  });
  ipcMain.handle(
    "files:export-markdown",
    async (event, markdown: unknown, name: unknown) => {
      trusted(event);
      if (typeof markdown !== "string" || markdown.length > 10 * 1024 * 1024)
        throw new Error("Markdown export is limited to 10 MB.");
      const safeName =
        typeof name === "string" && name.toLowerCase().endsWith(".md")
          ? basename(name)
          : "Document.md";
      const result = await dialog.showSaveDialog(win, {
        title: "Export Markdown",
        defaultPath: safeName,
        filters: [{ name: "Markdown document", extensions: ["md"] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeText(result.filePath, markdown);
      return true;
    },
  );
  ipcMain.handle("document:confirm", (event, name: unknown) => {
    trusted(event);
    return confirmClose(
      typeof name === "string" ? basename(name).slice(0, 255) : undefined,
    );
  });
  ipcMain.on("document:dirty", (event, value) => {
    trusted(event);
    dirty = value === true;
    win.setDocumentEdited(dirty);
  });
  ipcMain.on("window:close", (event) => {
    trusted(event);
    if (!dirty) win.close();
  });
  ipcMain.on("window:fullscreen", (event) => {
    trusted(event);
    win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on("window:print", (event) => {
    trusted(event);
    win.webContents.print({ printBackground: true }, () =>
      command("print-complete"),
    );
  });
  ipcMain.on("renderer:ready", (event) => {
    trusted(event);
    ready = true;
    void deliverPending();
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 930,
    minWidth: 980,
    minHeight: 650,
    title: "OpenPDF Studio",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 19, y: 22 },
    backgroundColor: "#f6f5f2",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const url = new URL(details.url);
      callback({
        cancel: !(
          devURL &&
          url.hostname === "127.0.0.1" &&
          url.port === "5173"
        ),
      });
    },
  );
  win.once("ready-to-show", () => win.show());
  let confirming = false;
  win.on("close", (event) => {
    if (!dirty) return;
    event.preventDefault();
    if (confirming) return;
    confirming = true;
    void confirmClose()
      .then((answer) => {
        if (answer === "discard") {
          dirty = false;
          win.close();
        } else if (answer === "save") command("save-and-close");
      })
      .finally(() => {
        confirming = false;
      });
  });
  void win.loadURL(devURL ?? "studio://app/index.html");
}
app.on("open-file", (event, path) => {
  event.preventDefault();
  pendingFile = path;
  if (app.isReady()) void deliverPending();
});
app.whenReady().then(async () => {
  const root = resolve(__dirname, "../out/renderer");
  protocol.handle("studio", (request) => {
    const url = new URL(request.url);
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (url.host !== "app" || !path.startsWith(root + sep))
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(path).toString());
  });
  try {
    const data = JSON.parse(await readFile(recentsPath(), "utf8"));
    if (Array.isArray(data))
      recentFiles = data
        .filter((x) => typeof x.path === "string" && typeof x.id === "string")
        .slice(0, 10);
  } catch {
    /* First launch. */
  }
  registerIPC();
  createWindow();
  const item = (
    label: string,
    accelerator: string | undefined,
    action: string,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => command(action),
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "OpenPDF Studio",
        submenu: [
          item("About OpenPDF Studio", undefined, "about"),
          { type: "separator" },
          item("Settings…", "CmdOrCtrl+,", "settings"),
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "File",
        submenu: [
          item("Open PDF…", "CmdOrCtrl+O", "open"),
          item("New Tab", "CmdOrCtrl+T", "new-tab"),
          item("Close Document", "CmdOrCtrl+W", "close"),
          item("Document Details…", "CmdOrCtrl+I", "properties"),
          { type: "separator" },
          item("Save", "CmdOrCtrl+S", "save"),
          item("Save As…", "CmdOrCtrl+Shift+S", "save-as"),
          { type: "separator" },
          item("Print…", "CmdOrCtrl+P", "print"),
        ],
      },
      {
        label: "Edit",
        submenu: [
          item("Undo", "CmdOrCtrl+Z", "undo"),
          item("Redo", "CmdOrCtrl+Shift+Z", "redo"),
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
          { type: "separator" },
          item("Find…", "CmdOrCtrl+F", "search"),
        ],
      },
      {
        label: "View",
        submenu: [
          item("Zoom In", "CmdOrCtrl+Plus", "zoom-in"),
          item("Zoom Out", "CmdOrCtrl+-", "zoom-out"),
          item("Fit Page", "CmdOrCtrl+0", "fit-page"),
          item("Table of Contents", undefined, "contents"),
          { role: "togglefullscreen" },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
        ],
      },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
    ]),
  );
});
app.on("window-all-closed", () => app.quit());
