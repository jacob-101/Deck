import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createSample } from "../src/core/pdf";
import { initSync, processPdf } from "@firecrawl/pdf-inspector-wasm";
import { mergeOCRMarkdown } from "../src/core/markdown";

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const js = require.resolve("@firecrawl/pdf-inspector-wasm");
  const wasm = new URL("pdf_inspector_wasm_bg.wasm", `file://${js}`).pathname;
  initSync({ module: await readFile(wasm) });
});

it("merges OCR pages without dropping native-text pages", () => {
  const merged = mergeOCRMarkdown(
    "<!-- Page 1 -->\n\nNative one\n\n<!-- Page 2 -->\n\nMissing scan\n\n<!-- Page 3 -->\n\nNative three",
    {
      pages: [{ page: 2, text: "Recognized two", confidence: 0.9 }],
      markdown: "",
      processingTimeMs: 10,
      engine: "Apple Vision",
    },
    3,
  );
  expect(merged).toContain("Native one");
  expect(merged).toContain("Recognized two");
  expect(merged).not.toContain("Missing scan");
  expect(merged).toContain("Native three");
});

describe("local document intelligence", () => {
  it("classifies a text PDF and extracts structured Markdown", () => {
    const result = processPdf(createSample(), { includePageMarkers: true });
    expect(result.pdfType).toBe("TextBased");
    expect(result.pageCount).toBe(4);
    expect(result.pagesNeedingOcr).toEqual([]);
    expect(result.markdown).toContain("A little less friction");
    expect(result.markdown).toContain("<!-- Page 1 -->");
  });
});
