import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Crop,
  ImagePlus,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { ImageCrop, ImageFile, ImagePDFInput } from "../types";
import { IconButton } from "./Button";

type EditableImage = ImagePDFInput & {
  id: string;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  crop: ImageCrop;
  rotation: 0 | 90 | 180 | 270;
};

const fullCrop = (): ImageCrop => ({ x: 0, y: 0, width: 1, height: 1 });
const makeItem = (image: ImageFile): EditableImage => ({
  ...image,
  id: crypto.randomUUID(),
  url: URL.createObjectURL(new Blob([image.bytes.slice().buffer])),
  pixelWidth: 0,
  pixelHeight: 0,
  crop: fullCrop(),
  rotation: 0,
});
const percent = (value: number) => `${value * 100}%`;

export function ImagePDFEditor({
  initialImages,
  onAdd,
  onCancel,
  onConvert,
}: {
  initialImages: ImageFile[];
  onAdd: () => Promise<ImageFile[] | null>;
  onCancel: () => void;
  onConvert: (images: ImagePDFInput[]) => Promise<void>;
}) {
  const [items, setItems] = useState(() => initialImages.map(makeItem));
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const cropSurface = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () =>
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const update = (id: string, patch: Partial<EditableImage>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const remove = (id: string) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.url);
      const next = current.filter((item) => item.id !== id);
      if (id === selectedId)
        setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? "");
      return next;
    });
  };
  const rotate = (amount: -90 | 90) => {
    if (!selected) return;
    update(selected.id, {
      rotation: ((selected.rotation + amount + 360) %
        360) as EditableImage["rotation"],
    });
  };
  const startCropDrag = (
    event: React.PointerEvent,
    handle: "move" | "nw" | "ne" | "sw" | "se",
  ) => {
    if (!selected || !cropSurface.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = cropSurface.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, crop: selected.crop };
    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) / bounds.width;
      const dy = (moveEvent.clientY - start.y) / bounds.height;
      const min = 0.05;
      let { x, y, width, height } = start.crop;
      if (handle === "move") {
        x = Math.max(0, Math.min(1 - width, x + dx));
        y = Math.max(0, Math.min(1 - height, y + dy));
      } else {
        if (handle.includes("w")) {
          const right = x + width;
          x = Math.max(0, Math.min(right - min, x + dx));
          width = right - x;
        }
        if (handle.includes("e"))
          width = Math.max(min, Math.min(1 - x, width + dx));
        if (handle.includes("n")) {
          const bottom = y + height;
          y = Math.max(0, Math.min(bottom - min, y + dy));
          height = bottom - y;
        }
        if (handle.includes("s"))
          height = Math.max(min, Math.min(1 - y, height + dy));
      }
      update(selected.id, { crop: { x, y, width, height } });
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  };
  const outputSize = useMemo(() => {
    if (!selected?.pixelWidth || !selected.pixelHeight) return "Reading image…";
    const width = Math.round(selected.pixelWidth * selected.crop.width);
    const height = Math.round(selected.pixelHeight * selected.crop.height);
    return selected.rotation === 90 || selected.rotation === 270
      ? `${height.toLocaleString()} × ${width.toLocaleString()} px`
      : `${width.toLocaleString()} × ${height.toLocaleString()} px`;
  }, [selected]);
  const previewSize = useMemo(() => {
    const width = selected?.pixelWidth || 640;
    const height = selected?.pixelHeight || 420;
    const scale = Math.min(680 / width, 430 / height);
    return {
      width: Math.max(120, Math.round(width * scale)),
      aspectRatio: `${width} / ${height}`,
    };
  }, [selected?.pixelHeight, selected?.pixelWidth]);

  return (
    <div className="image-editor-backdrop" role="presentation">
      <section
        className="image-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-editor-title"
      >
        <header className="image-editor-header">
          <div>
            <span className="eyebrow">
              <Crop size={13} /> IMAGE WORKSPACE
            </span>
            <h2 id="image-editor-title">Prepare your PDF</h2>
            <p>Crop, rotate, remove, and arrange every page before export.</p>
          </div>
          <IconButton label="Close image editor" onClick={onCancel}>
            <X size={19} />
          </IconButton>
        </header>

        <div className="image-editor-body">
          <aside className="image-editor-pages" aria-label="PDF page order">
            <div className="image-editor-pages-title">
              <strong>
                {items.length} {items.length === 1 ? "page" : "pages"}
              </strong>
              <button
                type="button"
                className="quiet-action"
                onClick={() =>
                  void onAdd()
                    .then((added) => {
                      if (!added?.length) return;
                      const next = added.map(makeItem);
                      setItems((current) => [...current, ...next]);
                      setSelectedId(next[0].id);
                    })
                    .catch((error) => setMessage((error as Error).message))
                }
              >
                <ImagePlus size={14} /> Add
              </button>
            </div>
            <div className="image-editor-page-list">
              {items.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={`image-editor-page ${item.id === selected?.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  aria-label={`Page ${index + 1}: ${item.name}`}
                >
                  <span className="image-editor-page-number">{index + 1}</span>
                  <span className="image-editor-thumb">
                    <img
                      src={item.url}
                      alt=""
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  </span>
                  <span className="image-editor-page-name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="image-editor-page-controls">
                    <span
                      role="button"
                      aria-label={`Move page ${index + 1} up`}
                      aria-disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, -1);
                      }}
                    >
                      <ArrowUp size={13} />
                    </span>
                    <span
                      role="button"
                      aria-label={`Move page ${index + 1} down`}
                      aria-disabled={index === items.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(index, 1);
                      }}
                    >
                      <ArrowDown size={13} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="image-editor-main">
            {selected ? (
              <>
                <div className="image-editor-toolbar">
                  <div>
                    <button type="button" onClick={() => rotate(-90)}>
                      <RotateCcw size={15} /> Rotate left
                    </button>
                    <button type="button" onClick={() => rotate(90)}>
                      <RotateCw size={15} /> Rotate right
                    </button>
                    <button
                      type="button"
                      onClick={() => update(selected.id, { crop: fullCrop() })}
                    >
                      <Crop size={15} /> Reset crop
                    </button>
                  </div>
                  <button
                    type="button"
                    className="remove-image"
                    onClick={() => remove(selected.id)}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
                <div className="image-crop-workspace">
                  <div
                    className="image-crop-surface"
                    ref={cropSurface}
                    style={previewSize}
                  >
                    <img
                      src={selected.url}
                      alt={`Crop preview for ${selected.name}`}
                      onLoad={(event) =>
                        update(selected.id, {
                          pixelWidth: event.currentTarget.naturalWidth,
                          pixelHeight: event.currentTarget.naturalHeight,
                        })
                      }
                    />
                    <div
                      className="crop-shade crop-shade-top"
                      style={{ height: percent(selected.crop.y) }}
                    />
                    <div
                      className="crop-shade crop-shade-left"
                      style={{
                        top: percent(selected.crop.y),
                        height: percent(selected.crop.height),
                        width: percent(selected.crop.x),
                      }}
                    />
                    <div
                      className="crop-shade crop-shade-right"
                      style={{
                        top: percent(selected.crop.y),
                        height: percent(selected.crop.height),
                        left: percent(selected.crop.x + selected.crop.width),
                      }}
                    />
                    <div
                      className="crop-shade crop-shade-bottom"
                      style={{
                        top: percent(selected.crop.y + selected.crop.height),
                      }}
                    />
                    <div
                      className="crop-selection"
                      style={{
                        left: percent(selected.crop.x),
                        top: percent(selected.crop.y),
                        width: percent(selected.crop.width),
                        height: percent(selected.crop.height),
                      }}
                      onPointerDown={(event) => startCropDrag(event, "move")}
                    >
                      {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                        <span
                          key={handle}
                          className={`crop-handle ${handle}`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            startCropDrag(event, handle);
                          }}
                        />
                      ))}
                      <span className="crop-grid vertical one" />
                      <span className="crop-grid vertical two" />
                      <span className="crop-grid horizontal one" />
                      <span className="crop-grid horizontal two" />
                    </div>
                  </div>
                </div>
                <div className="image-editor-meta">
                  <span>
                    <strong>{selected.name}</strong>
                    {outputSize} · {selected.rotation}° rotation
                  </span>
                  <span>
                    <ShieldCheck size={14} /> Original pixels stay embedded. No
                    recompression.
                  </span>
                </div>
              </>
            ) : (
              <div className="image-editor-empty">
                <ImagePlus size={28} />
                <h3>Add an image to continue</h3>
              </div>
            )}
          </main>
        </div>

        <footer className="image-editor-footer">
          <span>
            {message ||
              "Drag the crop frame or its corners. Rotation is applied after cropping."}
          </span>
          <div>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!items.length || working}
              onClick={() => {
                setWorking(true);
                setMessage("");
                void onConvert(
                  items.map(({ name, bytes, crop, rotation }) => ({
                    name,
                    bytes,
                    crop,
                    rotation,
                  })),
                )
                  .catch((error) => setMessage((error as Error).message))
                  .finally(() => setWorking(false));
              }}
            >
              {working
                ? "Creating PDF…"
                : `Create PDF · ${items.length} ${items.length === 1 ? "page" : "pages"}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
