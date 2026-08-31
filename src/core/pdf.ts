import * as mupdf from "mupdf";
import {
  MAX_FILE_SIZE,
  type DocumentInfo,
  type EditCommand,
  type AnnotationInput,
  type AnnotationPatch,
  type OutlineEntry,
} from "../types";

const editableTypes = new Set([
  "Text",
  "FreeText",
  "Line",
  "Square",
  "Circle",
  "Highlight",
  "Underline",
  "StrikeOut",
  "Ink",
  "Stamp",
]);
function annotationLocked(annotation: mupdf.PDFAnnotation) {
  return !!(
    annotation.getFlags() &
    (mupdf.PDFAnnotation.IS_READ_ONLY |
      mupdf.PDFAnnotation.IS_LOCKED |
      mupdf.PDFAnnotation.IS_LOCKED_CONTENTS)
  );
}

export function openPDF(bytes: Uint8Array, password?: string) {
  if (bytes.byteLength > MAX_FILE_SIZE)
    throw new Error("This release supports PDFs up to 50 MB.");
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("This is not a valid PDF file.");
  const doc = new mupdf.PDFDocument(bytes);
  if (doc.needsPassword()) {
    if (!password || !doc.authenticatePassword(password)) {
      doc.destroy();
      throw new Error(
        "Password-protected PDF. Enter the correct password to unlock it.",
      );
    }
  }
  doc.disableJS();
  if (doc.countPages() === 0 || doc.countPages() > 500) {
    doc.destroy();
    throw new Error("Choose a PDF with 1–500 pages.");
  }
  return doc;
}
export function serializePDF(doc: mupdf.PDFDocument) {
  const buffer = doc.saveToBuffer("garbage=4,compress");
  try {
    const bytes = buffer.asUint8Array().slice();
    if (bytes.length > MAX_FILE_SIZE)
      throw new Error(
        "The result exceeds the 50 MB limit. Try a smaller document.",
      );
    return bytes;
  } finally {
    buffer.destroy();
  }
}
function checkPage(doc: mupdf.PDFDocument, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= doc.countPages())
    throw new Error("Page no longer exists.");
}
function readOutline(
  doc: mupdf.PDFDocument,
): Pick<DocumentInfo, "outline" | "outlineNotice"> {
  let remaining = 2000;
  let truncated = false;
  type Item = NonNullable<ReturnType<typeof doc.loadOutline>>[number];
  const walk = (items: Item[], prefix = "", depth = 0): OutlineEntry[] => {
    if (depth >= 20) {
      truncated ||= items.length > 0;
      return [];
    }
    const result: OutlineEntry[] = [];
    for (const [index, item] of items.entries()) {
      if (--remaining < 0) {
        truncated = true;
        break;
      }
      const id = `${prefix}${index}`;
      const page =
        item.uri?.startsWith("#") &&
        typeof item.page === "number" &&
        Number.isInteger(item.page) &&
        item.page >= 0 &&
        item.page < doc.countPages()
          ? item.page
          : null;
      result.push({
        id,
        title: item.title?.slice(0, 300) || "Untitled section",
        page,
        open: item.open,
        children: walk(item.down ?? [], `${id}.`, depth + 1),
      });
    }
    return result;
  };
  try {
    const outline = walk(doc.loadOutline() ?? []);
    return {
      outline,
      outlineNotice: truncated
        ? "Showing the first 2,000 entries and 20 levels of this contents list."
        : null,
    };
  } catch {
    return {
      outline: [],
      outlineNotice:
        "This PDF’s contents list could not be read. You can still navigate by page.",
    };
  }
}
export function inspectPage(doc: mupdf.PDFDocument, index: number) {
  const page = doc.loadPage(index);
  const object = page.getObject();
  const rotate = object.getInheritable("Rotate");
  const annots = page.getAnnotations();
  try {
    const bounds = page.getBounds();
    return {
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1],
      rotation: rotate.asNumber() || 0,
      annotations: annots.map((annotation, id) => {
        const isFreeText = annotation.getType() === "FreeText";
        const appearance = isFreeText
          ? annotation.getDefaultAppearance()
          : null;
        const background = isFreeText ? annotation.getColor() : [];
        const rect = annotation.hasRect() ? annotation.getRect() : [0, 0, 0, 0];
        return {
          id,
          type: annotation.getType(),
          contents: annotation.getContents(),
          color: isFreeText ? appearance!.color : annotation.getColor(),
          fontSize: isFreeText ? appearance!.size : null,
          font: isFreeText ? appearance!.font : null,
          fillColor: isFreeText && background.length ? background : null,
          rect: [rect[0], rect[1], rect[2], rect[3]],
          width: annotation.hasBorder() ? annotation.getBorderWidth() : null,
          editable:
            editableTypes.has(annotation.getType()) &&
            !annotationLocked(annotation),
          locked: annotationLocked(annotation),
        };
      }),
    };
  } finally {
    for (const annotation of annots) annotation.destroy();
    rotate.destroy();
    object.destroy();
    page.destroy();
  }
}
export function inspectDocument(doc: mupdf.PDFDocument): DocumentInfo {
  return {
    title: doc.getMetaData("info:Title") ?? "",
    author: doc.getMetaData("info:Author") ?? "",
    subject: doc.getMetaData("info:Subject") ?? "",
    creator: doc.getMetaData("info:Creator") ?? "",
    producer: doc.getMetaData("info:Producer") ?? "",
    format: doc.getMetaData("format") ?? "PDF",
    ...readOutline(doc),
    pages: Array.from({ length: doc.countPages() }, (_, index) =>
      inspectPage(doc, index),
    ),
  };
}
export function inspect(bytes: Uint8Array): DocumentInfo {
  const doc = openPDF(bytes);
  try {
    return inspectDocument(doc);
  } finally {
    doc.destroy();
  }
}
function updateAnnotation(
  annotation: mupdf.PDFAnnotation,
  patch: AnnotationPatch,
) {
  const type = annotation.getType();
  if (annotationLocked(annotation))
    throw new Error("This annotation is locked by the document.");
  if (!editableTypes.has(type))
    throw new Error("Editing this annotation type is not supported yet.");
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    !Object.keys(patch).length ||
    Object.keys(patch).some(
      (key) =>
        ![
          "contents",
          "color",
          "width",
          "fontSize",
          "font",
          "fillColor",
          "rect",
        ].includes(key),
    )
  )
    throw new Error("No annotation changes supplied.");
  if (patch.contents !== undefined) {
    if (typeof patch.contents !== "string" || patch.contents.length > 5000)
      throw new Error("Annotation text must be 5,000 characters or fewer.");
    if ((type === "Text" || type === "FreeText") && !patch.contents.trim())
      throw new Error("Add some text first.");
  }
  if (
    patch.color !== undefined &&
    (!Array.isArray(patch.color) ||
      patch.color.length !== 3 ||
      !patch.color.every((c) => Number.isFinite(c) && c >= 0 && c <= 1))
  )
    throw new Error("Choose a valid annotation color.");
  if (
    patch.fillColor !== undefined &&
    (type !== "FreeText" ||
      (patch.fillColor !== null &&
        (!Array.isArray(patch.fillColor) ||
          patch.fillColor.length !== 3 ||
          !patch.fillColor.every(
            (c) => Number.isFinite(c) && c >= 0 && c <= 1,
          ))))
  )
    throw new Error("Choose a valid text box background color.");
  if (
    patch.width !== undefined &&
    (!Number.isFinite(patch.width) ||
      patch.width < 0 ||
      patch.width > 20 ||
      !annotation.hasBorder())
  )
    throw new Error("Choose a line weight between 0 and 20 pt.");
  if (
    patch.fontSize !== undefined &&
    (!Number.isFinite(patch.fontSize) ||
      patch.fontSize < 6 ||
      patch.fontSize > 144)
  )
    throw new Error("Choose a font size between 6 and 144 pt.");
  if (
    patch.rect !== undefined &&
    (!Array.isArray(patch.rect) ||
      patch.rect.length !== 4 ||
      !patch.rect.every(Number.isFinite))
  )
    throw new Error("Invalid annotation position.");

  if (patch.contents !== undefined) annotation.setContents(patch.contents);
  if (
    patch.color !== undefined ||
    patch.fontSize !== undefined ||
    patch.font !== undefined
  ) {
    if (type === "FreeText") {
      const appearance = annotation.getDefaultAppearance();
      annotation.setDefaultAppearance(
        patch.font ?? appearance.font,
        patch.fontSize ?? appearance.size,
        (patch.color ?? appearance.color) as mupdf.AnnotColor,
      );
    } else if (patch.color !== undefined) {
      annotation.setColor(patch.color as mupdf.AnnotColor);
    }
  }
  if (patch.rect !== undefined) {
    if (
      type === "FreeText" ||
      type === "Stamp" ||
      type === "Square" ||
      type === "Circle" ||
      type === "Text"
    ) {
      annotation.setRect(patch.rect as mupdf.Rect);
    } else {
      throw new Error(`Repositioning ${type} annotations is not supported.`);
    }
  }
  if (patch.fillColor !== undefined)
    annotation.setColor((patch.fillColor ?? []) as unknown as mupdf.AnnotColor);
  if (patch.width !== undefined) annotation.setBorderWidth(patch.width);
  annotation.setModificationDate(new Date());
  annotation.update();
}
function addAnnotation(page: mupdf.PDFPage, input: AnnotationInput) {
  if (
    input.rect.length !== 4 ||
    !input.rect.every(Number.isFinite) ||
    input.color.length !== 3 ||
    !input.color.every((c) => c >= 0 && c <= 1)
  )
    throw new Error("Invalid annotation coordinates.");
  const annotation = page.createAnnotation(input.type);
  try {
    if (input.type !== "FreeText") {
      annotation.setColor(input.color as mupdf.AnnotColor);
    }
    annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
    annotation.setCreationDate(new Date());
    if (input.type === "FreeText") {
      const fontName = input.font || "Helv";
      const fontSize = Math.max(6, Math.min(144, input.fontSize || 14));
      annotation.setDefaultAppearance(
        fontName,
        fontSize,
        input.color as mupdf.AnnotColor,
      );
      annotation.setRect(input.rect as mupdf.Rect);
      if (input.fillColor)
        annotation.setColor(input.fillColor as mupdf.AnnotColor);
      if (input.width !== undefined && input.width > 0) {
        annotation.setBorderWidth(input.width);
      } else {
        annotation.setBorderWidth(0);
      }
    } else if (annotation.hasBorder()) {
      annotation.setBorderWidth(Math.max(0.5, Math.min(10, input.width)));
    }
    if (
      input.type === "Highlight" ||
      input.type === "Underline" ||
      input.type === "StrikeOut"
    ) {
      const [x1, y1, x2, y2] = input.rect;
      annotation.setQuadPoints(
        (input.quads?.length
          ? input.quads
          : [[x1, y1, x2, y1, x1, y2, x2, y2]]) as mupdf.Quad[],
      );
      if (input.type === "Highlight") annotation.setOpacity(0.42);
    } else if (input.type === "Ink") {
      annotation.setInkList([input.points as mupdf.Point[]]);
    } else if (input.type === "Line") {
      const points = input.points ?? [
        [input.rect[0], input.rect[1]],
        [input.rect[2], input.rect[3]],
      ];
      annotation.setLine(
        points[0] as mupdf.Point,
        points[points.length - 1] as mupdf.Point,
      );
      annotation.setLineEndingStyles("None", "OpenArrow");
    } else if (input.type === "Stamp") {
      if (!input.imageBytes || input.imageBytes.length === 0) {
        throw new Error(
          "Signature image data is required for stamp annotations.",
        );
      }
      annotation.setRect(input.rect as mupdf.Rect);
      const image = new mupdf.Image(input.imageBytes);
      annotation.setStampImage(image);
    } else if (input.type !== "FreeText") {
      annotation.setRect(input.rect as mupdf.Rect);
      if (input.type === "Text") annotation.setIcon("Comment");
    }
    if (input.contents) annotation.setContents(input.contents.slice(0, 5000));
    annotation.update();
  } finally {
    annotation.destroy();
  }
}
export function editDocument(doc: mupdf.PDFDocument, command: EditCommand) {
  if ("page" in command) checkPage(doc, command.page);
  switch (command.type) {
    case "rotate": {
      const page = doc.findPage(command.page);
      const rotation = page.getInheritable("Rotate");
      try {
        page.put(
          "Rotate",
          ((rotation.asNumber() || 0) + command.angle + 360) % 360,
        );
      } finally {
        rotation.destroy();
        page.destroy();
      }
      break;
    }
    case "delete":
      if (doc.countPages() === 1)
        throw new Error("Keep at least one page in the document.");
      doc.deletePage(command.page);
      break;
    case "duplicate": {
      // Clone the page through a separate document so changes to the duplicate are independent.
      const source = new mupdf.PDFDocument(doc);
      try {
        copyPage(doc, command.page + 1, source, command.page);
      } finally {
        source.destroy();
      }
      break;
    }
    case "reorder":
      if (
        command.order.length !== doc.countPages() ||
        new Set(command.order).size !== command.order.length
      )
        throw new Error("Invalid page order.");
      command.order.forEach((index) => checkPage(doc, index));
      doc.rearrangePages(command.order);
      break;
    case "merge": {
      const source = openPDF(command.bytes);
      try {
        if (source.countPages() + doc.countPages() > 500)
          throw new Error("The combined PDF exceeds 500 pages.");
        for (let index = 0; index < source.countPages(); index++)
          copyPage(doc, -1, source, index);
      } finally {
        source.destroy();
      }
      break;
    }
    case "annotate": {
      const page = doc.loadPage(command.page);
      try {
        addAnnotation(page, command.annotation);
      } finally {
        page.destroy();
      }
      break;
    }
    case "update-annotation":
    case "remove-annotation": {
      const page = doc.loadPage(command.page);
      const annotations = page.getAnnotations();
      try {
        const annotation = annotations[command.id];
        if (!Number.isInteger(command.id) || !annotation)
          throw new Error("This annotation no longer exists.");
        if (annotationLocked(annotation))
          throw new Error("This annotation is locked by the document.");
        if (command.type === "update-annotation")
          updateAnnotation(annotation, command.patch);
        else page.deleteAnnotation(annotation);
      } finally {
        annotations.forEach((annotation) => annotation.destroy());
        page.destroy();
      }
      break;
    }
  }
}
export function edit(bytes: Uint8Array, command: EditCommand): Uint8Array {
  const doc = openPDF(bytes);
  try {
    editDocument(doc, command);
    return serializePDF(doc);
  } finally {
    doc.destroy();
  }
}
export function copyPage(
  target: mupdf.PDFDocument,
  at: number,
  source: mupdf.PDFDocument,
  index: number,
) {
  target.graftPage(at, source, index);
  // graftPage copies content/resources, but not annotations. Copy each annotation without
  // its /P back-reference to avoid importing the source's entire page tree.
  const page = source.loadPage(index);
  const annotations = page.getAnnotations();
  const targetPage = target.findPage(at < 0 ? target.countPages() - 1 : at);
  const list = target.newArray();
  try {
    for (const annotation of annotations) {
      const obj = annotation.getObject();
      const clean = source.newDictionary();
      try {
        obj.forEach((value, key) => {
          if (key !== "P" && key !== "Popup" && key !== "IRT")
            clean.put(key, value);
        });
        const cloned = target.graftObject(clean);
        const ref = target.addObject(cloned);
        try {
          ref.put("P", targetPage);
          list.push(ref);
        } finally {
          ref.destroy();
          cloned.destroy();
        }
      } finally {
        clean.destroy();
        obj.destroy();
      }
    }
    if (annotations.length) targetPage.put("Annots", list);
  } finally {
    annotations.forEach((annotation) => annotation.destroy());
    list.destroy();
    targetPage.destroy();
    page.destroy();
  }
}
export function extract(bytes: Uint8Array, indices: number[]) {
  const doc = openPDF(bytes);
  try {
    if (!indices.length || new Set(indices).size !== indices.length)
      throw new Error("Select at least one unique page.");
    indices.forEach((index) => checkPage(doc, index));
    doc.rearrangePages(indices);
    return serializePDF(doc);
  } finally {
    doc.destroy();
  }
}
export { parsePageRange } from "./ranges";

