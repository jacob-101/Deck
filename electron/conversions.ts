import bodyFont from "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2";
import headingFont from "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2";
import pptxgen from "pptxgenjs";
import { BrowserWindow } from "electron";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function run(
  executable: string,
  args: string[],
  cwd?: string,
  timeoutMs = 120000,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        openin_any: "p",
        openout_any: "p",
        shell_escape: "f",
      },
    });
    let error = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      if (error.length < 6000) error += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(new Error(error.trim() || "Local conversion failed."));
    });
  });
}

export async function createDocx(
  pages: { image?: Uint8Array; text?: string; width: number; height: number }[],
  output: string,
  mode: "layout" | "editable",
) {
  if (!pages.length || pages.length > 100)
    throw new Error("DOCX conversion supports 1–100 pages.");
  let total = 0;
  for (const page of pages) {
    if (
      !page ||
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width < 1 ||
      page.height < 1 ||
      page.width > 20_000 ||
      page.height > 20_000
    )
      throw new Error("A DOCX page has invalid dimensions.");
    if (mode === "layout") {
      if (
        !(page.image instanceof Uint8Array) ||
        page.image.length > 30 * 1024 * 1024
      )
        throw new Error("A rendered page image is invalid.");
      total += page.image.length;
    } else {
      if (typeof page.text !== "string" || page.text.length > 2 * 1024 * 1024)
        throw new Error("A DOCX text page is invalid.");
      total += page.text.length;
    }
  }
  if (total > 250 * 1024 * 1024)
    throw new Error("The DOCX export exceeds the 250 MB conversion limit.");
  const folder = await mkdtemp(join(tmpdir(), "openpdf-docx-"));
  try {
    await mkdir(join(folder, "_rels"), { recursive: true });
    await mkdir(join(folder, "word", "_rels"), { recursive: true });
    await mkdir(join(folder, "word", "media"), { recursive: true });
    const imageTypes =
      mode === "layout"
        ? '<Default Extension="png" ContentType="image/png"/>'
        : "";
    await writeFile(
      join(folder, "[Content_Types].xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageTypes}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    );
    await writeFile(
      join(folder, "_rels", ".rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    const relationships: string[] = [];
    const body: string[] = [];
    for (const [index, page] of pages.entries()) {
      if (mode === "layout") {
        if (
          !(page.image instanceof Uint8Array) ||
          page.image.length > 30 * 1024 * 1024
        )
          throw new Error("A rendered page image is invalid.");
        const filename = `page-${index + 1}.png`;
        await writeFile(join(folder, "word", "media", filename), page.image);
        relationships.push(
          `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`,
        );
        const maxW = 5_943_600;
        const maxH = 8_229_600;
        const fit = Math.min(
          maxW / Math.max(1, page.width),
          maxH / Math.max(1, page.height),
        );
        const cx = Math.round(page.width * fit);
        const cy = Math.round(page.height * fit);
        body.push(
          `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index + 1}" name="PDF page ${index + 1}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${index + 2}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
        );
      } else {
        const lines = (page.text || "").replace(/\r/g, "").split("\n");
        for (const line of lines)
          body.push(
            `<w:p><w:r><w:t xml:space="preserve">${xml(line || " ")}</w:t></w:r></w:p>`,
          );
      }
      if (index < pages.length - 1)
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    await writeFile(
      join(folder, "word", "_rels", "document.xml.rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships.join("")}</Relationships>`,
    );
    await writeFile(
      join(folder, "word", "styles.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`,
    );
    await writeFile(
      join(folder, "word", "document.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`,
    );
    // zip updates archives in place. Remove an existing destination first so a
    // shorter re-export cannot retain stale media entries from the old DOCX.
    await rm(output, { force: true });
    await run("/usr/bin/zip", ["-q", "-r", output, "."], folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const safeInline = (value: string) =>
  xml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

function markdownHTML(source: string) {
  const lines = source.replace(/\r/g, "").split("\n");
  const output: string[] = [];
  let inCode = false;
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      output.push(xml(line) + "\n");
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const item = line.match(/^\s*[-*+]\s+(.+)$/);
    if (item) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }
      output.push(`<li>${safeInline(item[1])}</li>`);
      continue;
    }
    if (inList) {
      output.push("</ul>");
      inList = false;
    }
    if (heading)
      output.push(
        `<h${heading[1].length}>${safeInline(heading[2])}</h${heading[1].length}>`,
      );
    else if (/^---+$/.test(line.trim())) output.push("<hr>");
    else if (line.startsWith("> "))
      output.push(`<blockquote>${safeInline(line.slice(2))}</blockquote>`);
    else if (!line.trim()) output.push("<div class=space></div>");
    else output.push(`<p>${safeInline(line)}</p>`);
  }
  if (inList) output.push("</ul>");
  if (inCode) output.push("</code></pre>");
  return output.join("\n");
}

function latexFallbackHTML(source: string) {
  let body = xml(source)
    .replace(/\\section\{([^}]+)\}/g, "<h1>$1</h1>")
    .replace(/\\subsection\{([^}]+)\}/g, "<h2>$1</h2>")
    .replace(/\\textbf\{([^}]+)\}/g, "<strong>$1</strong>")
    .replace(/\\emph\{([^}]+)\}/g, "<em>$1</em>")
    .replace(/\\item\s+/g, "<br>• ")
    .replace(/\\\\/g, "<br>")
    .replace(/\$([^$]+)\$/g, '<span class="math">$1</span>')
    .replace(
      /\\begin\{[^}]+\}|\\end\{[^}]+\}|\\documentclass(?:\[[^\]]*\])?\{[^}]+\}|\\usepackage(?:\[[^\]]*\])?\{[^}]+\}|\\maketitle/g,
      "",
    )
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, " ");
  return `<p>${body}</p>`;
}

