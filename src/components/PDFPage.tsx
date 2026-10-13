import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import type { AnnotationInfo, AnnotationInput, Tool } from "../types";
import { annotationPreview } from "../core/annotation-preview";

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
  onUpdateAnnotationRect?: (
    id: number,
    rect: number[],
  ) => Promise<boolean> | void;
  onEditAnnotation?: (annotation: AnnotationInfo) => void;
  onAnnotate?: (annotation: AnnotationInput) => Promise<boolean> | void;
  onText?: (rect: number[], type: "Text" | "FreeText") => void;
  onStamp?: (rect: number[]) => void;
  onError?: (error: string) => void;
  thumbnail?: boolean;
  disabled?: boolean;
  revisionId?: string;
  sourceRevisionId?: string;
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
  disabled = false,
  revisionId = "",
  sourceRevisionId = "",
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
  const [paintedRevisionId, setPaintedRevisionId] = useState("");
  const current = !revisionId || paintedRevisionId === revisionId;
  const [draft, setDraft] = useState<number[][]>([]);
  const drawing = useRef<number[][] | null>(null);
  const pendingDraft = useRef<number[][] | null>(null);
  const draftFrame = useRef<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);
  const activeDragRef = useRef<DragState | null>(null);
  const dragFrame = useRef<number | null>(null);
  const interactionBounds = useRef<DOMRect | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const previewTasks = useRef(new Set<RenderTask>());
  const dragGeneration = useRef(0);
  const [artwork, setArtwork] = useState<HTMLCanvasElement | null>(null);
  const originalCanvas = useRef<HTMLCanvasElement | null>(null);
  const [pendingMark, setPendingMark] = useState<{
    tool: Tool;
    color: string;
    stroke: number;
    quads?: number[][];
  } | null>(null);

  const cancelDragPreview = () => {
    dragGeneration.current++;
    for (const task of previewTasks.current) task.cancel();
    previewTasks.current.clear();
    if (originalCanvas.current && canvas.current) {
      const ctx = canvas.current.getContext("2d");
      ctx?.clearRect(0, 0, canvas.current.width, canvas.current.height);
      ctx?.drawImage(originalCanvas.current, 0, 0);
    }
    originalCanvas.current = null;
    setArtwork(null);
    setActiveDrag(null);
  };
  const prepareDragPreview = (annotation: AnnotationInfo) => {
    const generation = ++dragGeneration.current;
    const source = canvas.current;
    if (!source) return;
    void annotationPreview(
      pdf,
      pageNumber,
      scale,
      annotation,
      source.width,
      source.height,
      previewTasks.current,
    )
      .then((result) => {
        if (!result || generation !== dragGeneration.current || !canvas.current)
          return;
        const original = document.createElement("canvas");
        original.width = source.width;
        original.height = source.height;
        original.getContext("2d")?.drawImage(source, 0, 0);
        originalCanvas.current = original;
        source.getContext("2d")?.drawImage(result.base, 0, 0);
        setArtwork(result.artwork);
      })
      .catch(() => {
        /* Keep the selection outline if an appearance cannot be isolated. */
      });
  };
  useLayoutEffect(() => {
    if (!artwork || !previewCanvas.current) return;
    previewCanvas.current.width = artwork.width;
    previewCanvas.current.height = artwork.height;
    previewCanvas.current.getContext("2d")?.drawImage(artwork, 0, 0);
  }, [artwork]);

  useEffect(
    () => () => {
      if (draftFrame.current !== null) cancelAnimationFrame(draftFrame.current);
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      dragGeneration.current++;
      for (const task of previewTasks.current) task.cancel();
    },
    [],
  );

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
    let cancelIdle: (() => void) | undefined;
    const reportFailure = (error: { name?: string }) => {
      if (
        !cancelled &&
        error?.name !== "RenderingCancelledException" &&
        error?.name !== "AbortException"
      )
        onError?.("Could not render this page. Try reopening the document.");
    };
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
      setPaintedRevisionId(sourceRevisionId);
      // Swap persisted pixels and remove optimistic overlays in the same paint.
      dragGeneration.current++;
      originalCanvas.current = null;
      setArtwork(null);
      setActiveDrag(null);
      setPendingMark(null);
      setDraft([]);
      // Mark the page ready immediately so the canvas is visible without
      // waiting for the text layer. Selection and search load lazily below.
      if (!cancelled) setReady(true);
      if (!thumbnail) {
        const textContainer = text.current;
        const capturedViewport = viewport;
        // requestIdleCallback (with setTimeout fallback) defers text layer
        // work to idle time so the visible canvas is never blocked by it.
        const renderText = async () => {
          if (cancelled) return;
          const content = await page.getTextContent();
          if (cancelled) return;
          const staging = document.createElement("div");
          staging.className = "textLayer";
          textLayer = new TextLayer({
            textContentSource: content,
            container: staging,
            viewport: capturedViewport,
          });
          await textLayer.render();
          if (!cancelled) {
            textContainer.style.cssText = staging.style.cssText;
            textContainer.replaceChildren(...staging.childNodes);
          }
        };
        const callback = () => {
          void renderText().catch(reportFailure);
        };
        if (window.requestIdleCallback) {
          const id = window.requestIdleCallback(callback, { timeout: 250 });
          cancelIdle = () => window.cancelIdleCallback(id);
        } else {
          const id = window.setTimeout(callback, 0);
          cancelIdle = () => window.clearTimeout(id);
        }
      }
    };
    void run().catch(reportFailure);
    return () => {
      cancelled = true;
      cancelIdle?.();
      render?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, visible, thumbnail, onError, sourceRevisionId]);

  // Search changes should only update existing text-layer spans. Re-rendering
  // the PDF canvas for every search keystroke is expensive and can cause
  // visible flicker on large pages. A MutationObserver also handles the case
  // where the text layer is still being created during an idle callback.
  useEffect(() => {
    if (thumbnail || !ready || !text.current) return;
    const container = text.current;
    const applySearch = () => {
      const term = search.trim().toLowerCase();
      for (const span of container.querySelectorAll("span")) {
        const matches =
          !!term && (span.textContent?.toLowerCase().includes(term) ?? false);
        span.classList.toggle("search-match", matches);
      }
    };
    applySearch();
    const observer = new MutationObserver(applySearch);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [search, ready, thumbnail]);

  const point = (event: React.PointerEvent) => {
    const rect =
      interactionBounds.current ?? container.current!.getBoundingClientRect();
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
  const previewTool = pendingMark?.tool ?? tool;
  const previewColor = pendingMark?.color ?? color;
  const previewStroke = pendingMark?.stroke ?? stroke;
  const drawMode = !!pendingMark || (tool !== "select" && !markup);

  const selectionEnd = () => {
    if (disabled || !current || !markup || !ready || pendingMark) return;
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
    setPendingMark({ tool, color, stroke, quads });
    void Promise.resolve(
      onAnnotate?.({
        type: tool,
        rect: [first[0], first[1], first[6], first[7]],
        quads,
        color: rgb(color),
        width: stroke,
        contents: selection.toString(),
      }),
    ).then((success) => {
      if (success === false) setPendingMark(null);
    });
    selection.removeAllRanges();
  };

  const finishDrawing = (event: React.PointerEvent) => {
    const points = drawing.current;
    if (!points) return;
    drawing.current = null;
    interactionBounds.current = null;
    pendingDraft.current = null;
    if (draftFrame.current !== null) {
      cancelAnimationFrame(draftFrame.current);
      draftFrame.current = null;
    }
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
      setDraft([]);
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
      setDraft([]);
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
    ) {
      setDraft([]);
      return;
    }
    if (tool === "Ink" && points.length < 2) {
      setDraft([]);
      return;
    }
    setDraft([...points, end]);
    setPendingMark({ tool, color, stroke });
    void Promise.resolve(
      onAnnotate?.({
        type: tool,
        rect,
        points: tool === "Ink" ? [...points, end] : [start, end],
        color: rgb(color),
        width: stroke,
      }),
    ).then((success) => {
      if (success === false) {
        setPendingMark(null);
        setDraft([]);
      }
    });
  };

  // Drag & Resize Handlers
  const handleStartMove = (annot: AnnotationInfo, e: React.PointerEvent) => {
    if (
      disabled ||
      !current ||
      activeDrag ||
      e.button !== 0 ||
      tool !== "select" ||
      annot.locked ||
      !annot.editable
    )
      return;
    e.stopPropagation();
    interactionBounds.current =
      container.current?.getBoundingClientRect() ?? null;
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

    const drag: DragState = {
      type: "move",
      id: annot.id,
      startPoint: [p[0], p[1]],
      originalRect,
      currentRect: [...originalRect],
      aspectRatio,
      isStamp,
    };
    activeDragRef.current = drag;
    setActiveDrag(drag);
    prepareDragPreview(annot);
  };

  const handleStartResize = (
    handleType: "nw" | "ne" | "se" | "sw",
    annot: AnnotationInfo,
    e: React.PointerEvent,
  ) => {
    if (
      disabled ||
      !current ||
      activeDragRef.current ||
      e.button !== 0 ||
      annot.locked ||
      !annot.editable
    )
      return;
    e.stopPropagation();
    interactionBounds.current =
      container.current?.getBoundingClientRect() ?? null;
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

    const drag: DragState = {
      type: handleType,
      id: annot.id,
      startPoint: [p[0], p[1]],
      originalRect,
      currentRect: [...originalRect],
      aspectRatio,
      isStamp,
    };
    activeDragRef.current = drag;
    setActiveDrag(drag);
    prepareDragPreview(annot);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    const drag = activeDragRef.current;
    if (!drag) return;
    const p = point(e);
    const dx = p[0] - drag.startPoint[0];
    const dy = p[1] - drag.startPoint[1];
    const [ox0, oy0, ox1, oy1] = drag.originalRect;
    const pageWidth = size.width / scale;
    const pageHeight = size.height / scale;

    let nx0 = ox0;
    let ny0 = oy0;
    let nx1 = ox1;
    let ny1 = oy1;

    if (drag.type === "move") {
      const w = ox1 - ox0;
      const h = oy1 - oy0;
      nx0 = Math.max(0, Math.min(pageWidth - w, ox0 + dx));
      ny0 = Math.max(0, Math.min(pageHeight - h, oy0 + dy));
      nx1 = nx0 + w;
      ny1 = ny0 + h;
    } else {
      if (drag.type === "se") {
        nx1 = Math.min(pageWidth, Math.max(ox0 + 20, ox1 + dx));
        if (drag.isStamp && drag.aspectRatio) {
          const newW = nx1 - ox0;
          ny1 = Math.min(pageHeight, oy0 + newW / drag.aspectRatio);
        } else {
          ny1 = Math.min(pageHeight, Math.max(oy0 + 15, oy1 + dy));
        }
      } else if (drag.type === "sw") {
        nx0 = Math.max(0, Math.min(ox1 - 20, ox0 + dx));
        if (drag.isStamp && drag.aspectRatio) {
          const newW = ox1 - nx0;
          ny1 = Math.min(pageHeight, oy0 + newW / drag.aspectRatio);
        } else {
          ny1 = Math.min(pageHeight, Math.max(oy0 + 15, oy1 + dy));
        }
      } else if (drag.type === "ne") {
        nx1 = Math.min(pageWidth, Math.max(ox0 + 20, ox1 + dx));
        if (drag.isStamp && drag.aspectRatio) {
          const newW = nx1 - ox0;
          ny0 = Math.max(0, oy1 - newW / drag.aspectRatio);
        } else {
          ny0 = Math.max(0, Math.min(oy1 - 15, oy0 + dy));
        }
      } else if (drag.type === "nw") {
        nx0 = Math.max(0, Math.min(ox1 - 20, ox0 + dx));
        if (drag.isStamp && drag.aspectRatio) {
          const newW = ox1 - nx0;
          ny0 = Math.max(0, oy1 - newW / drag.aspectRatio);
        } else {
          ny0 = Math.max(0, Math.min(oy1 - 15, oy0 + dy));
        }
      }
    }

    const next: DragState = {
      ...drag,
      currentRect: [nx0, ny0, nx1, ny1],
    };
    activeDragRef.current = next;
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const latest = activeDragRef.current;
      if (latest) setActiveDrag({ ...latest });
    });
  };

  const handleDragEnd = (event: React.PointerEvent) => {
    handleDragMove(event);
    const drag = activeDragRef.current;
    if (!drag) return;
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    const { id, originalRect, currentRect } = drag;
    activeDragRef.current = null;
    interactionBounds.current = null;

    const changed =
      Math.abs(currentRect[0] - originalRect[0]) > 0.5 ||
      Math.abs(currentRect[1] - originalRect[1]) > 0.5 ||
      Math.abs(currentRect[2] - originalRect[2]) > 0.5 ||
      Math.abs(currentRect[3] - originalRect[3]) > 0.5;

    if (!changed) {
      cancelDragPreview();
      return;
    }
    setActiveDrag({ ...drag });
    void Promise.resolve(
      onUpdateAnnotationRect?.(id, currentRect.map(Math.round)),
    ).then((success) => {
      if (success === false) cancelDragPreview();
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
      data-ready={ready && current}
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

      {activeDrag && artwork && (
        <canvas
          ref={previewCanvas}
          className="annotation-drag-preview"
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            zIndex: 9,
            left: activeDrag.currentRect[0] * scale,
            top: activeDrag.currentRect[1] * scale,
            width:
              (activeDrag.currentRect[2] - activeDrag.currentRect[0]) * scale,
            height:
              (activeDrag.currentRect[3] - activeDrag.currentRect[1]) * scale,
          }}
        />
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
          onPointerCancel={() => {
            activeDragRef.current = null;
            if (dragFrame.current !== null) {
              cancelAnimationFrame(dragFrame.current);
              dragFrame.current = null;
            }
            cancelDragPreview();
          }}
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
                    if (!disabled && current) onEditAnnotation?.(ann);
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
                            role="button"
                            aria-label={`${handle.toUpperCase()} resize handle for ${ann.type} annotation ${ann.id + 1}`}
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
            if (disabled || !current || event.button !== 0 || pendingMark)
              return;
            event.currentTarget.setPointerCapture(event.pointerId);
            interactionBounds.current =
              container.current?.getBoundingClientRect() ?? null;
            const p = point(event);
            drawing.current = [p];
            setDraft([p]);
          }}
          onPointerMove={(event) => {
            if (!drawing.current || pendingMark) return;
            const points = drawing.current;
            if (tool === "Ink") {
              // Only record a new point when it's moved at least 1.5 px from
              // the last one — cuts polyline vertex count by 50–80% with no
              // visible quality loss at normal drawing speeds.
              const p = point(event);
              const last = points[points.length - 1];
              if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.5)
                points.push(p);
            } else drawing.current = [points[0], point(event)];
            pendingDraft.current = drawing.current;
            if (draftFrame.current !== null) return;
            draftFrame.current = requestAnimationFrame(() => {
              draftFrame.current = null;
              if (pendingDraft.current) setDraft([...pendingDraft.current]);
            });
          }}
          onPointerUp={finishDrawing}
          onPointerCancel={() => {
            drawing.current = null;
            interactionBounds.current = null;
            pendingDraft.current = null;
            if (draftFrame.current !== null) {
              cancelAnimationFrame(draftFrame.current);
              draftFrame.current = null;
            }
            setDraft([]);
          }}
        >
          {pendingMark?.quads?.map((q, index) =>
            pendingMark.tool === "Highlight" ? (
              <polygon
                key={index}
                points={`${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`}
                fill={pendingMark.color}
                fillOpacity={0.35}
              />
            ) : (
              <line
                key={index}
                x1={q[4]}
                x2={q[6]}
                y1={pendingMark.tool === "Underline" ? q[5] : (q[1] + q[5]) / 2}
                y2={pendingMark.tool === "Underline" ? q[7] : (q[3] + q[7]) / 2}
                stroke={pendingMark.color}
                strokeWidth={1}
              />
            ),
          )}
          {a &&
            b &&
            (previewTool === "Ink" ? (
              <polyline
                points={draft.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={previewColor}
                strokeWidth={previewStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : previewTool === "Circle" ? (
              <ellipse
                cx={(a[0] + b[0]) / 2}
                cy={(a[1] + b[1]) / 2}
                rx={Math.abs(b[0] - a[0]) / 2}
                ry={Math.abs(b[1] - a[1]) / 2}
                fill="none"
                stroke={previewColor}
                strokeWidth={previewStroke}
              />
            ) : previewTool === "Line" ? (
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={previewColor}
                strokeWidth={previewStroke}
              />
            ) : (
              <rect
                x={Math.min(a[0], b[0])}
                y={Math.min(a[1], b[1])}
                width={Math.abs(b[0] - a[0])}
                height={Math.abs(b[1] - a[1])}
                fill={
                  previewTool === "Stamp" ? "rgba(54, 90, 71, 0.08)" : "none"
                }
                strokeDasharray={previewTool === "Stamp" ? "4 4" : undefined}
                stroke={previewTool === "Stamp" ? "#365a47" : previewColor}
                strokeWidth={previewTool === "Stamp" ? 1.5 : previewStroke}
              />
            ))}
        </svg>
      )}
    </div>
  );
});
