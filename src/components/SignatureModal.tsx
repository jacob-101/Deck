import { useEffect, useRef, useState } from "react";
import {
  PenTool,
  Type,
  Upload,
  Bookmark,
  Trash2,
  Undo2,
  X,
  ShieldAlert,
} from "lucide-react";
import {
  getSavedSignatures,
  saveSignature,
  deleteSavedSignature,
  type SavedSignature,
} from "../core/preferences";
import { IconButton } from "./Button";

export type SignatureResult = {
  imageBytes: Uint8Array;
  name: string;
  width: number;
  height: number;
};

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
function bytesToDataUrl(bytes: Uint8Array) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not encode signature."));
    reader.readAsDataURL(
      new Blob([Uint8Array.from(bytes).buffer], { type: "image/png" }),
    );
  });
}

export function SignatureModal({
  onSelect,
  onClose,
}: {
  onSelect: (sig: SignatureResult) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"draw" | "type" | "import" | "saved">("draw");
  const [savedList, setSavedList] = useState<SavedSignature[]>([]);
  const [saveOptIn, setSaveOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Draw state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawBoundsRef = useRef<DOMRect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState("#1f2421");

  // Type state
  const [typedName, setTypedName] = useState("");
  const [selectedFontIndex, setSelectedFontIndex] = useState(0);

  // Import state
  const [importedDataUrl, setImportedDataUrl] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);

  useEffect(() => {
    dialog.current?.showModal();
    const list = getSavedSignatures();
    setSavedList(list);
    if (list.length > 0) {
      setTab("saved");
    }
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (tab === "draw" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx && strokeHistory.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [tab, strokeHistory]);

  const startDraw = (
    event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save current state for undo
    setStrokeHistory((prev) => [
      ...prev,
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ]);

    const rect = canvas.getBoundingClientRect();
    drawBoundsRef.current = rect;
    if ("pointerId" in event) canvas.setPointerCapture(event.pointerId);
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const drawMove = (
    event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent,
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = drawBoundsRef.current ?? canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
    drawBoundsRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeHistory([]);
    setHasDrawn(false);
  };

  const undoStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokeHistory.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const last = strokeHistory[strokeHistory.length - 1];
    ctx.putImageData(last, 0, 0);
    setStrokeHistory((prev) => prev.slice(0, -1));
    if (strokeHistory.length <= 1) {
      setHasDrawn(false);
    }
  };

  // Type fonts
  const fontStyles = [
    {
      name: "Elegant Script",
      font: "italic 36px 'Brush Script MT', 'Apple Chancery', 'Segoe Script', cursive",
    },
    {
      name: "Classic Cursive",
      font: "italic 34px 'Snell Roundhand', 'Savoye LET', 'Zapfino', cursive",
    },
    {
      name: "Modern Hand",
      font: "italic 32px 'Bradley Hand', 'Chalkboard', cursive",
    },
  ];

  // Image import
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (
      !validTypes.includes(file.type.toLowerCase()) &&
      !file.name.match(/\.(png|jpe?g)$/i)
    ) {
      setError("Please choose a PNG or JPEG image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose an image under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImportedDataUrl(result);
    };
    reader.onerror = () => {
      setError("Could not read the selected image file.");
    };
    reader.readAsDataURL(file);
  };

  const generateSignature = async () => {
    setError("");
    setBusy(true);

    try {
      if (tab === "draw") {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) {
          setError("Please draw your signature first.");
          setBusy(false);
          return;
        }

        // Trim blank canvas edges for clean bounds
        const trimmed = getTrimmedCanvas(canvas);
        if (!trimmed || trimmed.width < 5 || trimmed.height < 5) {
          setError("The signature is empty. Please draw a visible signature.");
          setBusy(false);
          return;
        }
        const dataUrl = trimmed.toDataURL("image/png");
        const bytes = dataUrlToBytes(dataUrl);

        if (saveOptIn) {
          try {
            saveSignature({
              name: "Drawn Signature",
              dataUrl,
              kind: "draw",
            });
          } catch (storageErr) {
            setError((storageErr as Error).message);
          }
        }

        onSelect({
          imageBytes: bytes,
          name: "Drawn Signature",
          width: trimmed.width,
          height: trimmed.height,
        });
        onClose();
      } else if (tab === "type") {
        if (!typedName.trim()) {
          setError("Please enter your name or initials.");
          setBusy(false);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not initialize canvas context");

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = fontStyles[selectedFontIndex].font;
        ctx.fillStyle = "#1f2421";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2);

        const trimmed = getTrimmedCanvas(canvas);
        if (!trimmed || trimmed.width < 5 || trimmed.height < 5) {
          setError("Could not generate text signature. Please try again.");
          setBusy(false);
          return;
        }
        const dataUrl = trimmed.toDataURL("image/png");
        const bytes = dataUrlToBytes(dataUrl);

        if (saveOptIn) {
          try {
            saveSignature({
              name: typedName.trim(),
              dataUrl,
              kind: "type",
            });
          } catch (storageErr) {
            setError((storageErr as Error).message);
          }
        }

        onSelect({
          imageBytes: bytes,
          name: typedName.trim(),
          width: trimmed.width,
          height: trimmed.height,
        });
        onClose();
      } else if (tab === "import") {
        if (!importedDataUrl) {
          setError("Please select an image file to import.");
          setBusy(false);
          return;
        }

        const sourceBytes = dataUrlToBytes(importedDataUrl);
        if (window.desktop) {
          const prepared = await window.desktop.prepareSignature(
            sourceBytes,
            removeBackground,
          );
          if (saveOptIn) {
            try {
              saveSignature({
                name: "Imported Signature",
                dataUrl: await bytesToDataUrl(prepared.bytes),
                kind: "import",
              });
            } catch (storageErr) {
              setError((storageErr as Error).message);
            }
          }
          onSelect({
            imageBytes: prepared.bytes,
            name: "Imported Signature",
            width: prepared.width,
            height: prepared.height,
          });
          onClose();
          return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = () => resolve(true);
          img.onerror = () =>
            reject(
              new Error(
                "Could not decode this image. Please choose a valid PNG or JPEG file.",
              ),
            );
          img.src = importedDataUrl;
        });

        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;
        if (
          imgWidth > 4096 ||
          imgHeight > 4096 ||
          imgWidth * imgHeight > 16_000_000
        ) {
          throw new Error(
            "Image dimensions are too large (max 4096×4096 pixels). Please choose a smaller image.",
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not process image");

        ctx.drawImage(img, 0, 0);

        if (removeBackground) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // If near white, make transparent
            if (r > 230 && g > 230 && b > 230) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const trimmed = getTrimmedCanvas(canvas);
        if (!trimmed || trimmed.width < 5 || trimmed.height < 5) {
          throw new Error(
            "The imported image appears to be blank. Please select an image containing a visible signature.",
          );
        }
        const dataUrl = trimmed.toDataURL("image/png");
        const bytes = dataUrlToBytes(dataUrl);

        if (saveOptIn) {
          try {
            saveSignature({
              name: "Imported Signature",
              dataUrl,
              kind: "import",
            });
          } catch (storageErr) {
            setError((storageErr as Error).message);
          }
        }

        onSelect({
          imageBytes: bytes,
          name: "Imported Signature",
          width: trimmed.width,
          height: trimmed.height,
        });
        onClose();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : "Could not create signature.",
      );
    } finally {
      setBusy(false);
    }
  };

  const useSaved = (sig: SavedSignature) => {
    try {
      const bytes = dataUrlToBytes(sig.dataUrl);
      const img = new Image();
      img.src = sig.dataUrl;
      img.onload = () => {
        onSelect({
          imageBytes: bytes,
          name: sig.name,
          width: img.width || 200,
          height: img.height || 70,
        });
        onClose();
      };
      img.onerror = () => {
        setError("Could not render saved signature image.");
      };
    } catch (err) {
      setError("Could not load saved signature.");
    }
  };

  const handleDeleteSaved = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      deleteSavedSignature(id);
      const updated = getSavedSignatures();
      setSavedList(updated);
      if (updated.length === 0 && tab === "saved") {
        setTab("draw");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete saved signature.",
      );
    }
  };

  return (
    <dialog
      className="modal signature-modal"
      ref={dialog}
      aria-label="Signature creation and placement"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      style={{ maxWidth: "580px", width: "90%" }}
    >
      <div className="modal-heading">
        <div className="modal-icon">
          <PenTool size={22} />
        </div>
        <IconButton
          label="Close signature dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </IconButton>
      </div>

      <span className="inspector-eyebrow">DOCUMENT MARKING</span>
      <h2>Add Signature</h2>
      <p style={{ margin: "4px 0 16px", color: "var(--muted)" }}>
        Place a visible signature stamp on your document.
      </p>

      {/* Tabs */}
      <div className="signature-tabs" aria-label="Signature method">
        {savedList.length > 0 && (
          <button
            type="button"
            aria-pressed={tab === "saved"}
            onClick={() => setTab("saved")}
          >
            <Bookmark size={15} /> Saved ({savedList.length})
          </button>
        )}
        <button
          type="button"
          aria-pressed={tab === "draw"}
          onClick={() => setTab("draw")}
        >
          <PenTool size={15} /> Draw
        </button>
        <button
          type="button"
          aria-pressed={tab === "type"}
          onClick={() => setTab("type")}
        >
          <Type size={15} /> Type
        </button>
        <button
          type="button"
          aria-pressed={tab === "import"}
          onClick={() => setTab("import")}
        >
          <Upload size={15} /> Import
        </button>
      </div>

      {/* Tab 1: Saved */}
      {tab === "saved" && (
        <div style={{ minHeight: "180px" }}>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "10px",
            }}
          >
            Select a previously saved signature to place on the page:
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "12px",
              maxHeight: "240px",
              overflowY: "auto",
              padding: "4px",
            }}
          >
            {savedList.map((sig) => (
              <div
                key={sig.id}
                role="button"
                tabIndex={0}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "var(--surface)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                  transition: "border-color 0.15s ease",
                }}
                onClick={() => useSaved(sig)}
                onKeyDown={(e) => e.key === "Enter" && useSaved(sig)}
              >
                <button
                  type="button"
                  aria-label="Delete saved signature"
                  style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  onClick={(e) => handleDeleteSaved(sig.id, e)}
                >
                  <Trash2 size={14} />
                </button>
                <img
                  src={sig.dataUrl}
                  alt={sig.name}
                  style={{
                    maxHeight: "50px",
                    maxWidth: "180px",
                    objectFit: "contain",
                    margin: "8px 0",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {sig.name}
                </span>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                  {new Date(sig.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Draw */}
      {tab === "draw" && (
        <div>
          <div
            style={{
              border: "1.5px dashed var(--line)",
              borderRadius: "8px",
              background: "#ffffff",
              overflow: "hidden",
              position: "relative",
              touchAction: "none",
            }}
          >
            <canvas
              ref={canvasRef}
              width={500}
              height={160}
              style={{
                display: "block",
                width: "100%",
                height: "160px",
                cursor: "crosshair",
              }}
              onPointerDown={startDraw}
              onPointerMove={drawMove}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
            {!hasDrawn && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#5b6b8c",
                  pointerEvents: "none",
                  fontSize: "14px",
                }}
              >
                Draw your signature here
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                Ink:
              </span>
              <button
                type="button"
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#1f2421",
                  border:
                    penColor === "#1f2421"
                      ? "2px solid var(--green)"
                      : "1px solid #ccc",
                  cursor: "pointer",
                }}
                onClick={() => setPenColor("#1f2421")}
                aria-label="Black ink"
              />
              <button
                type="button"
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#1d3557",
                  border:
                    penColor === "#1d3557"
                      ? "2px solid var(--green)"
                      : "1px solid #ccc",
                  cursor: "pointer",
                }}
                onClick={() => setPenColor("#1d3557")}
                aria-label="Navy ink"
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn-subtle"
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                disabled={strokeHistory.length === 0}
                onClick={undoStroke}
              >
                <Undo2 size={13} /> Undo
              </button>
              <button
                type="button"
                className="btn-subtle"
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                disabled={!hasDrawn}
                onClick={clearCanvas}
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Type */}
      {tab === "type" && (
        <div>
          <label
            htmlFor="type-name-input"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              display: "block",
              marginBottom: "6px",
            }}
          >
            Full name or initials
          </label>
          <input
            id="type-name-input"
            type="text"
            placeholder="e.g. Jacob Biju"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            maxLength={60}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              fontSize: "15px",
              marginBottom: "14px",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {fontStyles.map((style, idx) => (
              <div
                key={style.name}
                role="button"
                tabIndex={0}
                style={{
                  border:
                    selectedFontIndex === idx
                      ? "2px solid var(--green)"
                      : "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onClick={() => setSelectedFontIndex(idx)}
                onKeyDown={(e) =>
                  e.key === "Enter" && setSelectedFontIndex(idx)
                }
              >
                <span
                  style={{
                    font: style.font,
                    fontSize: "24px",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {typedName.trim() || "Sample Signature"}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    textTransform: "uppercase",
                  }}
                >
                  {style.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Import */}
      {tab === "import" && (
        <div>
          <div
            style={{
              border: "1.5px dashed var(--line)",
              borderRadius: "8px",
              padding: "24px",
              textAlign: "center",
              background: "var(--surface)",
              cursor: "pointer",
            }}
            onClick={() =>
              document.getElementById("signature-file-input")?.click()
            }
          >
            <input
              id="signature-file-input"
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              onChange={handleFileImport}
            />
            {importedDataUrl ? (
              <div>
                <img
                  src={importedDataUrl}
                  alt="Imported Signature Preview"
                  style={{
                    maxHeight: "100px",
                    maxWidth: "100%",
                    objectFit: "contain",
                    margin: "0 auto",
                    display: "block",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    marginTop: "8px",
                    display: "block",
                  }}
                >
                  Click to choose a different image
                </span>
              </div>
            ) : (
              <div>
                <Upload
                  size={28}
                  style={{ margin: "0 auto 8px", color: "var(--muted)" }}
                />
                <p style={{ margin: 0, fontWeight: 500, fontSize: "14px" }}>
                  Choose signature image (PNG, JPG)
                </p>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  Transparent PNG recommended (max 5 MB)
                </span>
              </div>
            )}
          </div>

          {importedDataUrl && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                marginTop: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(e) => setRemoveBackground(e.target.checked)}
              />
              Automatically remove white background
            </label>
          )}
        </div>
      )}

      {/* Opt-in save checkbox */}
      {tab !== "saved" && (
        <div style={{ marginTop: "16px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              cursor: "pointer",
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={saveOptIn}
              onChange={(e) => setSaveOptIn(e.target.checked)}
            />
            Save signature for future use (stored locally on this Mac)
          </label>
        </div>
      )}

      {/* Legal & cryptographic disclaimer */}
      <div
        style={{
          marginTop: "16px",
          padding: "10px 12px",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "6px",
          display: "flex",
          gap: "8px",
          alignItems: "flex-start",
          fontSize: "11px",
          color: "var(--muted)",
          lineHeight: "1.4",
        }}
      >
        <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
        <div>
          <strong>Visible electronic signature stamp.</strong> This visual stamp
          is placed directly into the PDF. It is not a cryptographic digital
          certificate. Note: modifying an already digitally signed document may
          invalidate existing certificates.
        </div>
      </div>

      {error && (
        <p className="modal-error" role="alert" style={{ marginTop: "10px" }}>
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="modal-actions" style={{ marginTop: "18px" }}>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        {tab !== "saved" && (
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              (tab === "draw" && !hasDrawn) ||
              (tab === "type" && !typedName.trim()) ||
              (tab === "import" && !importedDataUrl)
            }
            onClick={generateSignature}
          >
            {busy ? "Preparing…" : "Place Signature"}
          </button>
        )}
      </div>
    </dialog>
  );
}

/**
 * Trim transparent pixels around canvas to make tight signature bounding box.
 */
function getTrimmedCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx) return source;

  const width = source.width;
  const height = source.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 10) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return source;

  // Add small padding
  const padding = 10;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width, maxX + padding);
  maxY = Math.min(height, maxY + padding);

  const trimW = maxX - minX;
  const trimH = maxY - minY;

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimW;
  trimmedCanvas.height = trimH;
  const trimCtx = trimmedCanvas.getContext("2d");
  if (!trimCtx) return source;

  trimCtx.drawImage(source, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

  return trimmedCanvas;
}
