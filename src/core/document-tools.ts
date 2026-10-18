import * as mupdf from "mupdf";
import type {
  ExportedFile,
  FormField,
  MetadataInput,
  PrivacyReport,
} from "../types";
import {
  copyPage,
  extract,
  inspectDocument,
  openPDF,
  serializePDF,
} from "./pdf";

const safeBase = (name: string) =>
  (
    name
      .replace(/\.pdf$/i, "")
      .replace(/[^\p{L}\p{N}._ -]+/gu, "")
      .trim() || "Document"
  ).slice(0, 90);

function pdfResult(doc: mupdf.PDFDocument) {
  return { bytes: serializePDF(doc), info: inspectDocument(doc) };
}

export function updateMetadata(bytes: Uint8Array, values: MetadataInput) {
  const doc = openPDF(bytes);
  try {
    const keys = {
      title: "info:Title",
      author: "info:Author",
      subject: "info:Subject",
      keywords: "info:Keywords",
      creator: "info:Creator",
    } as const;
    for (const [key, pdfKey] of Object.entries(keys)) {
      const value = values[key as keyof MetadataInput];
      if (typeof value !== "string" || value.length > 2000)
        throw new Error("Metadata fields must be 2,000 characters or fewer.");
      doc.setMetaData(pdfKey, value.trim());
    }
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    doc.setMetaData(
      "info:ModDate",
      `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`,
    );
    return pdfResult(doc);
  } finally {
    doc.destroy();
  }
}

export function listFormFields(bytes: Uint8Array): FormField[] {
  const doc = openPDF(bytes);
  try {
    const result: FormField[] = [];
    for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex++) {
      const page = doc.loadPage(pageIndex);
      const widgets = page.getWidgets();
      try {
        widgets.forEach((widget, widgetIndex) => {
          const type = widget.getFieldType();
          result.push({
            id: `${pageIndex}:${widgetIndex}`,
            page: pageIndex,
            name: widget.getName() || `Field ${result.length + 1}`,
            label:
              widget.getLabel() ||
              widget.getName() ||
              `Field ${result.length + 1}`,
            type,
            value: widget.getValue() || "",
            options: widget.isChoice() ? widget.getOptions(false) : [],
            readOnly: widget.isReadOnly(),
          });
        });
      } finally {
        widgets.forEach((widget) => widget.destroy());
        page.destroy();
      }
    }
    return result;
  } finally {
    doc.destroy();
  }
}

export function fillForm(bytes: Uint8Array, values: Record<string, string>) {
  const doc = openPDF(bytes);
  try {
    for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex++) {
      const page = doc.loadPage(pageIndex);
      const widgets = page.getWidgets();
      try {
        widgets.forEach((widget, widgetIndex) => {
          const value = values[`${pageIndex}:${widgetIndex}`];
          if (value === undefined || widget.isReadOnly()) return;
          if (value.length > 10_000)
            throw new Error("A form value exceeds 10,000 characters.");
          let accepted = 0;
          if (widget.isText()) accepted = widget.setTextValue(value);
          else if (widget.isChoice()) accepted = widget.setChoiceValue(value);
          else if (widget.isCheckbox() || widget.isRadioButton()) {
            const isOn = !["", "0", "false", "off", "no"].includes(
              value.toLowerCase(),
            );
            const currentlyOn = !["", "Off", "0"].includes(widget.getValue());
            accepted = isOn === currentlyOn ? 1 : widget.toggle();
          }
          if (!accepted && value !== widget.getValue())
            throw new Error(
              `Could not update ${widget.getName() || "a form field"}.`,
            );
        });
        page.update();
      } finally {
        widgets.forEach((widget) => widget.destroy());
        page.destroy();
      }
    }
    return pdfResult(doc);
  } finally {
    doc.destroy();
  }
}