export function createSample(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  const bold = new mupdf.Font("Helvetica-Bold");
  const serif = new mupdf.Font("Times-Italic");
  const f1 = doc.addSimpleFont(font);
  const f2 = doc.addSimpleFont(bold);
  const f3 = doc.addSimpleFont(serif);
  const text = (
    value: string,
    x: number,
    y: number,
    size = 12,
    face = "F1",
    color = "0.16 0.18 0.19",
  ) =>
    `BT /${face} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${value.replace(/[()\\]/g, "\\$&")}) Tj ET\n`;
  try {
    const sections = [
      [
        "A little less friction.",
        "A little more focus.",
        "A workspace for your words, ideas, and everything in between.",
      ],
      [
        "Make room",
        "for good ideas.",
        "Read closely. Mark what matters. Keep your thoughts together.",
      ],
      [
        "Put every page",
        "in its place.",
        "A better document starts with a little organization.",
      ],
      [
        "Yours to keep.",
        "Yours to change.",
        "Your documents belong on your Mac, under your control.",
      ],
    ];
    sections.forEach(([title, subtitle, description], index) => {
      let content = `0.986 0.979 0.957 rg 0 0 612 792 re f\n`;
      content += text(
        "OPENPDF  /  FIELD NOTES",
        52,
        739,
        10,
        "F2",
        "0.24 0.37 0.30",
      );
      content += text(
        `VOL. 01     /     ${String(index + 1).padStart(2, "0")}`,
        446,
        739,
        9,
      );
      content += "0.75 0.78 0.72 RG 0.5 w 52 719 m 560 719 l S\n";
      content += text(title, 52, 635, 38, "F2");
      content += text(subtitle, 52, 586, 40, "F3", "0.24 0.37 0.30");
      content += text(description, 52, 548, 11);
      content += "0.88 0.91 0.85 rg 52 336 508 170 re f\n";
      content += text(
        [
          "SPACE TO THINK",
          "LEAVE YOUR MARK",
          "FIND YOUR FLOW",
          "LOCAL BY DESIGN",
        ][index],
        76,
        476,
        10,
        "F2",
        "0.24 0.37 0.30",
      );
      content += text(
        [
          "A fresh perspective on the everyday PDF.",
          "The best ideas rarely arrive fully formed.",
          "Less time rearranging. More time creating.",
          "No account. No upload. No distractions.",
        ][index],
        76,
        436,
        22,
        "F3",
      );
      content += text(
        "Try it here. Highlight a sentence, add a note, or sketch an idea.",
        76,
        392,
        11,
      );
      content += text(
        "This is a real PDF. Every change you save stays in the document.",
        76,
        370,
        11,
      );
      content += text("01   READ WITH INTENTION", 52, 291, 10, "F2");
      content += text(
        "Select text to copy it. Search for a word. Zoom in on the details.",
        52,
        267,
        11,
      );
      content += text("02   MAKE IT YOURS", 52, 223, 10, "F2");
      content += text(
        "Annotate the page, move things around, and save a fresh copy.",
        52,
        199,
        11,
      );
      content += text("03   KEEP THE ORIGINAL", 52, 155, 10, "F2");
      content += text(
        "Use Save As to keep a version before making your next big change.",
        52,
        131,
        11,
      );
      content += "0.75 0.78 0.72 RG 0.5 w 52 77 m 560 77 l S\n";
      content += text("Made for the way you work.", 52, 54, 9, "F3");
      content += text(`OPENPDF STUDIO    /    ${index + 1}`, 434, 54, 8);
      const page = doc.addPage(
        [0, 0, 612, 792],
        0,
        { Font: { F1: f1, F2: f2, F3: f3 } },
        content,
      );
      doc.insertPage(-1, page);
      page.destroy();
    });
    doc.setMetaData("info:Title", "Field Notes — A guide to OpenPDF Studio");
    doc.setMetaData("info:Author", "OpenPDF Studio");
    doc.setMetaData("info:Subject", "A hands-on guide to your PDF workspace");
    doc.setMetaData("info:Creator", "OpenPDF Studio");
    const outline = doc.outlineIterator();
    try {
      [
        "Read with intention",
        "Make your mark",
        "Organize your pages",
        "Yours to keep",
      ].forEach((title, index) =>
        outline.insert({ title, uri: `#page=${index + 1}`, open: true }),
      );
    } finally {
      outline.destroy();
    }
    return serializePDF(doc);
  } finally {
    f1.destroy();
    f2.destroy();
    f3.destroy();
    font.destroy();
    bold.destroy();
    serif.destroy();
    doc.destroy();
  }
}

