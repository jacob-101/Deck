import type { PDFDocumentProxy } from "pdfjs-dist";

export const MAX_CANVAS_PIXELS = 8_000_000;
export const MAX_CANVAS_SIDE = 8192;

// Keep CSS geometry (and annotation coordinates) intact while bounding only
// the raster backing store. Two surfaces coexist during an atomic page swap.
export function rasterSize(width: number, height: number, density: number) {
  const ratio = Math.min(
    density,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
  );
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
  };
}

const MAX_CACHED_CHARACTERS = 4_000_000;
type TextCache = {
  pages: Map<number, string>;
  characters: number;
  pending: Map<number, Promise<string>>;
};
const documents = new WeakMap<PDFDocumentProxy, TextCache>();

// A PDF.js proxy represents one immutable revision. Weak ownership prevents
// keeping closed documents alive; bounded LRU entries limit retained strings.
export function pageSearchText(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  let cache = documents.get(pdf);
  if (!cache) {
    cache = { pages: new Map(), characters: 0, pending: new Map() };
    documents.set(pdf, cache);
  }
  const cached = cache.pages.get(pageNumber);
  if (cached !== undefined) {
    cache.pages.delete(pageNumber);
    cache.pages.set(pageNumber, cached);
    return Promise.resolve(cached);
  }
  const pending = cache.pending.get(pageNumber);
  if (pending) return pending;
  const target = cache;
  const request = (async () => {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    if (text.length <= MAX_CACHED_CHARACTERS) {
      while (target.characters + text.length > MAX_CACHED_CHARACTERS) {
        const oldest = target.pages.keys().next().value!;
        target.characters -= target.pages.get(oldest)!.length;
        target.pages.delete(oldest);
      }
      target.pages.set(pageNumber, text);
      target.characters += text.length;
    }
    return text;
  })().finally(() => target.pending.delete(pageNumber));
  target.pending.set(pageNumber, request);
  return request;
}
