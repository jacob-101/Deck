import { memo, useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { AnnotationInput, Tool } from "../types";

export type PageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  tool?: Tool;
  color?: string;
  stroke?: number;
  search?: string;
  onAnnotate?: (annotation: AnnotationInput) => void;
  onText?: (rect: number[], type: "Text" | "FreeText") => void;
  onError?: (error: string) => void;
  thumbnail?: boolean;
};
export const rgb = (hex: string) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
export const PDFPage = memo(function PDFPage({
  pdf,
  pageNumber,
  scale,
  tool = "select",
  color = "#ddb542",
  stroke = 2,
  search = "",
  onAnnotate,
  onText,
  onError,
  thumbnail = false,
}: PageProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 612 * scale, height: 792 * scale });
  const [visible, setVisible] = useState(!thumbnail);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<number[][]>([]);
  const drawing = useRef<number[][] | null>(null);
  useEffect(() => {
    if (!thumbnail || !container.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [thumbnail]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    setReady(false);
    const run = async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale });
      const density = thumbnail
        ? 1.5
        : Math.min(window.devicePixelRatio || 1, 2);
      setSize({ width: viewport.width, height: viewport.height });
      const surface = canvas.current;
      surface.width = Math.ceil(viewport.width * density);
      surface.height = Math.ceil(viewport.height * density);
      surface.style.width = `${viewport.width}px`;
      surface.style.height = `${viewport.height}px`;
      render = page.render({
        canvas: surface,
        viewport,
        transform: [density, 0, 0, density, 0, 0],
      });
      await render.promise;
      if (cancelled) return;
      text.current.replaceChildren();
      if (!thumbnail) {
        textLayer = new TextLayer({
          textContentSource: await page.getTextContent(),
          container: text.current,
          viewport,
        });
        await textLayer.render();
        if (search.trim())
          for (const span of text.current.querySelectorAll("span"))
            if (span.textContent?.toLowerCase().includes(search.toLowerCase()))
              span.classList.add("search-match");
      }
      if (!cancelled) setReady(true);
    };
    void run().catch((error) => {
      if (
        !cancelled &&
        error?.name !== "RenderingCancelledException" &&
        error?.name !== "AbortException"
      )
        onError?.("Could not render this page. Try reopening the document.");
    });
    return () => {
      cancelled = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, visible, thumbnail, search, onError]);
  const point = (event: React.PointerEvent) => {
    const rect = container.current!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(size.width / scale, (event.clientX - rect.left) / scale),
      ),
      Math.max(
        0,
        Math.min(size.height / scale, (event.clientY - rect.top) / scale),
      ),
    ];
  };
  const markup =
    tool === "Highlight" || tool === "Underline" || tool === "StrikeOut";
  const drawMode = tool !== "select" && !markup;
  const selectionEnd = () => {
    if (!markup || !ready) return;
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      selection.isCollapsed ||
      !container.current?.contains(selection.anchorNode) ||
      !container.current.contains(selection.focusNode)
    )
      return;
    const base = container.current.getBoundingClientRect();
    const rectangles = [...selection.getRangeAt(0).getClientRects()].filter(
      (rect) =>
        rect.width > 1 &&
        rect.height > 1 &&
        rect.left >= base.left - 1 &&
        rect.right <= base.right + 1,
    );
    if (!rectangles.length) return;
    const quads = rectangles.map((rect) => [
      (rect.left - base.left) / scale,
      (rect.top - base.top) / scale,
      (rect.right - base.left) / scale,
      (rect.top - base.top) / scale,
      (rect.left - base.left) / scale,
      (rect.bottom - base.top) / scale,
      (rect.right - base.left) / scale,
      (rect.bottom - base.top) / scale,
    ]);
    const first = quads[0];
    onAnnotate?.({
      type: tool,
      rect: [first[0], first[1], first[6], first[7]],
      quads,
      color: rgb(color),
      width: stroke,
      contents: selection.toString(),
    });
    selection.removeAllRanges();
  };
  const finishDrawing = (event: React.PointerEvent) => {
    const points = drawing.current;
    if (!points) return;
    drawing.current = null;
    setDraft([]);
    const end = point(event);
    const start = points[0];
    const rect = [
      Math.min(start[0], end[0]),
      Math.min(start[1], end[1]),
      Math.max(start[0], end[0]),
      Math.max(start[1], end[1]),
    ];
    if (tool === "Text" || tool === "FreeText") {
      onText?.(
        tool === "Text"
          ? [start[0], start[1], start[0] + 24, start[1] + 24]
          : [
              start[0],
              start[1],
              Math.min(size.width / scale, start[0] + 230),
              Math.min(size.height / scale, start[1] + 72),
            ],
        tool,
      );
      return;
    }
    if (
      tool === "select" ||
      markup ||
      (Math.abs(end[0] - start[0]) < 2 &&
        Math.abs(end[1] - start[1]) < 2 &&
        tool !== "Ink")
    )
      return;
    if (tool === "Ink" && points.length < 2) return;
    onAnnotate?.({
      type: tool,
      rect,
      points: tool === "Ink" ? [...points, end] : [start, end],
      color: rgb(color),
      width: stroke,
    });
  };
  const a = draft[0];
  const b = draft[draft.length - 1];
  return (
    <div
      ref={container}
      className={`pdf-page ${thumbnail ? "thumbnail-page" : ""} ${drawMode ? "drawing" : ""}`}
      style={
        {
          width: size.width,
          height: size.height,
          "--scale-factor": scale,
        } as React.CSSProperties
      }
      data-ready={ready}
      onMouseUp={selectionEnd}
    >
      <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} />
      <div ref={text} className="textLayer" />
      {!ready && (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      )}
      {drawMode && ready && (
        <svg
          className="draw-layer"
          viewBox={`0 0 ${size.width / scale} ${size.height / scale}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const p = point(event);
            drawing.current = [p];
            setDraft([p]);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const points =
              tool === "Ink"
                ? [...drawing.current, point(event)]
                : [drawing.current[0], point(event)];
            drawing.current = points;
            setDraft(points);
          }}
          onPointerUp={finishDrawing}
          onPointerCancel={() => {
            drawing.current = null;
            setDraft([]);
          }}
        >
          {a &&
            b &&
            (tool === "Ink" ? (
              <polyline
                points={draft.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : tool === "Circle" ? (
              <ellipse
                cx={(a[0] + b[0]) / 2}
                cy={(a[1] + b[1]) / 2}
                rx={Math.abs(b[0] - a[0]) / 2}
                ry={Math.abs(b[1] - a[1]) / 2}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
              />
            ) : tool === "Line" ? (
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={color}
                strokeWidth={stroke}
              />
            ) : (
              <rect
                x={Math.min(a[0], b[0])}
                y={Math.min(a[1], b[1])}
                width={Math.abs(b[0] - a[0])}
                height={Math.abs(b[1] - a[1])}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
              />
            ))}
        </svg>
      )}
    </div>
  );
});