export function addBatesNumbers(
  bytes: Uint8Array,
  options: {
    prefix: string;
    suffix: string;
    start: number;
    digits: number;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  },
) {
  const doc = openPDF(bytes);
  try {
    const start = Math.max(0, Math.floor(options.start));
    const digits = Math.max(1, Math.min(12, Math.floor(options.digits)));
    if (options.prefix.length + options.suffix.length > 200)
      throw new Error("Bates prefix and suffix are too long.");
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.loadPage(index);
      const bounds = page.getBounds();
      const text = `${options.prefix}${String(start + index).padStart(digits, "0")}${options.suffix}`;
      const width = Math.min(220, Math.max(88, text.length * 6.4));
      const left = options.position.endsWith("right")
        ? bounds[2] - width - 24
        : bounds[0] + 24;
      const top = options.position.startsWith("top")
        ? bounds[1] + 20
        : bounds[3] - 42;
      const annotation = page.createAnnotation("FreeText");
      try {
        annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
        annotation.setRect([left, top, left + width, top + 22]);
        annotation.setDefaultAppearance("Helv", 9, [0.18, 0.2, 0.19]);
        annotation.setBorderWidth(0);
        annotation.setContents(text);
        annotation.update();
      } finally {
        annotation.destroy();
        page.destroy();
      }
    }
    return pdfResult(doc);
  } finally {
    doc.destroy();
  }
}

export function alternateMix(
  firstBytes: Uint8Array,
  secondBytes: Uint8Array,
  firstOrder: boolean,
) {
  const first = openPDF(firstBytes);
  const second = openPDF(secondBytes);
  const output = new mupdf.PDFDocument();
  try {
    const max = Math.max(first.countPages(), second.countPages());
    if (first.countPages() + second.countPages() > 500)
      throw new Error("The mixed PDF would exceed 500 pages.");
    const documents = firstOrder ? [first, second] : [second, first];
    for (let index = 0; index < max; index++) {
      for (const doc of documents)
        if (index < doc.countPages()) copyPage(output, -1, doc, index);
    }
    return pdfResult(output);
  } finally {
    output.destroy();
    second.destroy();
    first.destroy();
  }
}

function renderPageImage(page: mupdf.PDFPage, scale = 2) {
  const pixmap = page.toPixmap(
    [scale, 0, 0, scale, 0, 0],
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  );
  return pixmap;
}

export function mirrorPages(
  bytes: Uint8Array,
  direction: "horizontal" | "vertical" | "both",
) {
  const source = openPDF(bytes);
  const output = new mupdf.PDFDocument();
  try {
    for (let index = 0; index < source.countPages(); index++) {
      const page = source.loadPage(index);
      const bounds = page.getBounds();
      const width = bounds[2] - bounds[0];
      const height = bounds[3] - bounds[1];
      const pixmap = renderPageImage(page);
      const image = new mupdf.Image(pixmap);
      const ref = output.addImage(image);
      const horizontal = direction === "horizontal" || direction === "both";
      const vertical = direction === "vertical" || direction === "both";
      const matrix = `${horizontal ? -width : width} 0 0 ${vertical ? -height : height} ${horizontal ? width : 0} ${vertical ? height : 0}`;
      const pageRef = output.addPage(
        [0, 0, width, height],
        0,
        { XObject: { Im0: ref } },
        `q ${matrix} cm /Im0 Do Q`,
      );
      output.insertPage(-1, pageRef);
      pageRef.destroy();
      ref.destroy();
      image.destroy();
      pixmap.destroy();
      page.destroy();
    }
    return pdfResult(output);
  } finally {
    output.destroy();
    source.destroy();
  }
}

