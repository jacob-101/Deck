import { startTransition, useEffect, useRef, useState } from "react";
import { Check, PenLine, X } from "lucide-react";
import type { AnnotationInfo, AnnotationPatch } from "../types";
import {
  ANNOTATION_COLORS,
  COLOR_NAMES,
  TEXT_BACKGROUND_COLORS,
  TEXT_BACKGROUND_NAMES,
  TEXT_COLORS,
  TEXT_COLOR_NAMES,
} from "../core/preferences";
import { annotationHex, annotationName } from "../core/annotation-style";
import { IconButton } from "./Button";

const toPDFColor = (value: string) =>
  [1, 3, 5].map(
    (offset) => parseInt(value.slice(offset, offset + 2), 16) / 255,
  );

export function AnnotationEditor({
  annotation,
  page,
  onSave,
  onClose,
}: {
  annotation: AnnotationInfo;
  page: number;
  onSave: (patch: AnnotationPatch) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Uncontrolled textarea — read via ref only at submit time, eliminating
  // a full React render cycle on every keystroke.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const originalColor = annotationHex(annotation.color);
  const [color, setColor] = useState(originalColor);
  const [width, setWidth] = useState(String(annotation.width ?? 2));
  const [fontSize, setFontSize] = useState(String(annotation.fontSize ?? 14));
  const [font, setFont] = useState(annotation.font ?? "Helv");
  const originalFill = annotation.fillColor
    ? annotationHex(annotation.fillColor)
    : "none";
  const [fillColor, setFillColor] = useState(originalFill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // isDirty tracks whether any field has changed so the Save button can be
  // enabled/disabled without re-reading the textarea on every render.
  const [isDirty, setIsDirty] = useState(false);

  const isFreeText = annotation.type === "FreeText";
  const isStickyNote = annotation.type === "Text";
  const textAnnotation = isStickyNote || isFreeText;

  // Recompute dirty when style fields change (textarea is handled via isDirty).
  const styleDirty =
    color !== originalColor ||
    (annotation.width !== null &&
      (!width.trim() || Number(width) !== annotation.width)) ||
    (isFreeText &&
      (Number(fontSize) !== (annotation.fontSize ?? 14) ||
        font !== (annotation.font ?? "Helv") ||
        fillColor !== originalFill));

  const dirty = isDirty || styleDirty;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    setError("");
  }, [color, width, fontSize, font, fillColor]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || busy) return;
    // Read textarea value at submit time — no per-keystroke state overhead.
    const contents = textareaRef.current?.value ?? annotation.contents;
    setError("");
    if (textAnnotation && !contents.trim()) {
      setError("Add some text first.");
      return;
    }
    if (contents.length > 5000) {
      setError("Keep annotation text to 5,000 characters or fewer.");
      return;
    }
    if (
      annotation.width !== null &&
      (!width.trim() ||
        !Number.isFinite(Number(width)) ||
        Number(width) < 0 ||
        Number(width) > 20)
    ) {
      setError("Choose a line weight between 0 and 20 pt.");
      return;
    }
    if (
      isFreeText &&
      (!fontSize.trim() ||
        !Number.isFinite(Number(fontSize)) ||
        Number(fontSize) < 6 ||
        Number(fontSize) > 144)
    ) {
      setError("Choose a font size between 6 and 144 pt.");
      return;
    }

    const patch: AnnotationPatch = {};
    if (contents !== annotation.contents) patch.contents = contents;
    if (color !== originalColor)
      patch.color = [1, 3, 5].map(
        (offset) => parseInt(color.slice(offset, offset + 2), 16) / 255,
      );
    if (annotation.width !== null && Number(width) !== annotation.width)
      patch.width = Number(width);
    if (isFreeText && Number(fontSize) !== (annotation.fontSize ?? 14))
      patch.fontSize = Number(fontSize);
    if (isFreeText && font !== (annotation.font ?? "Helv")) patch.font = font;
    if (isFreeText && fillColor !== originalFill)
      patch.fillColor = fillColor === "none" ? null : toPDFColor(fillColor);

    if (!Object.keys(patch).length) return;
    setBusy(true);
    try {
      await onSave(patch);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this annotation.",
      );
    } finally {
      // startTransition marks busy=false as a non-urgent update so the UI
      // remains responsive while the PDF re-renders after a successful save.
      startTransition(() => setBusy(false));
    }
  };

  const paletteColors = isFreeText ? TEXT_COLORS : ANNOTATION_COLORS;
  const paletteNames = isFreeText ? TEXT_COLOR_NAMES : COLOR_NAMES;

  return (
    <dialog
      className="modal annotation-editor"
      ref={dialog}
      aria-label="Edit annotation"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-heading">
          <div className="modal-icon">
            <PenLine size={23} />
          </div>
          <IconButton
            label="Close annotation editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </div>
        <span className="inspector-eyebrow">
          {annotationName(annotation.type)} <span>·</span> PAGE {page + 1}
        </span>
        <h2>A thought, refined.</h2>
        <p>Update this mark. The original page stays unchanged.</p>
        <fieldset disabled={busy}>
          <label htmlFor="annotation-contents">
            {textAnnotation ? "Text" : "Comment"}
          </label>
          <textarea
            ref={textareaRef}
            id="annotation-contents"
            aria-label="Annotation contents"
            autoFocus
            rows={4}
            defaultValue={annotation.contents}
            onChange={() => setIsDirty(true)}
            maxLength={5000}
            placeholder={
              textAnnotation ? "Your text…" : "Add a comment to this mark…"
            }
          />

          {isFreeText && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                margin: "12px 0 6px",
              }}
            >
              <label>
                Font Size
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="number"
                    aria-label="Text font size"
                    min={6}
                    max={144}
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    style={{ width: "70px" }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    pt
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      marginLeft: "auto",
                    }}
                  >
                    {[10, 14, 18, 24].map((sz) => (
                      <button
                        type="button"
                        key={sz}
                        className="btn-subtle"
                        style={{
                          padding: "2px 6px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          background:
                            Number(fontSize) === sz
                              ? "var(--accent-subtle)"
                              : "transparent",
                          fontWeight: Number(fontSize) === sz ? 600 : 400,
                        }}
                        onClick={() => setFontSize(String(sz))}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </label>

              <label>
                Font Family
                <select
                  aria-label="Text font family"
                  value={font}
                  onChange={(e) => setFont(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: "4px",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                  }}
                >
                  <option value="Helv">Helvetica (Standard)</option>
                  <option value="Cour">Courier (Monospace)</option>
                </select>
              </label>
            </div>
          )}

          <div className="editor-style-row" style={{ marginTop: "10px" }}>
            <div>
              <label>{isFreeText ? "Text color" : "Color"}</label>
              <div className="editor-colors">
                {paletteColors.map((item, index) => (
                  <button
                    type="button"
                    key={item}
                    aria-label={`${paletteNames[index]} color`}
                    aria-pressed={color === item}
                    style={{ background: item }}
                    onClick={() => setColor(item)}
                  >
                    {color === item && <Check size={14} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Custom annotation color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </div>
            </div>
            {annotation.width !== null && (
              <label className="editor-weight">
                Line weight{" "}
                <div>
                  <input
                    type="number"
                    aria-label="Annotation line weight"
                    min={0}
                    max={20}
                    step="any"
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                  />
                  <span>pt</span>
                </div>
              </label>
            )}
          </div>
          {isFreeText && (
            <div className="editor-background">
              <label>Background</label>
              <div className="background-colors">
                {TEXT_BACKGROUND_COLORS.map((item, index) => (
                  <button
                    type="button"
                    key={item}
                    className={item === "none" ? "no-fill" : ""}
                    aria-label={`${TEXT_BACKGROUND_NAMES[index]} background`}
                    aria-pressed={fillColor === item}
                    style={item === "none" ? undefined : { background: item }}
                    onClick={() => setFillColor(item)}
                  >
                    {item === "none" ? (
                      <X size={13} />
                    ) : (
                      fillColor === item && <Check size={13} />
                    )}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Custom text box background"
                  value={fillColor === "none" ? "#ffffff" : fillColor}
                  onChange={(event) => setFillColor(event.target.value)}
                />
              </div>
              <small>
                {fillColor === "none"
                  ? "Transparent — the page shows through."
                  : "The fill is saved inside the PDF."}
              </small>
            </div>
          )}
        </fieldset>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-note">
          <Check size={13} />
          You can undo this change.
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={busy || !dirty}>
            {busy ? "Updating…" : "Update annotation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
