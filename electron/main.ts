import {
  app,
  BrowserWindow,
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
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { atomicSave, readPDF, stamp, validateBytes, writeJSON } from "./files";

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
async function confirmClose(): Promise<"save" | "discard" | "cancel"> {
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "Save your changes?",
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
  ipcMain.handle("files:open", async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
    });
    return result.canceled ? null : openPath(result.filePaths[0]);
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
  ipcMain.handle("files:export", async (event, files: unknown) => {
    trusted(event);
    if (!Array.isArray(files) || !files.length || files.length > 500)
      throw new Error("Invalid export.");
    let totalBytes = 0;
    for (const file of files) {
      validateBytes(file.bytes);
      totalBytes += file.bytes.length;
    }
    if (totalBytes > 100 * 1024 * 1024)
      throw new Error("Export is limited to 100 MB at a time.");
    const result = await dialog.showOpenDialog(win, {
      title: "Choose a folder for extracted PDFs",
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
      await atomicSave(join(folder, name), file.bytes, null);
    }
    return true;
  });
  ipcMain.handle("document:confirm", (event) => {
    trusted(event);
    return confirmClose();
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