export function pagesPerSheet(bytes: Uint8Array, perSheet: 2 | 4 | 6 | 9) {
  const source = openPDF(bytes);
  const output = new mupdf.PDFDocument();
  try {
    const columns =
      perSheet === 2 ? 1 : perSheet === 6 ? 2 : Math.sqrt(perSheet);
    const rows = Math.ceil(perSheet / columns);
    const sheetWidth = 612;
    const sheetHeight = 792;
    const margin = 18;
    const gap = 10;
    for (let start = 0; start < source.countPages(); start += perSheet) {
      const resources: Record<string, mupdf.PDFObject> = {};
      const refs: mupdf.PDFObject[] = [];
      const cleanup: (mupdf.Pixmap | mupdf.Image | mupdf.PDFPage)[] = [];
      let content = "q 1 1 1 rg 0 0 612 792 re f Q\n";
      try {
        for (
          let offset = 0;
          offset < perSheet && start + offset < source.countPages();
          offset++
        ) {
          const page = source.loadPage(start + offset);
          const pixmap = renderPageImage(page, 1.5);
          const image = new mupdf.Image(pixmap);
          const ref = output.addImage(image);
          cleanup.push(page, pixmap, image);
          refs.push(ref);
          const name = `Im${offset}`;
          resources[name] = ref;
          const bounds = page.getBounds();
          const sourceWidth = bounds[2] - bounds[0];
          const sourceHeight = bounds[3] - bounds[1];
          const cellWidth =
            (sheetWidth - margin * 2 - gap * (columns - 1)) / columns;
          const cellHeight =
            (sheetHeight - margin * 2 - gap * (rows - 1)) / rows;
          const fit = Math.min(
            cellWidth / sourceWidth,
            cellHeight / sourceHeight,
          );
          const width = sourceWidth * fit;
          const height = sourceHeight * fit;
          const column = offset % columns;
          const row = Math.floor(offset / columns);
          const x =
            margin + column * (cellWidth + gap) + (cellWidth - width) / 2;
          const y =
            sheetHeight -
            margin -
            (row + 1) * cellHeight -
            row * gap +
            (cellHeight - height) / 2;
          content += `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q\n`;
        }
        const pageRef = output.addPage(
          [0, 0, sheetWidth, sheetHeight],
          0,
          { XObject: resources },
          content,
        );
        output.insertPage(-1, pageRef);
        pageRef.destroy();
      } finally {
        refs.forEach((ref) => ref.destroy());
        cleanup.reverse().forEach((item) => item.destroy());
      }
    }
    return pdfResult(output);
  } finally {
    output.destroy();
    source.destroy();
  }
}

export function splitDocument(
  bytes: Uint8Array,
  name: string,
  mode: "pages" | "size" | "half" | "chapter" | "text",
  value: string,
): ExportedFile[] {
  const doc = openPDF(bytes);
  try {
    const count = doc.countPages();
    const groups: number[][] = [];
    if (mode === "half") {
      const middle = Math.ceil(count / 2);
      groups.push(
        Array.from({ length: middle }, (_, i) => i),
        Array.from({ length: count - middle }, (_, i) => middle + i),
      );
    } else if (mode === "pages") {
      const size = Math.max(
        1,
        Math.min(count, Number.parseInt(value, 10) || 1),
      );
      for (let index = 0; index < count; index += size)
        groups.push(
          Array.from(
            { length: Math.min(size, count - index) },
            (_, i) => index + i,
          ),
        );
    } else if (mode === "chapter") {
      const starts = (doc.loadOutline() ?? [])
        .map((item) => item.page)
        .filter(
          (page): page is number =>
            Number.isInteger(page) && page! >= 0 && page! < count,
        )
        .filter((page, index, all) => all.indexOf(page) === index)
        .sort((a, b) => a - b);
      if (!starts.length) throw new Error("This PDF has no chapter bookmarks.");
      if (starts[0] !== 0) starts.unshift(0);
      starts.forEach((start, index) => {
        const end = starts[index + 1] ?? count;
        groups.push(Array.from({ length: end - start }, (_, i) => start + i));
      });
    } else if (mode === "text") {
      const query = value.trim().toLocaleLowerCase();
      if (!query) throw new Error("Enter the text that begins each section.");
      let current: number[] = [];
      for (let index = 0; index < count; index++) {
        const page = doc.loadPage(index);
        const text = page
          .toStructuredText("preserve-whitespace")
          .asText()
          .toLocaleLowerCase();
        page.destroy();
        if (current.length && text.includes(query)) {
          groups.push(current);
          current = [];
        }
        current.push(index);
      }
      if (current.length) groups.push(current);
    } else {
      const maxBytes =
        Math.max(1, Math.min(49, Number.parseFloat(value) || 5)) * 1024 * 1024;
      let current: number[] = [];
      for (let index = 0; index < count; index++) {
        const candidate = [...current, index];
        if (current.length && extract(bytes, candidate).length > maxBytes) {
          groups.push(current);
          current = [index];
        } else current = candidate;
      }
      if (current.length) groups.push(current);
    }
    const base = safeBase(name);
    return groups
      .filter((group) => group.length)
      .map((group, index) => ({
        name: `${base} ${String(index + 1).padStart(2, "0")} (pages ${group[0] + 1}-${group.at(-1)! + 1}).pdf`,
        bytes: extract(bytes, group),
      }));
  } finally {
    doc.destroy();
  }
}

