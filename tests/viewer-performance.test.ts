import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_SIDE,
  pageSearchText,
  rasterSize,
} from "../src/core/viewer-performance";

function documentWithText(read: (page: number) => Promise<string>) {
  const getPage = vi.fn(async (page: number) => ({
    getTextContent: async () => ({ items: [{ str: await read(page) }] }),
  }));
  return { pdf: { getPage } as unknown as PDFDocumentProxy, getPage };
}

describe("viewer resource budgets", () => {
  it("preserves normal Retina resolution and bounds large or extreme pages", () => {
    expect(rasterSize(612, 792, 2)).toEqual({ width: 1224, height: 1584 });
    for (const [width, height] of [
      [2448, 3168],
      [100000, 100],
      [100, 100000],
    ]) {
      const result = rasterSize(width, height, 2);
      expect(result.width * result.height).toBeLessThanOrEqual(
        MAX_CANVAS_PIXELS,
      );
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(
        MAX_CANVAS_SIDE,
      );
    }
  });

  it("shares in-flight extraction and reuses text across queries", async () => {
    const { pdf, getPage } = documentWithText(async () => "Searchable text");
    expect(
      await Promise.all([pageSearchText(pdf, 1), pageSearchText(pdf, 1)]),
    ).toEqual(["Searchable text", "Searchable text"]);
    expect(await pageSearchText(pdf, 1)).toBe("Searchable text");
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it("isolates document revisions and retries failed extraction", async () => {
    let failed = true;
    const first = documentWithText(async () => {
      if (failed) {
        failed = false;
        throw new Error("Read failed");
      }
      return "original";
    });
    await expect(pageSearchText(first.pdf, 1)).rejects.toThrow("Read failed");
    expect(await pageSearchText(first.pdf, 1)).toBe("original");
    const next = documentWithText(async () => "edited");
    expect(await pageSearchText(next.pdf, 1)).toBe("edited");
    expect(first.getPage).toHaveBeenCalledTimes(2);
  });

  it("evicts old text when the character budget fills", async () => {
    const { pdf, getPage } = documentWithText(async () =>
      "a".repeat(2_100_000),
    );
    await pageSearchText(pdf, 1);
    await pageSearchText(pdf, 2);
    await pageSearchText(pdf, 2);
    expect(getPage).toHaveBeenCalledTimes(2);
    await pageSearchText(pdf, 1);
    expect(getPage).toHaveBeenCalledTimes(3);
  });
});