const pageHTML = (body: string, title: string) =>
  `<!doctype html><meta charset="utf-8"><title>${xml(title)}</title><style>@font-face{font-family:"DM Sans";font-style:normal;font-weight:400;src:url("${bodyFont}") format("woff2")}@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:800;src:url("${headingFont}") format("woff2")}@page{size:A4;margin:20mm 18mm}*{box-sizing:border-box}body{font:11.5pt/1.58 "DM Sans",-apple-system,system-ui,"Helvetica Neue",sans-serif;color:#0F1F44;margin:0}h1,h2,h3{font-family:"Plus Jakarta Sans","DM Sans",sans-serif;font-weight:800;letter-spacing:-.4pt}h1{font-size:27pt;line-height:1.15;margin:0 0 18pt}h2{font-size:20pt;margin:22pt 0 9pt}h3{font-size:15pt;margin:18pt 0 7pt}p{margin:0 0 9pt}ul{margin:0 0 12pt;padding-left:22pt}li{margin:3pt 0}blockquote{margin:12pt 0;padding:9pt 14pt;border-left:3px solid #1560E8;background:#EAF1FE;color:#0F1F44}pre{white-space:pre-wrap;background:#EEF4FD;padding:12pt;border-radius:6pt;font:9.5pt/1.45 ui-monospace,monospace}code,.math{font-family:ui-monospace,monospace}.math{padding:1pt 4pt;background:#EAF1FE;border-radius:3pt}a{color:#1560E8}a:visited{color:#5B6B8C}.space{height:6pt}hr{border:0;border-top:1px solid #D5E1F7;margin:18pt 0}</style><body>${body}</body>`;

async function printHTML(parent: BrowserWindow, html: string) {
  const view = new BrowserWindow({
    show: false,
    parent,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await view.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    await view.webContents.executeJavaScript(
      "document.fonts.ready.then(() => true)",
    );
    return new Uint8Array(
      await view.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
  } finally {
    view.destroy();
  }
}

export async function markupToPDF(
  parent: BrowserWindow,
  source: string,
  name: string,
  format: "markdown" | "latex",
) {
  if (!source.trim() || source.length > 5 * 1024 * 1024)
    throw new Error("Enter between 1 character and 5 MB of text.");
  if (format === "latex") {
    const engines = [
      "/Library/TeX/texbin/xelatex",
      "/Library/TeX/texbin/pdflatex",
    ];
    for (const engine of engines) {
      try {
        await access(engine);
        const folder = await mkdtemp(join(tmpdir(), "openpdf-latex-"));
        try {
          const input = join(folder, "document.tex");
          await writeFile(input, source);
          const args = [
            "-no-shell-escape",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-output-directory",
            folder,
            input,
          ];
          await run(engine, args, folder);
          return new Uint8Array(await readFile(join(folder, "document.pdf")));
        } finally {
          await rm(folder, { recursive: true, force: true });
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        throw error;
      }
    }
  }
  const body =
    format === "markdown" ? markdownHTML(source) : latexFallbackHTML(source);
  return printHTML(parent, pageHTML(body, name));
}

export async function createPptx(
  pages: { image?: Uint8Array; width: number; height: number }[],
  output: string,
) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 100)
    throw new Error("PPTX conversion supports 1–100 pages.");
  let total = 0;
  for (const page of pages) {
    if (
      !page ||
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width < 1 ||
      page.height < 1 ||
      page.width > 20000 ||
      page.height > 20000
    )
      throw new Error("A PPTX page has invalid dimensions.");
    if (
      !(page.image instanceof Uint8Array) ||
      page.image.length > 30 * 1024 * 1024 ||
      !Buffer.from(page.image.subarray(0, 8)).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      )
    )
      throw new Error("A rendered page image is invalid.");
    total += page.image.length;
  }
  if (total > 250 * 1024 * 1024)
    throw new Error("The PPTX export exceeds the 250 MB conversion limit.");
  const deck = new pptxgen();
  // Keep slide dimensions within PowerPoint's supported range, preserving aspect ratio.
  const scale = Math.min(
    1 / 72,
    56 / Math.max(pages[0].width, pages[0].height),
  );
  const width = pages[0].width * scale;
  const height = pages[0].height * scale;
  deck.defineLayout({ name: "PDF", width, height });
  deck.layout = "PDF";
  deck.author = "OpenPDF Studio";
  deck.subject = "PDF pages preserved as slide images";
  for (const page of pages) {
    const fit = Math.min(width / page.width, height / page.height);
    const w = page.width * fit,
      h = page.height * fit;
    deck.addSlide().addImage({
      data: `image/png;base64,${Buffer.from(page.image!).toString("base64")}`,
      x: (width - w) / 2,
      y: (height - h) / 2,
      w,
      h,
      altText: "PDF page",
    });
  }
  const data = await deck.write({
    outputType: "nodebuffer",
    compression: true,
  });
  const { rename } = await import("node:fs/promises");
  const temporary = `${output}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data as Buffer, { flag: "wx" });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}