export function extractImages(bytes: Uint8Array, name: string): ExportedFile[] {
  const doc = openPDF(bytes);
  const files: ExportedFile[] = [];
  const seen = new Set<number>();
  let directObject = -1;
  try {
    const walk = (xobjects: mupdf.PDFObject, pageIndex: number, depth = 0) => {
      if (depth > 12 || !xobjects.isDictionary()) return;
      xobjects.forEach((object) => {
        const resolved = object.resolve();
        try {
          const id = object.isIndirect() ? object.asIndirect() : directObject--;
          if (seen.has(id)) return;
          seen.add(id);
          const subtype = resolved.get("Subtype").asName();
          if (subtype === "Form") {
            const nested = resolved.get("Resources", "XObject");
            try {
              walk(nested, pageIndex, depth + 1);
            } finally {
              nested.destroy();
            }
            return;
          }
          if (subtype !== "Image") return;
          const image = doc.loadImage(object);
          const pixmap = image.toPixmap();
          try {
            files.push({
              name: `${safeBase(name)} page ${pageIndex + 1} image ${files.length + 1}.png`,
              bytes: new Uint8Array(pixmap.asPNG()).slice(),
            });
          } finally {
            pixmap.destroy();
            image.destroy();
          }
        } finally {
          resolved.destroy();
        }
      });
    };
    for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex++) {
      const page = doc.findPage(pageIndex);
      const resources = page.getInheritable("Resources");
      const xobjects = resources.get("XObject");
      try {
        walk(xobjects, pageIndex);
      } finally {
        xobjects.destroy();
        resources.destroy();
        page.destroy();
      }
    }
    if (!files.length)
      throw new Error("No embedded images were found in this PDF.");
    return files;
  } finally {
    doc.destroy();
  }
}

