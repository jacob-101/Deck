import { useEffect, useRef, useState } from "react";
import type { PdfProcessResult } from "@firecrawl/pdf-inspector-wasm";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileSearch,
  ScanText,
  ShieldCheck,
  X,
} from "lucide-react";
import { analyzePDF } from "../core/inspector";
import { IconButton } from "./Button";
import type { OCRResult } from "../types";
import { mergeOCRMarkdown } from "../core/markdown";

const labels = {
  TextBased: "Text-based PDF",
  Scanned: "Likely scanned PDF",
  ImageBased: "Image-based PDF",
  Mixed: "Mixed text and images",
};
export function DocumentAnalysis({
  bytes,
  name,
  onClose,
}: {
  bytes: Uint8Array;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<PdfProcessResult | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ocr, setOcr] = useState<OCRResult | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [copied, setCopied] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setNotice("");
    setFindingsOpen(true);
    void analyzePDF(bytes, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [bytes, attempt]);
  useEffect(() => {
    if (ocr) setFindingsOpen(false);
  }, [ocr]);
  const markdown =
    ocr && result
      ? mergeOCRMarkdown(result.markdown || "", ocr, result.pageCount)
      : result?.markdown?.trim() || "";
  const exportMarkdown = async () => {
    if (!markdown) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const filename = name.replace(/\.pdf$/i, "") + ".md";
      if (window.desktop) {
        const saved = await window.desktop.exportMarkdown(markdown, filename);
        setNotice(
          saved
            ? "Markdown exported. Your PDF is unchanged."
            : "Export cancelled.",
        );
      } else {
        const url = URL.createObjectURL(
          new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Markdown download started. Your PDF is unchanged.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setSaving(false);
    }
  };
  const copyRecognizedText = async () => {
    if (!markdown) return;
    setError("");
    try {
      if (window.desktop) await window.desktop.copyText(markdown);
      else await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the recognized text.");
    }
  };
  const runOCR = async (allPages = false) => {
    if (!result || !window.desktop) return;
    const targets =
      allPages || result.pagesNeedingOcr.length === 0
        ? Array.from({ length: result.pageCount }, (_, index) => index + 1)
        : result.pagesNeedingOcr;
    if (targets.length > 100) {
      setError(
        "Offline OCR is limited to 100 pages per run. Extract a smaller page range first.",
      );
      return;
    }
    setOcrBusy(true);
    setError("");
    setNotice("");
    setOcr(null);
    try {
      const value = await window.desktop.runOCR(bytes, targets, language);
      setOcr(value);
      setNotice(
        `Offline OCR completed for ${value.pages.length} page(s) in ${(value.processingTimeMs / 1000).toFixed(1)} seconds.`,
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : "Offline OCR failed.";
      if (!message.toLowerCase().includes("cancel")) setError(message);
    } finally {
      setOcrBusy(false);
    }
  };
  const close = () => {
    if (ocrBusy) window.desktop?.cancelOCR();
    onClose();
  };
  const pages = (values: number[]) =>
    values.length ? values.join(", ") : "None detected";
  return (
    <dialog
      ref={dialog}
      className={`modal document-details analysis-dialog ${ocr ? "ocr-complete" : ""}`}
      aria-label="Document analysis"
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else close();
      }}
    >
      <div className="modal-heading">
        <div className="modal-icon">
          <FileSearch size={23} />
        </div>
        <IconButton
          label="Close document analysis"
          disabled={saving}
          onClick={close}
        >
          <X size={18} />
        </IconButton>
      </div>
      <span className="inspector-eyebrow">DOCUMENT INTELLIGENCE</span>
      <h2>Document analysis</h2>
      <p>{name} · Current PDF revision</p>
      {!result && !error && (
        <div className="analysis-progress" role="status">
          <span className="spinner" /> Analyzing locally… You can close this
          window to cancel.
        </div>
      )}
      {result && (
        <>
          <details
            className="analysis-findings"
            open={findingsOpen}
            onToggle={(event) => setFindingsOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <strong>{labels[result.pdfType] || "Unclassified PDF"}</strong>
                <small>
                  {result.pageCount} pages ·{" "}
                  {Math.round(result.confidence * 100)}% confidence
                </small>
              </span>
              <span className="analysis-findings-action">
                {ocr ? "Analysis details" : "Document details"}
                <ChevronRight size={15} />
              </span>
            </summary>
            <dl className="document-metadata">
              <div>
                <dt>May need OCR</dt>
                <dd>{pages(result.pagesNeedingOcr)}</dd>
              </div>
              <div>
                <dt>Tables</dt>
                <dd>{pages(result.layout.pagesWithTables)}</dd>
              </div>
              <div>
                <dt>Columns</dt>
                <dd>{pages(result.layout.pagesWithColumns)}</dd>
              </div>
              <div>
                <dt>Text encoding</dt>
                <dd>
                  {result.hasEncodingIssues
                    ? "Review extracted text"
                    : "No issues detected"}
                </dd>
              </div>
            </dl>
            <p className="analysis-caveat">
              Classification is an estimate. Review recognized text before
              relying on it.
            </p>
          </details>
          <section className="ocr-workflow" aria-labelledby="ocr-title">
            <div className="ocr-workflow-intro">
              <div className="ocr-mark" aria-hidden="true">
                <ScanText size={28} strokeWidth={1.6} />
                <strong>OCR</strong>
              </div>
              <div>
                <h3 id="ocr-title">Make scanned pages readable</h3>
                <p>
                  Turn text inside page images into searchable, copyable text
                  using Apple Vision on this Mac.
                </p>
              </div>
            </div>
            <div className="ocr-controls">
              <label>
                Recognition language
                <select
                  aria-label="OCR language"
                  value={language}
                  disabled={ocrBusy}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="auto">Automatic / English</option>
                  <option value="en-US">English</option>
                  <option value="zh-Hans">Chinese (Simplified)</option>
                  <option value="zh-Hant">Chinese (Traditional)</option>
                  <option value="ja-JP">Japanese</option>
                  <option value="ko-KR">Korean</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="es-ES">Spanish</option>
                </select>
              </label>
              <button
                className="primary ocr-run"
                disabled={
                  ocrBusy ||
                  !window.desktop ||
                  (result.pagesNeedingOcr.length || result.pageCount) > 100
                }
                onClick={() => void runOCR(false)}
              >
                {ocrBusy ? (
                  <>
                    <span className="spinner" /> Recognizing…
                  </>
                ) : (
                  <>
                    <ScanText size={16} />
                    {`Run Offline OCR${result.pagesNeedingOcr.length ? ` · ${result.pagesNeedingOcr.length} suggested` : ""}`}
                  </>
                )}
              </button>
              {result.pagesNeedingOcr.length > 0 &&
                result.pagesNeedingOcr.length < result.pageCount && (
                  <button
                    className="secondary"
                    disabled={ocrBusy || result.pageCount > 100}
                    onClick={() => void runOCR(true)}
                  >
                    OCR all pages
                  </button>
                )}
              {ocrBusy && (
                <button
                  className="secondary"
                  onClick={() => window.desktop?.cancelOCR()}
                >
                  Cancel OCR
                </button>
              )}
            </div>
          </section>
          {ocr && (
            <div className="analysis-summary">
              <strong>{ocr.engine} OCR complete</strong>
              <span>
                Average confidence{" "}
                {Math.round(
                  (ocr.pages.reduce((sum, page) => sum + page.confidence, 0) /
                    Math.max(1, ocr.pages.length)) *
                    100,
                )}
                % · Markdown now uses recognized text
              </span>
            </div>
          )}
          {markdown ? (
            <>
              <div className="markdown-heading">
                <label htmlFor="markdown-preview">
                  {ocr ? "Recognized text" : "Extracted text"}
                </label>
                <button
                  className={`copy-text-button ${copied ? "copied" : ""}`}
                  onClick={() => void copyRecognizedText()}
                  aria-label={ocr ? "Copy OCR text" : "Copy extracted text"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : ocr ? "Copy OCR text" : "Copy text"}
                </button>
              </div>
              <pre
                id="markdown-preview"
                className="markdown-preview"
                tabIndex={0}
              >
                {markdown.slice(0, 30000)}
              </pre>
              {markdown.length > 30000 && (
                <p>
                  Preview limited to 30,000 characters. Export includes all
                  extracted text.
                </p>
              )}
            </>
          ) : (
            <p>
              No extractable text found. Run offline OCR to recognize scanned
              pages.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!result && error && (
        <button className="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Retry analysis
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="details-privacy">
        <ShieldCheck size={15} />
        <span>
          PDF Inspector + Apple Vision OCR · Processed on your Mac. No uploads.
        </span>
      </div>
      <div className="modal-actions">
        <button className="secondary" disabled={saving} onClick={close}>
          {result ? "Done" : "Cancel"}
        </button>
        <button
          className="primary"
          disabled={saving || !markdown}
          onClick={() => void exportMarkdown()}
        >
          <Download size={15} />
          {saving ? "Exporting…" : "Export Markdown"}
        </button>
      </div>
    </dialog>
  );
}
