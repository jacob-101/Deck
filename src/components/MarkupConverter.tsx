import { useRef, useState } from "react";
import { Braces, FileType2, X } from "lucide-react";
import type { OpenFile } from "../types";
import { IconButton } from "./Button";

export function MarkupConverter({
  initialFormat,
  onClose,
  onConverted,
}: {
  initialFormat: "markdown" | "latex";
  onClose(): void;
  onConverted(file: OpenFile): Promise<void>;
}) {
  const [format, setFormat] = useState(initialFormat);
  const [name, setName] = useState(
    format === "markdown" ? "Document.md" : "Document.tex",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source = useRef<HTMLTextAreaElement>(null);
  const convert = async () => {
    const text = source.current?.value ?? "";
    if (!text.trim()) {
      setError("Add some content first.");
      return;
    }
    if (!window.desktop) {
      setError("PDF export is available in the Mac app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const file = await window.desktop.convertMarkup(text, name, format);
      if (file) {
        await onConverted(file);
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay markup-overlay">
      <section
        className="markup-window"
        role="dialog"
        aria-modal="true"
        aria-label={`${format === "markdown" ? "Markdown" : "LaTeX"} to PDF`}
      >
        <header>
          <div className="markup-icon">
            {format === "markdown" ? (
              <FileType2 size={21} />
            ) : (
              <Braces size={21} />
            )}
          </div>
          <div>
            <small>LOCAL PUBLISHER</small>
            <h2>{format === "markdown" ? "Markdown" : "LaTeX"} to PDF</h2>
          </div>
          <IconButton label="Close converter" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="markup-tabs">
          <button
            className={format === "markdown" ? "active" : ""}
            onClick={() => {
              setFormat("markdown");
              setName("Document.md");
            }}
          >
            Markdown
          </button>
          <button
            className={format === "latex" ? "active" : ""}
            onClick={() => {
              setFormat("latex");
              setName("Document.tex");
            }}
          >
            LaTeX
          </button>
        </div>
        <label>
          Document name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="markup-source">
          Source
          <textarea
            ref={source}
            autoFocus
            spellCheck={format === "markdown"}
            defaultValue={
              format === "markdown"
                ? "# A beautifully simple document\n\nWrite in **Markdown** and export a polished, print-ready PDF.\n\n- Private by default\n- Designed for reading\n- Ready to share"
                : "\\documentclass{article}\n\\begin{document}\n\\section{A beautifully typeset document}\nWrite your \\textbf{LaTeX} here.\n\\end{document}"
            }
          />
        </label>
        <p className="tool-note">
          {format === "markdown"
            ? "Headers, lists, code, quotes and links are styled for A4 automatically."
            : "Uses a restricted local MacTeX engine when installed. The built-in offline renderer handles common sections, emphasis, lists and inline formulas."}
        </p>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={convert}>
            {busy ? "Creating PDF…" : "Create PDF"}
          </button>
        </footer>
      </section>
    </div>
  );
}
