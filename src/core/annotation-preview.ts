import {
  OPS,
  AnnotationType,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import type { AnnotationInfo } from "../types";

// Render the exact PDF appearance separately, so moving a transparent text
// box or signature never carries page text with it or paints over that text.
export async function annotationPreview(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  annotation: AnnotationInfo,
  width: number,
  height: number,
  tasks: Set<RenderTask>,
) {
  if (!annotation.rect) return null;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const raw = await page.getAnnotations({ intent: "display" });
  const expectedType = (AnnotationType as unknown as Record<string, number>)[
    annotation.type.toUpperCase()
  ];
  const rect = annotation.rect.map((value) => value * scale);
  const match = raw.find((item) => {
    if (item.annotationType !== expectedType || !item.rect) return false;
    const [a, b, c, d, e, f] = viewport.transform;
    const [x0, y0, x1, y1] = item.rect;
    const r = [
      a * x0 + c * y0 + e,
      b * x0 + d * y0 + f,
      a * x1 + c * y1 + e,
      b * x1 + d * y1 + f,
    ];
    const bounds = [
      Math.min(r[0], r[2]),
      Math.min(r[1], r[3]),
      Math.max(r[0], r[2]),
      Math.max(r[1], r[3]),
    ];
    return bounds.every(
      (value, index) => Math.abs(value - rect[index]) < 3 * scale,
    );
  });
  if (!match) return null;
  const operators = await page.getOperatorList();
  const ranges: [number, number][] = [];
  let start = -1;
  operators.fnArray.forEach((operation, index) => {
    if (
      operation === OPS.beginAnnotation &&
      operators.argsArray[index]?.[0] === match.id
    )
      start = index;
    if (operation === OPS.endAnnotation && start >= 0) {
      ranges.push([start, index]);
      start = -1;
    }
  });
  if (!ranges.length) return null;
  const inside = (index: number) =>
    ranges.some(([start, end]) => index >= start && index <= end);
  const sx = width / viewport.width,
    sy = height / viewport.height;
  const artworkWidth = Math.ceil((rect[2] - rect[0]) * sx);
  const artworkHeight = Math.ceil((rect[3] - rect[1]) * sy);
  if (
    artworkWidth < 1 ||
    artworkHeight < 1 ||
    artworkWidth > width ||
    artworkHeight > height
  )
    return null;
  // Only repaint the rectangle exposed by the moved annotation. The rest of
  // the page is already correct on the visible canvas and is never copied.
  const x = Math.max(0, Math.floor(rect[0] * sx) - 4);
  const y = Math.max(0, Math.floor(rect[1] * sy) - 4);
  const right = Math.min(width, Math.ceil(rect[2] * sx) + 4);
  const bottom = Math.min(height, Math.ceil(rect[3] * sy) + 4);
  if (right <= x || bottom <= y) return null;
  const base = document.createElement("canvas");
  base.width = right - x;
  base.height = bottom - y;
  const artwork = document.createElement("canvas");
  artwork.width = artworkWidth;
  artwork.height = artworkHeight;
  const baseTask = page.render({
    canvas: base,
    viewport,
    transform: [sx, 0, 0, sy, -x, -y],
    operationsFilter: (index) => !inside(index),
  });
  const artworkTask = page.render({
    canvas: artwork,
    viewport,
    transform: [sx, 0, 0, sy, -rect[0] * sx, -rect[1] * sy],
    background: "rgba(0,0,0,0)",
    operationsFilter: (index) =>
      inside(index) || operators.fnArray[index] === OPS.dependency,
  });
  tasks.add(baseTask);
  tasks.add(artworkTask);
  try {
    await Promise.all([baseTask.promise, artworkTask.promise]);
  } finally {
    tasks.delete(baseTask);
    tasks.delete(artworkTask);
  }
  return { base, artwork, x, y };
}