export function imagesToPDF(
  images: {
    name: string;
    bytes: Uint8Array;
    crop?: { x: number; y: number; width: number; height: number };
    rotation?: 0 | 90 | 180 | 270;
  }[],
) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 100)
    throw new Error("Choose between 1 and 100 images.");
  const doc = new mupdf.PDFDocument();
  try {
    for (const input of images) {
      if (
        !(input.bytes instanceof Uint8Array) ||
        input.bytes.length < 16 ||
        input.bytes.length > 50 * 1024 * 1024
      )
        throw new Error(`Could not read ${input.name || "an image"}.`);
      let image: mupdf.Image;
      try {
        image = new mupdf.Image(input.bytes);
      } catch {
        throw new Error(
          `${input.name || "An image"} is not a supported PNG or JPEG file.`,
        );
      }
      let imageRef: mupdf.PDFObject | null = null;
      let page: mupdf.PDFObject | null = null;
      try {
        const pixelsWide = image.getWidth();
        const pixelsHigh = image.getHeight();
        if (
          pixelsWide < 1 ||
          pixelsHigh < 1 ||
          pixelsWide * pixelsHigh > 100_000_000
        )
          throw new Error(
            `${input.name || "An image"} has invalid dimensions.`,
          );
        const sourceCrop = input.crop ?? { x: 0, y: 0, width: 1, height: 1 };
        const crop = {
          x: Math.max(0, Math.min(0.99, Number(sourceCrop.x) || 0)),
          y: Math.max(0, Math.min(0.99, Number(sourceCrop.y) || 0)),
          width: Math.max(0.01, Math.min(1, Number(sourceCrop.width) || 1)),
          height: Math.max(0.01, Math.min(1, Number(sourceCrop.height) || 1)),
        };
        crop.width = Math.min(crop.width, 1 - crop.x);
        crop.height = Math.min(crop.height, 1 - crop.y);
        const rotation = [0, 90, 180, 270].includes(input.rotation ?? 0)
          ? (input.rotation ?? 0)
          : 0;
        const croppedWidth = pixelsWide * crop.width;
        const croppedHeight = pixelsHigh * crop.height;
        const quarterTurn = rotation === 90 || rotation === 270;
        const displayWidth = quarterTurn ? croppedHeight : croppedWidth;
        const displayHeight = quarterTurn ? croppedWidth : croppedHeight;
        const maxWidth = displayWidth >= displayHeight ? 792 : 612;
        const maxHeight = displayWidth >= displayHeight ? 612 : 792;
        const fit = Math.min(
          maxWidth / displayWidth,
          maxHeight / displayHeight,
        );
        const width = Math.max(1, croppedWidth * fit);
        const height = Math.max(1, croppedHeight * fit);
        const fullWidth = pixelsWide * fit;
        const fullHeight = pixelsHigh * fit;
        const offsetX = -crop.x * fullWidth;
        const offsetY = -(1 - crop.y - crop.height) * fullHeight;
        imageRef = doc.addImage(image);
        page = doc.addPage(
          [0, 0, width, height],
          rotation,
          { XObject: { Im0: imageRef } },
          `q 0 0 ${width} ${height} re W n ${fullWidth} 0 0 ${fullHeight} ${offsetX} ${offsetY} cm /Im0 Do Q`,
        );
        doc.insertPage(-1, page);
      } finally {
        page?.destroy();
        imageRef?.destroy();
        image.destroy();
      }
    }
    return serializePDF(doc);
  } finally {
    doc.destroy();
  }
}
