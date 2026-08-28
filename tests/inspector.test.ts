import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createSample } from "../src/core/pdf";
import { initSync, processPdf } from "@firecrawl/pdf-inspector-wasm";

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const js = require.resolve("@firecrawl/pdf-inspector-wasm");
  const wasm = new URL("pdf_inspector_wasm_bg.wasm", `file://${js}`).pathname;
  initSync({ module: await readFile(wasm) });
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
