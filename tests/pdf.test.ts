import { beforeAll, describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import {
  createSample,
  edit,
  extract,
  inspect,
  parsePageRange,
  imagesToPDF,
} from "../src/core/pdf";
import { useDocument } from "../src/core/history";
import type { AnnotationInput } from "../src/types";
import { annotationHex } from "../src/core/annotation-style";
let sample: Uint8Array;
beforeAll(() => {
  sample = createSample();
});
function pageText(bytes: Uint8Array, index = 0) {
  const doc = new mupdf.PDFDocument(bytes);
  const page = doc.loadPage(index);
  const text = page.toStructuredText();
  try {
    return text.asText();
  } finally {
    text.destroy();
    page.destroy();
    doc.destroy();
  }
}
const note: AnnotationInput = {
  type: "Text",
  rect: [50, 50, 74, 74],
  color: [1, 0.7, 0.1],
  width: 2,
  contents: "Keep this thought.",
};
describe("actual PDF operations", () => {
  it("creates a real searchable four-page document", () => {
    expect(inspect(sample).pages).toHaveLength(4);
    expect(pageText(sample)).toContain("A little less friction.");
  });
  it("converts multiple images to PDF without discarding source pixels", () => {
    const landscape = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 40, 20],
      false,
    );
    const portrait = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 20, 40],
      false,
    );
    landscape.clear(220);
    portrait.clear(120);
    try {
      const output = imagesToPDF([
        { name: "landscape.jpg", bytes: landscape.asJPEG(95) },
        { name: "portrait.png", bytes: portrait.asPNG() },
      ]);
      const pages = inspect(output).pages;
      expect(pages).toHaveLength(2);
      expect(pages[0].width).toBeGreaterThan(pages[0].height);
      expect(pages[1].height).toBeGreaterThan(pages[1].width);
      const document = new mupdf.PDFDocument(output);
      const pageObject = document.findPage(0);
      const imageObject = pageObject
        .get("Resources", "XObject", "Im0")
        .resolve();
      expect(imageObject.get("Filter").asName()).toBe("DCTDecode");
      imageObject.destroy();
      pageObject.destroy();
      document.destroy();
    } finally {
      landscape.destroy();
      portrait.destroy();
    }
  });
  it("crops and rotates an image through PDF geometry without recompressing it", () => {
    const source = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 80, 40],
      false,
    );
    const sourcePixels = source.getPixels();
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 80; x++) {
        const offset = y * source.getStride() + x * 3;
        sourcePixels[offset] = x < 40 ? 230 : 20;
        sourcePixels[offset + 1] = 20;
        sourcePixels[offset + 2] = x < 40 ? 20 : 230;
      }
    }
    try {
      const output = imagesToPDF([
        {
          name: "edited.jpg",
          bytes: source.asJPEG(95),
          crop: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
          rotation: 90,
        },
      ]);
      const [page] = inspect(output).pages;
      expect(page.rotation).toBe(90);
      expect(page.height).toBeGreaterThan(page.width);
      const document = new mupdf.PDFDocument(output);
      const pageObject = document.findPage(0);
      const imageObject = pageObject
        .get("Resources", "XObject", "Im0")
        .resolve();
      expect(imageObject.get("Filter").asName()).toBe("DCTDecode");
      const renderedPage = document.loadPage(0);
      const rendered = renderedPage.toPixmap(
        [1, 0, 0, 1, 0, 0],
        mupdf.ColorSpace.DeviceRGB,
        false,
      );
      const renderedPixels = rendered.getPixels();
      const center =
        Math.floor(rendered.getHeight() / 2) * rendered.getStride() +
        Math.floor(rendered.getWidth() / 2) * 3;
      expect(renderedPixels[center + 2]).toBeGreaterThan(
        renderedPixels[center],
      );
      rendered.destroy();
      renderedPage.destroy();
      imageObject.destroy();
      pageObject.destroy();
      document.destroy();
    } finally {
      source.destroy();
    }
  });
  it("rotates and independently duplicates pages", () => {
    const duplicated = edit(sample, { type: "duplicate", page: 0 });
    const rotated = edit(duplicated, { type: "rotate", page: 1, angle: 90 });
    const pages = inspect(rotated).pages;
    expect(pages).toHaveLength(5);
    expect(pages[0].rotation).toBe(0);
    expect(pages[1].rotation).toBe(90);
    expect(pages[1].width).toBe(792);
    expect(pageText(rotated, 1)).toContain("A little less friction.");
  });
  it("reorders, deletes and extracts without changing the source", () => {
    const reordered = edit(sample, { type: "reorder", order: [3, 0, 1, 2] });
    expect(pageText(reordered)).toContain("Yours to keep.");
    const deleted = edit(reordered, { type: "delete", page: 0 });
    expect(inspect(deleted).pages).toHaveLength(3);
    expect(pageText(deleted)).toContain("A little less friction.");
    const output = extract(sample, [2, 0]);
    expect(inspect(output).pages).toHaveLength(2);
    expect(pageText(output)).toContain("Put every page");
    expect(inspect(sample).pages).toHaveLength(4);
  });
  it("rejects deleting the final page, invalid page orders and invalid inputs", () => {
    expect(() =>
      edit(extract(sample, [0]), { type: "delete", page: 0 }),
    ).toThrow("at least one");
    expect(() =>
      edit(sample, { type: "reorder", order: [0, 0, 2, 3] }),
    ).toThrow("Invalid");
    expect(() => extract(sample, [8])).toThrow("Page");
    expect(() => inspect(new TextEncoder().encode("not a PDF"))).toThrow(
      "valid PDF",
    );
  });
  it("preserves annotations through save, duplication, merge, and removal", () => {
    const annotated = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: note,
    });
    expect(inspect(annotated).pages[0].annotations[0].contents).toBe(
      note.contents,
    );
    const copied = edit(annotated, { type: "duplicate", page: 0 });
    expect(inspect(copied).pages[1].annotations[0].contents).toBe(
      note.contents,
    );
    const merged = edit(sample, { type: "merge", bytes: annotated });
    expect(inspect(merged).pages).toHaveLength(8);
    expect(inspect(merged).pages[4].annotations[0].contents).toBe(
      note.contents,
    );
    const removed = edit(copied, { type: "remove-annotation", page: 1, id: 0 });
    expect(inspect(removed).pages[1].annotations).toHaveLength(0);
    expect(inspect(removed).pages[0].annotations).toHaveLength(1);
  });
  it("edits an existing annotation without adding a duplicate or changing the original", () => {
    const source = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: { ...note, type: "Square", rect: [40, 80, 240, 160] },
    });
    const changed = edit(source, {
      type: "update-annotation",
      page: 0,
      id: 0,
      patch: {
        contents: "A revised thought.",
        color: [0.2, 0.4, 0.8],
        width: 5,
      },
    });
    const result = inspect(changed).pages[0].annotations;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contents: "A revised thought.",
      width: 5,
      editable: true,
    });
    expect(result[0].color[2]).toBeCloseTo(0.8);
    expect(inspect(source).pages[0].annotations[0].contents).toBe(
      note.contents,
    );
    expect(pageText(changed)).toBe(pageText(source));
  });
  it("updates FreeText content and text color while retaining font size and page position", () => {
    const source = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: { ...note, type: "FreeText", rect: [40, 80, 240, 160] },
    });
    const changed = edit(source, {
      type: "update-annotation",
      page: 0,
      id: 0,
      patch: { contents: "Updated text box", color: [0.1, 0.2, 0.7] },
    });
    const doc = new mupdf.PDFDocument(changed);
    const page = doc.loadPage(0);
    const annotations = page.getAnnotations();
    try {
      expect(annotations[0].getContents()).toBe("Updated text box");
      expect(annotations[0].getDefaultAppearance().size).toBe(14);
      const r = annotations[0].getRect();
      expect(Math.abs(r[0] - 40)).toBeLessThanOrEqual(1);
      expect(Math.abs(r[1] - 80)).toBeLessThanOrEqual(1);
      expect(Math.abs(r[2] - 240)).toBeLessThanOrEqual(1);
      expect(Math.abs(r[3] - 160)).toBeLessThanOrEqual(1);
      const rendered = page.toPixmap(
        [0.25, 0, 0, 0.25, 0, 0],
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );
      expect(rendered.getWidth()).toBeGreaterThan(0);
      rendered.destroy();
    } finally {
      annotations.forEach((a) => a.destroy());
      page.destroy();
      doc.destroy();
    }
  });
  it("rejects locked annotations and malformed edits", () => {
    const source = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: note,
    });
    for (const patch of [
      { contents: "" },
      { contents: "x".repeat(5001) },
      { color: [NaN, 0, 1] },
      { width: -1 },
      { width: Infinity },
      {},
    ]) {
      expect(() =>
        edit(source, { type: "update-annotation", page: 0, id: 0, patch }),
      ).toThrow();
    }
    expect(() =>
      edit(source, {
        type: "update-annotation",
        page: 0,
        id: 5,
        patch: { contents: "Missing" },
      }),
    ).toThrow("no longer exists");
    const doc = new mupdf.PDFDocument(source);
    const page = doc.loadPage(0);
    const annotations = page.getAnnotations();
    annotations[0].setFlags(
      mupdf.PDFAnnotation.IS_LOCKED | mupdf.PDFAnnotation.IS_PRINT,
    );
    const buffer = doc.saveToBuffer("");
    try {
      const locked = buffer.asUint8Array().slice();
      expect(inspect(locked).pages[0].annotations[0]).toMatchObject({
        locked: true,
        editable: false,
      });
      expect(() =>
        edit(locked, {
          type: "update-annotation",
          page: 0,
          id: 0,
          patch: { contents: "Changed" },
        }),
      ).toThrow("locked");
      expect(() =>
        edit(locked, { type: "remove-annotation", page: 0, id: 0 }),
      ).toThrow("locked");
    } finally {
      buffer.destroy();
      annotations.forEach((a) => a.destroy());
      page.destroy();
      doc.destroy();
    }
  });
  it("reads metadata and keeps outline destinations correct after page operations", () => {
    const original = inspect(sample);
    expect(original.author).toBe("OpenPDF Studio");
    expect(original.outline.map((entry) => entry.page)).toEqual([0, 1, 2, 3]);
    const reordered = inspect(
      edit(sample, { type: "reorder", order: [3, 0, 1, 2] }),
    );
    expect(reordered.outline.map((entry) => entry.page)).toEqual([1, 2, 3, 0]);
    const extracted = inspect(extract(sample, [2, 0]));
    expect(
      extracted.outline.every((entry) => entry.page === null || entry.page < 2),
    ).toBe(true);
  });
  it("keeps external outline destinations non-navigable and tolerates documents without an outline", () => {
    const doc = new mupdf.PDFDocument(sample);
    const outline = doc.outlineIterator();
    outline.insert({
      title: "External website",
      uri: "https://example.com",
      open: false,
    });
    outline.insert({
      title: "Another PDF",
      uri: "#page=2",
      open: false,
    });
    // Write an actual GoToR action. The iterator helper normalizes file URIs
    // into local GoTo destinations, so it cannot create this imported-PDF case.
    const trailer = doc.getTrailer();
    let item = trailer.get("Root", "Outlines", "First");
    try {
      while (!item.isNull()) {
        const title = item.get("Title");
        const matches = title.asString() === "Another PDF";
        title.destroy();
        if (matches) {
          const action = doc.newDictionary();
          const kind = doc.newName("GoToR");
          const fit = doc.newName("Fit");
          const destination = doc.newArray();
          try {
            action.put("S", kind);
            action.put("F", "another.pdf");
            destination.push(1);
            destination.push(fit);
            action.put("D", destination);
            item.delete("Dest");
            item.put("A", action);
          } finally {
            action.destroy();
            kind.destroy();
            fit.destroy();
            destination.destroy();
          }
          break;
        }
        const next = item.get("Next");
        item.destroy();
        item = next;
      }
    } finally {
      item.destroy();
      trailer.destroy();
    }
    const buffer = doc.saveToBuffer("");
    try {
      const entries = inspect(buffer.asUint8Array().slice()).outline;
      expect(
        entries.find((entry) => entry.title === "External website")?.page,
      ).toBeNull();
      expect(
        entries.find((entry) => entry.title === "Another PDF")?.page,
      ).toBeNull();
    } finally {
      buffer.destroy();
      outline.destroy();
      doc.destroy();
    }
    const blank = new mupdf.PDFDocument();
    const page = blank.addPage([0, 0, 612, 792], 0, {}, "");
    blank.insertPage(-1, page);
    const bytes = blank.saveToBuffer("");
    try {
      expect(inspect(bytes.asUint8Array().slice()).outline).toEqual([]);
    } finally {
      bytes.destroy();
      page.destroy();
      blank.destroy();
    }
  });
  it.each([
    "Highlight",
    "Underline",
    "StrikeOut",
    "Square",
    "Circle",
    "Line",
    "Ink",
    "FreeText",
  ] as const)("saves %s as a standard PDF annotation", (type) => {
    const bytes = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: {
        ...note,
        type,
        rect: [50, 100, 200, 140],
        points: [
          [50, 100],
          [100, 110],
          [200, 140],
        ],
      },
    });
    expect(inspect(bytes).pages[0].annotations[0].type).toBe(type);
    const doc = new mupdf.PDFDocument(bytes);
    const page = doc.loadPage(0);
    const pixmap = page.toPixmap(
      [0.2, 0, 0, 0.2, 0, 0],
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      expect(pixmap.getWidth()).toBeGreaterThan(0);
    } finally {
      pixmap.destroy();
      page.destroy();
      doc.destroy();
    }
  });
  it("round trips annotations on a rotated page at the requested coordinates", () => {
    const rotated = edit(sample, { type: "rotate", page: 0, angle: 90 });
    const annotated = edit(rotated, {
      type: "annotate",
      page: 0,
      annotation: { ...note, type: "Square", rect: [200, 100, 350, 160] },
    });
    const doc = new mupdf.PDFDocument(annotated);
    const page = doc.loadPage(0);
    const annotations = page.getAnnotations();
    try {
      const rect = annotations[0].getRect();
      expect(rect[0]).toBeCloseTo(200);
      expect(rect[1]).toBeCloseTo(100);
    } finally {
      annotations.forEach((a) => a.destroy());
      page.destroy();
      doc.destroy();
    }
  });
  it("creates, renders, and repositions visible Stamp signature annotations", () => {
    const png1x1 = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84,
      120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69,
      78, 68, 174, 66, 96, 130,
    ]);
    const stamped = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: {
        type: "Stamp",
        rect: [100, 200, 280, 260],
        color: [0, 0, 0],
        width: 1,
        imageBytes: png1x1,
      },
    });
    const info = inspect(stamped);
    expect(info.pages[0].annotations).toHaveLength(1);
    expect(info.pages[0].annotations[0].type).toBe("Stamp");
    expect(info.pages[0].annotations[0].rect).toEqual([100, 200, 280, 260]);

    const doc = new mupdf.PDFDocument(stamped);
    const page = doc.loadPage(0);
    const pixmap = page.toPixmap(
      [0.5, 0, 0, 0.5, 0, 0],
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      expect(pixmap.getWidth()).toBeGreaterThan(0);
    } finally {
      pixmap.destroy();
      page.destroy();
      doc.destroy();
    }

    // Reposition Stamp
    const moved = edit(stamped, {
      type: "update-annotation",
      page: 0,
      id: 0,
      patch: { rect: [150, 250, 330, 310] },
    });
    const movedInfo = inspect(moved);
    expect(movedInfo.pages[0].annotations[0].rect).toEqual([
      150, 250, 330, 310,
    ]);
  });

  it("rejects Stamp creation without image bytes", () => {
    expect(() =>
      edit(sample, {
        type: "annotate",
        page: 0,
        annotation: {
          type: "Stamp",
          rect: [100, 200, 280, 260],
          color: [0, 0, 0],
          width: 1,
        },
      }),
    ).toThrow("Signature image data is required");
  });

  it("creates, renders, and updates FreeText with custom font, size, multiline and Unicode text", () => {
    const unicodeText =
      "Line 1: Café & résumé — 100€\nLine 2: “Quotes” & ‘symbols’ ©";
    const annotated = edit(sample, {
      type: "annotate",
      page: 0,
      annotation: {
        type: "FreeText",
        rect: [50, 100, 350, 220],
        color: [0.12, 0.21, 0.34],
        width: 1,
        contents: unicodeText,
        fontSize: 18,
        font: "Cour",
      },
    });

    const info = inspect(annotated);
    const annot = info.pages[0].annotations[0];
    expect(annot.contents).toBe(unicodeText);
    expect(annot.fontSize).toBe(18);
    expect(annot.font).toBe("Cour");
    expect(annot.color[0]).toBeCloseTo(0.12);

    const doc = new mupdf.PDFDocument(annotated);
    const page = doc.loadPage(0);
    const pixmap = page.toPixmap(
      [0.5, 0, 0, 0.5, 0, 0],
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      expect(pixmap.getWidth()).toBeGreaterThan(0);
    } finally {
      pixmap.destroy();
      page.destroy();
      doc.destroy();
    }

    // Update position, font size, and text
    const updated = edit(annotated, {
      type: "update-annotation",
      page: 0,
      id: 0,
      patch: {
        contents: "Updated multiline\nSecond line",
        fontSize: 24,
        rect: [60, 110, 400, 250],
      },
    });
    const updatedAnnot = inspect(updated).pages[0].annotations[0];
    expect(updatedAnnot.contents).toBe("Updated multiline\nSecond line");
    expect(updatedAnnot.fontSize).toBe(24);
    expect(updatedAnnot.rect).toEqual([60, 110, 400, 250]);
  });

  it("rejects repositioning geometry for unsupported annotation types", () => {
    for (const type of [
      "Line",
      "Ink",
      "Highlight",
      "Underline",
      "StrikeOut",
    ] as const) {
      const annotated = edit(sample, {
        type: "annotate",
        page: 0,
        annotation: {
          ...note,
          type,
          rect: [50, 50, 200, 100],
          points: [
            [50, 50],
            [100, 75],
            [200, 100],
          ],
        },
      });
      expect(() =>
        edit(annotated, {
          type: "update-annotation",
          page: 0,
          id: 0,
          patch: { rect: [60, 60, 210, 110] },
        }),
      ).toThrow(`Repositioning ${type} annotations is not supported.`);
    }
  });

  it("rejects encrypted documents without changing their bytes", () => {
    const doc = new mupdf.PDFDocument(sample);
    const buffer = doc.saveToBuffer(
      "encrypt=aes-256,user-password=secret,owner-password=owner",
    );
    try {
      expect(() => inspect(buffer.asUint8Array().slice())).toThrow(
        "Password-protected",
      );
    } finally {
      buffer.destroy();
      doc.destroy();
    }
  });
});
describe("page ranges and command history", () => {
  it("converts PDF colors for display without changing the PDF", () => {
    expect(annotationHex([0.5])).toBe("#808080");
    expect(annotationHex([0, 1, 1, 0])).toBe("#ff0000");
    expect(annotationHex([1, 0, 0])).toBe("#ff0000");
    expect(annotationHex([])).toBe("#333333");
  });
  it("parses ranges and rejects invalid selections", () => {
    expect(parsePageRange("1, 3-4, 3", 4)).toEqual([0, 2, 3]);
    expect(() => parsePageRange("0", 4)).toThrow();
    expect(() => parsePageRange("4-2", 4)).toThrow();
    expect(() => parsePageRange("", 4)).toThrow();
  });
  it("restores real bytes and keeps save state correct across undo, redo and a new branch", () => {
    const store = useDocument.getState();
    store.load(sample, inspect(sample), "test.pdf", null);
    const original = useDocument.getState().saved;
    const rotated = edit(sample, { type: "rotate", page: 0, angle: 90 });
    store.commit(rotated, inspect(rotated), "Rotate");
    store.undo();
    let current = useDocument.getState();
    expect(current.revisions[current.cursor].id).toBe(original);
    expect(current.revisions[current.cursor].bytes).toBe(sample);
    store.redo();
    current = useDocument.getState();
    store.markSaved(current.revisions[current.cursor].id, "test.pdf", "handle");
    store.undo();
    store.commit(sample, inspect(sample), "New branch");
    current = useDocument.getState();
    expect(current.revisions).toHaveLength(2);
    expect(current.saved).not.toBe(current.revisions[current.cursor].id);
    store.close();
  });
});
