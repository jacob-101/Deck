import { memo, useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { AnnotationInfo, AnnotationInput, Tool } from "../types";

export type PageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  tool?: Tool;
  color?: string;
  stroke?: number;
  search?: string;
  annotations?: AnnotationInfo[];
  selectedAnnotationId?: number | null;
  onSelectAnnotation?: (id: number | null) => void;
  onUpdateAnnotationRect?: (id: number, rect: number[]) => void;
  onEditAnnotation?: (annotation: AnnotationInfo) => void;
  onAnnotate?: (annotation: AnnotationInput) => void;
  onText?: (rect: number[], type: "Text" | "FreeText") => void;
  onStamp?: (rect: number[]) => void;
  onError?: (error: string) => void;
  thumbnail?: boolean;
};

export const rgb = (hex: string) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);

type DragState = {
  type: "move" | "nw" | "ne" | "se" | "sw";
  id: number;
  startPoint: [number, number];
  originalRect: [number, number, number, number];
  currentRect: [number, number, number, number];
  aspectRatio?: number;
  isStamp: boolean;
};

export const PDFPage = memo(function PDFPage({
  pdf,
  pageNumber,
  scale,
  tool = "select",
  color = "#ddb542",
  stroke = 2,
  search = "",
  annotations = [],
  selectedAnnotationId = null,
  onSelectAnnotation,
  onUpdateAnnotationRect,
  onEditAnnotation,
  onAnnotate,
  onText,
  onStamp,
  onError,
  thumbnail = false,
}: PageProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 612 * scale,
    height: 792 * scale,
  });
  const [visible, setVisible] = useState(!thumbnail);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<number[][]>([]);
  const drawing = useRef<number[][] | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);

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
    const firstRender = !canvas.current?.width;
    if (firstRender) setReady(false);
    const run = async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale });
      const density = thumbnail
        ? 1.5
        : Math.min(window.devicePixelRatio || 1, 2);
      setSize({ width: viewport.width, height: viewport.height });
      // Render offscreen. Resizing the visible canvas clears it immediately and
      // caused a full-page flash after every annotation revision.
      const surface = document.createElement("canvas");
      surface.width = Math.ceil(viewport.width * density);
      surface.height = Math.ceil(viewport.height * density);
      render = page.render({
        canvas: surface,
        viewport,
        transform: [density, 0, 0, density, 0, 0],
      });
      await render.promise;
      if (cancelled || !canvas.current) return;
      const visibleSurface = canvas.current;
      visibleSurface.width = surface.width;
      visibleSurface.height = surface.height;
      visibleSurface.style.width = `${viewport.width}px`;
      visibleSurface.style.height = `${viewport.height}px`;
      visibleSurface.getContext("2d")?.drawImage(surface, 0, 0);
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
    const pageWidth = size.width / scale;
    const pageHeight = size.height / scale;

    if (tool === "Text" || tool === "FreeText") {
      if (tool === "Text") {
        onText?.(
          [
            start[0],
            start[1],
            Math.min(pageWidth, start[0] + 24),
            Math.min(pageHeight, start[1] + 24),
          ],
          tool,
        );
      } else {
        const isDrag =
          Math.abs(end[0] - start[0]) > 15 && Math.abs(end[1] - start[1]) > 15;
        if (isDrag) {
          onText?.(rect, "FreeText");
        } else {
          const defaultW = 220;
          const defaultH = 60;
          const x0 = Math.max(0, Math.min(pageWidth - defaultW, start[0]));
          const y0 = Math.max(0, Math.min(pageHeight - defaultH, start[1]));
          onText?.(
            [
              x0,
              y0,
              Math.min(pageWidth, x0 + defaultW),
              Math.min(pageHeight, y0 + defaultH),
            ],
            "FreeText",
          );
        }
      }
      return;
    }

    if (tool === "Stamp") {
      const isDrag =
        Math.abs(end[0] - start[0]) > 15 && Math.abs(end[1] - start[1]) > 15;
      if (isDrag) {
        onStamp?.(rect);
      } else {
        const defaultW = 180;
        const defaultH = 60;
        const x0 = Math.max(0, Math.min(pageWidth - defaultW, start[0]));
        const y0 = Math.max(0, Math.min(pageHeight - defaultH, start[1]));
        onStamp?.([
          x0,
          y0,
          Math.min(pageWidth, x0 + defaultW),
          Math.min(pageHeight, y0 + defaultH),
        ]);
      }
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

  // Drag & Resize Handlers
  const handleStartMove = (
    annot: AnnotationInfo,
    e: React.PointerEvent,
  ) => {
    if (tool !== "select" || annot.locked || !annot.editable) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectAnnotation?.(annot.id);
    const p = point(e);
    const rect = annot.rect || [0, 0, 0, 0];
    const originalRect: [number, number, number, number] = [
      rect[0],
      rect[1],
      rect[2],
      rect[3],
    ];
    const isStamp = annot.type === "Stamp";
    const w = originalRect[2] - originalRect[0];
    const h = originalRect[3] - originalRect[1];
    const aspectRatio = h > 0 ? w / h : 1;

    setActiveDrag({
      type: "move",
      id: annot.id,
      startPoint: [p[0], p[1]],
      originalRect,
      currentRect: [...originalRect],
      aspectRatio,
      isStamp,
    });
  };

  const handleStartResize = (
    handleType: "nw" | "ne" | "se" | "sw",
    annot: AnnotationInfo,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const rect = annot.rect || [0, 0, 0, 0];
    const originalRect: [number, number, number, number] = [
      rect[0],
      rect[1],
      rect[2],
      rect[3],
    ];
    const isStamp = annot.type === "Stamp";
    const w = originalRect[2] - originalRect[0];
    const h = originalRect[3] - originalRect[1];
    const aspectRatio = h > 0 ? w / h : 1;

    setActiveDrag({
      type: handleType,
      id: annot.id,
      startPoint: [p[0], p[1]],
      originalRect,
      currentRect: [...originalRect],
      aspectRatio,
      isStamp,
    });
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    const p = point(e);
    const dx = p[0] - activeDrag.startPoint[0];
    const dy = p[1] - activeDrag.startPoint[1];
    const [ox0, oy0, ox1, oy1] = activeDrag.originalRect;
    const pageWidth = size.width / scale;
    const pageHeight = size.height / scale;

    let nx0 = ox0;
    let ny0 = oy0;
    let nx1 = ox1;
    let ny1 = oy1;

    if (activeDrag.type === "move") {
      const w = ox1 - ox0;
      const h = oy1 - oy0;
      nx0 = Math.max(0, Math.min(pageWidth - w, ox0 + dx));
      ny0 = Math.max(0, Math.min(pageHeight - h, oy0 + dy));
      nx1 = nx0 + w;
      ny1 = ny0 + h;
    } else {
      if (activeDrag.type === "se") {
        nx1 = Math.min(pageWidth, Math.max(ox0 + 20, ox1 + dx));
        if (activeDrag.isStamp && activeDrag.aspectRatio) {
          const newW = nx1 - ox0;
          ny1 = Math.min(pageHeight, ox0 + newW / activeDrag.aspectRatio);
        } else {
          ny1 = Math.min(pageHeight, Math.max(oy0 + 15, oy1 + dy));
        }
      } else if (activeDrag.type === "sw") {
        nx0 = Math.max(0, Math.min(ox1 - 20, ox0 + dx));
        if (activeDrag.isStamp && activeDrag.aspectRatio) {
          const newW = ox1 - nx0;
          ny1 = Math.min(pageHeight, oy0 + newW / activeDrag.aspectRatio);
        } else {
          ny1 = Math.min(pageHeight, Math.max(oy0 + 15, oy1 + dy));
        }
      } else if (activeDrag.type === "ne") {
        nx1 = Math.min(pageWidth, Math.max(ox0 + 20, ox1 + dx));
        if (activeDrag.isStamp && activeDrag.aspectRatio) {
          const newW = nx1 - ox0;
          ny0 = Math.max(0, oy1 - newW / activeDrag.aspectRatio);
        } else {
          ny0 = Math.max(0, Math.min(oy1 - 15, oy0 + dy));
        }
      } else if (activeDrag.type === "nw") {
        nx0 = Math.max(0, Math.min(ox1 - 20, ox0 + dx));
        if (activeDrag.isStamp && activeDrag.aspectRatio) {
          const newW = ox1 - nx0;
          ny0 = Math.max(0, oy1 - newW / activeDrag.aspectRatio);
        } else {
          ny0 = Math.max(0, Math.min(oy1 - 15, oy0 + dy));
        }
      }
    }

    setActiveDrag((prev) =>
      prev ? { ...prev, currentRect: [nx0, ny0, nx1, ny1] } : null,
    );
  };

  const handleDragEnd = () => {
    if (!activeDrag) return;
    const { id, originalRect, currentRect } = activeDrag;
    setActiveDrag(null);

    const changed =
      Math.abs(currentRect[0] - originalRect[0]) > 0.5 ||
      Math.abs(currentRect[1] - originalRect[1]) > 0.5 ||
      Math.abs(currentRect[2] - originalRect[2]) > 0.5 ||
      Math.abs(currentRect[3] - originalRect[3]) > 0.5;

    if (changed) {
      onUpdateAnnotationRect?.(id, [
        Math.round(currentRect[0]),
        Math.round(currentRect[1]),
        Math.round(currentRect[2]),
        Math.round(currentRect[3]),
      ]);
    }
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
      onClick={(e) => {
        if (e.target === container.current || e.target === canvas.current) {
          onSelectAnnotation?.(null);
        }
      }}
    >
      <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} />
      <div ref={text} className="textLayer" />
      {!ready && (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      )}

      {/* Interactive Selection and Hit Targets in Select Mode */}
      {!thumbnail && ready && tool === "select" && (
        <div
          className="annotation-interaction-layer"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: activeDrag ? "all" : "none",
            zIndex: 10,
          }}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={() => setActiveDrag(null)}
        >
          {annotations
            .filter(
              (ann) =>
                ann.editable &&
                (ann.type === "FreeText" ||
                  ann.type === "Stamp" ||
                  ann.type === "Square" ||
                  ann.type === "Circle" ||
                  ann.type === "Text"),
            )
            .map((ann) => {
              const r =
                activeDrag && activeDrag.id === ann.id
                  ? activeDrag.currentRect
                  : ann.rect || [0, 0, 0, 0];
              const isSelected = ann.id === selectedAnnotationId;
              const left = r[0] * scale;
              const top = r[1] * scale;
              const width = Math.max(12, (r[2] - r[0]) * scale);
              const height = Math.max(12, (r[3] - r[1]) * scale);

              return (
                <div
                  key={ann.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${ann.type} annotation ${ann.id + 1}`}
                  style={{
                    position: "absolute",
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                    pointerEvents: "auto",
                    cursor: isSelected ? "move" : "pointer",
                    border: isSelected
                      ? "1.5px dashed var(--green, #365a47)"
                      : "1.5px solid transparent",
                    background: isSelected
                      ? "rgba(54, 90, 71, 0.06)"
                      : "transparent",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  onPointerDown={(e) => handleStartMove(ann, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onEditAnnotation?.(ann);
                  }}
                >
                  {/* Resize Handles when selected */}
                  {isSelected && (
                    <>
                      {(["nw", "ne", "se", "sw"] as const).map((handle) => {
                        const style: React.CSSProperties = {
                          position: "absolute",
                          width: "8px",
                          height: "8px",
                          background: "#ffffff",
                          border: "1.5px solid var(--green, #365a47)",
                          borderRadius: "2px",
                          pointerEvents: "auto",
                        };
                        if (handle === "nw") {
                          style.top = "-4px";
                          style.left = "-4px";
                          style.cursor = "nwse-resize";
                        } else if (handle === "ne") {
                          style.top = "-4px";
                          style.right = "-4px";
                          style.cursor = "nesw-resize";
                        } else if (handle === "se") {
                          style.bottom = "-4px";
                          style.right = "-4px";
                          style.cursor = "nwse-resize";
                        } else if (handle === "sw") {
                          style.bottom = "-4px";
                          style.left = "-4px";
                          style.cursor = "nesw-resize";
                        }
                        return (
                          <div
                            key={handle}
                            style={style}
                            onPointerDown={(e) =>
                              handleStartResize(handle, ann, e)
                            }
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Drawing SVG Overlay */}
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
                fill={tool === "Stamp" ? "rgba(54, 90, 71, 0.08)" : "none"}
                strokeDasharray={tool === "Stamp" ? "4 4" : undefined}
                stroke={tool === "Stamp" ? "#365a47" : color}
                strokeWidth={tool === "Stamp" ? 1.5 : stroke}
              />
            ))}
        </svg>
      )}
    </div>
  );
});
