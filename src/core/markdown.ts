import type { OCRResult } from "../types";

export function mergeOCRMarkdown(
  extracted: string,
  ocr: OCRResult,
  pageCount: number,
) {
  const byPage = new Map<number, string>();
  const marker = /<!-- Page (\d+) -->/g;
  const matches = [...extracted.matchAll(marker)];
  matches.forEach((match, index) => {
    const page = Number(match[1]);
    const end = matches[index + 1]?.index ?? extracted.length;
    byPage.set(page, extracted.slice(match.index, end).trim());
  });
  for (const page of ocr.pages) {
    byPage.set(
      page.page,
      `<!-- Page ${page.page} -->\n\n## Page ${page.page}\n\n${page.text}`.trim(),
    );
  }
  const merged = Array.from({ length: pageCount }, (_, index) =>
    byPage.get(index + 1),
  ).filter((value): value is string => !!value);
  if (merged.length) return merged.join("\n\n---\n\n");
  return ocr.markdown || extracted;
}
