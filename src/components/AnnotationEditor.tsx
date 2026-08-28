import { useEffect, useRef, useState } from "react";
import { Check, PenLine, X } from "lucide-react";
import type { AnnotationInfo, AnnotationPatch } from "../types";
import { ANNOTATION_COLORS, COLOR_NAMES } from "../core/preferences";
import { annotationHex, annotationName } from "../core/annotation-style";
import { IconButton } from "./Button";

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
  const [contents, setContents] = useState(annotation.contents);
  const originalColor = annotationHex(annotation.color);
  const [color, setColor] = useState(originalColor);
  const [width, setWidth] = useState(String(annotation.width ?? 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textAnnotation =
    annotation.type === "Text" || annotation.type === "FreeText";
  const dirty =
    contents !== annotation.contents ||
    color !== originalColor ||
    (annotation.width !== null &&
      (!width.trim() || Number(width) !== annotation.width));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setError("");
  }, [contents, color, width]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || busy) return;
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
    const patch: AnnotationPatch = {};
    if (contents !== annotation.contents) patch.contents = contents;
    if (color !== originalColor)
      patch.color = [1, 3, 5].map(
        (offset) => parseInt(color.slice(offset, offset + 2), 16) / 255,
      );
    if (annotation.width !== null && Number(width) !== annotation.width)
      patch.width = Number(width);
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
      setBusy(false);
    }
  };
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
            id="annotation-contents"
            aria-label="Annotation contents"
            autoFocus
            rows={4}
            value={contents}
            onChange={(event) => setContents(event.target.value)}
            maxLength={5000}
            placeholder={
              textAnnotation ? "Your note…" : "Add a comment to this mark…"
            }
          />
          <div className="editor-style-row">
            <div>
              <label>
                {annotation.type === "FreeText" ? "Text color" : "Color"}
              </label>
              <div className="editor-colors">
                {ANNOTATION_COLORS.map((item, index) => (
                  <button
                    type="button"
                    key={item}
                    aria-label={`${COLOR_NAMES[index]} color`}
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
