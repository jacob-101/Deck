import { beforeAll, describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import {
  createSample,
  edit,
  extract,
  inspect,
  parsePageRange,
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
      expect(annotations[0].getDefaultAppearance().color[2]).toBeCloseTo(0.7);
      expect(annotations[0].getRect()).toEqual([40, 80, 240, 160]);
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