export function unlockPDF(bytes: Uint8Array, password: string) {
  const doc = openPDF(bytes, password);
  try {
    const buffer = doc.saveToBuffer("garbage=4,compress,encrypt=none");
    try {
      const output = buffer.asUint8Array().slice();
      return { bytes: output, info: inspectDocument(doc) };
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}

export function docxPages(bytes: Uint8Array, mode: "layout" | "editable") {
  const doc = openPDF(bytes);
  try {
    if (doc.countPages() > 100)
      throw new Error(
        "Presentation and Word export support up to 100 pages per conversion.",
      );
    return Array.from({ length: doc.countPages() }, (_, index) => {
      const page = doc.loadPage(index);
      try {
        const bounds = page.getBounds();
        if (mode === "editable") {
          const structured = page.toStructuredText("preserve-whitespace");
          try {
            return {
              text: structured.asText(),
              width: bounds[2] - bounds[0],
              height: bounds[3] - bounds[1],
            };
          } finally {
            structured.destroy();
          }
        }
        const pixmap = renderPageImage(page, 2);
        try {
          return {
            image: new Uint8Array(pixmap.asPNG()).slice(),
            width: bounds[2] - bounds[0],
            height: bounds[3] - bounds[1],
          };
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    });
  } finally {
    doc.destroy();
  }
}

export function optimizePDF(bytes: Uint8Array) {
  const doc = openPDF(bytes);
  try {
    doc.subsetFonts();
    const buffer = doc.saveToBuffer({
      garbage: 4,
      clean: true,
      sanitize: true,
      compress: true,
      "compress-images": true,
      "compress-fonts": true,
      "compression-effort": 100,
    });
    try {
      const output = buffer.asUint8Array().slice();
      return { bytes: output, info: inspectDocument(doc) };
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}

export function pdfPagesToImages(
  bytes: Uint8Array,
  name: string,
  format: "png" | "jpg",
  dpi: number,
  quality: number,
): ExportedFile[] {
  const doc = openPDF(bytes);
  try {
    if (doc.countPages() > 100)
      throw new Error("PDF image export supports up to 100 pages at a time.");
    const safeDpi = Math.max(72, Math.min(600, Math.round(dpi) || 144));
    const safeQuality = Math.max(35, Math.min(100, Math.round(quality) || 90));
    const digits = Math.max(3, String(doc.countPages()).length);
    return Array.from({ length: doc.countPages() }, (_, index) => {
      const page = doc.loadPage(index);
      try {
        const pixmap = renderPageImage(page, safeDpi / 72);
        try {
          const output =
            format === "png"
              ? pixmap.asPNG()
              : pixmap.asJPEG(safeQuality, true);
          return {
            name: `${safeBase(name)} page ${String(index + 1).padStart(digits, "0")}.${format}`,
            bytes: new Uint8Array(output).slice(),
          };
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    });
  } finally {
    doc.destroy();
  }
}

export function encryptPDF(bytes: Uint8Array, password: string) {
  if (password.length < 4 || password.length > 128)
    throw new Error("Use a password between 4 and 128 characters.");
  if (/[,\r\n]/.test(password))
    throw new Error("The password cannot contain commas or new lines.");
  const doc = openPDF(bytes);
  try {
    const buffer = doc.saveToBuffer({
      garbage: 4,
      compress: true,
      encrypt: "aes-256",
      "user-password": password,
      "owner-password": password,
    });
    try {
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}

export function flattenPDF(bytes: Uint8Array) {
  const doc = openPDF(bytes);
  try {
    doc.bake(true, true);
    return pdfResult(doc);
  } finally {
    doc.destroy();
  }
}

export function cropResizePDF(
  bytes: Uint8Array,
  marginPercent: number,
  size: "keep" | "a4" | "letter",
) {
  const doc = openPDF(bytes);
  const margin = Math.max(0, Math.min(40, marginPercent || 0)) / 100;
  try {
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.findPage(index);
      try {
        const box = page.get("CropBox");
        let bounds: number[];
        try {
          if (box.isArray()) {
            bounds = Array.from({ length: 4 }, (_, i) => {
              const value = box.get(i);
              try {
                return value.asNumber();
              } finally {
                value.destroy();
              }
            });
          } else {
            const loaded = doc.loadPage(index);
            try {
              bounds = loaded.getBounds();
            } finally {
              loaded.destroy();
            }
          }
        } finally {
          box.destroy();
        }
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];
        page.put("CropBox", [
          bounds[0] + width * margin,
          bounds[1] + height * margin,
          bounds[2] - width * margin,
          bounds[3] - height * margin,
        ]);
      } finally {
        page.destroy();
      }
    }
    if (size === "keep") return pdfResult(doc);
    const output = new mupdf.PDFDocument();
    try {
      const target = size === "a4" ? [595, 842] : [612, 792];
      for (let index = 0; index < doc.countPages(); index++) {
        const page = doc.loadPage(index);
        const bounds = page.getBounds();
        const pixmap = renderPageImage(page, 2);
        const image = new mupdf.Image(pixmap);
        const ref = output.addImage(image);
        try {
          const sourceWidth = bounds[2] - bounds[0];
          const sourceHeight = bounds[3] - bounds[1];
          const scale = Math.min(
            target[0] / sourceWidth,
            target[1] / sourceHeight,
          );
          const width = sourceWidth * scale;
          const height = sourceHeight * scale;
          const x = (target[0] - width) / 2;
          const y = (target[1] - height) / 2;
          const pageRef = output.addPage(
            [0, 0, target[0], target[1]],
            0,
            { XObject: { Im0: ref } },
            `q 1 1 1 rg 0 0 ${target[0]} ${target[1]} re f Q q ${width} 0 0 ${height} ${x} ${y} cm /Im0 Do Q`,
          );
          output.insertPage(-1, pageRef);
          pageRef.destroy();
        } finally {
          ref.destroy();
          image.destroy();
          pixmap.destroy();
          page.destroy();
        }
      }
      return pdfResult(output);
    } finally {
      output.destroy();
    }
  } finally {
    doc.destroy();
  }
}

const privacyMetadata = [
  ["Title", "info:Title"],
  ["Author", "info:Author"],
  ["Subject", "info:Subject"],
  ["Keywords", "info:Keywords"],
  ["Creator", "info:Creator"],
  ["Producer", "info:Producer"],
] as const;

export function scanPrivacy(bytes: Uint8Array): PrivacyReport {
  const doc = openPDF(bytes);
  try {
    const embedded = doc.getEmbeddedFiles();
    const embeddedFiles = Object.keys(embedded);
    Object.values(embedded).forEach((object) => object.destroy());
    const report: PrivacyReport = {
      metadata: privacyMetadata
        .map(([key, pdfKey]) => ({ key, value: doc.getMetaData(pdfKey) || "" }))
        .filter((entry) => entry.value.trim()),
      embeddedFiles,
      formFields: 0,
      annotations: 0,
      externalLinks: 0,
      documentActions: [],
    };
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.loadPage(index);
      const annotations = page.getAnnotations();
      const widgets = page.getWidgets();
      const links = page.getLinks();
      try {
        report.annotations += annotations.length;
        report.formFields += widgets.length;
        report.externalLinks += links.filter((link) =>
          /^(https?|mailto|tel):/i.test(link.getURI()),
        ).length;
      } finally {
        annotations.forEach((item) => item.destroy());
        widgets.forEach((item) => item.destroy());
        links.forEach((item) => item.destroy());
        page.destroy();
      }
    }
    const trailer = doc.getTrailer();
    try {
      const checks = [
        ["Open action", ["Root", "OpenAction"]],
        ["Document additional actions", ["Root", "AA"]],
        ["JavaScript name tree", ["Root", "Names", "JavaScript"]],
      ] as const;
      for (const [label, path] of checks) {
        const object = trailer.get(...path);
        try {
          if (!object.isNull()) report.documentActions.push(label);
        } finally {
          object.destroy();
        }
      }
    } finally {
      trailer.destroy();
    }
    return report;
  } finally {
    doc.destroy();
  }
}

export function cleanPrivacy(bytes: Uint8Array) {
  const doc = openPDF(bytes);
  try {
    privacyMetadata.forEach(([, key]) => doc.setMetaData(key, ""));
    const embedded = doc.getEmbeddedFiles();
    const embeddedFiles = Object.keys(embedded);
    Object.values(embedded).forEach((object) => object.destroy());
    embeddedFiles.forEach((name) => doc.deleteEmbeddedFile(name));
    const trailer = doc.getTrailer();
    const root = trailer.get("Root");
    try {
      root.delete("OpenAction");
      root.delete("AA");
      const names = root.get("Names");
      try {
        if (names.isDictionary()) names.delete("JavaScript");
      } finally {
        names.destroy();
      }
    } finally {
      root.destroy();
      trailer.destroy();
    }
    return pdfResult(doc);
  } finally {
    doc.destroy();
  }
}
