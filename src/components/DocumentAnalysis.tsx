import { useEffect, useRef, useState } from "react";
import type { PdfProcessResult } from "@firecrawl/pdf-inspector-wasm";
import { Check, Copy, Download, ScanText, X } from "lucide-react";
import { AnalysisText } from "./AnalysisText";
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
  const [view, setView] = useState<"text" | "ocr" | "details">("text");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setNotice("");
    setView("text");
    void analyzePDF(bytes, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [bytes, attempt]);
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
      setView("text");
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
  const views = ["text", "ocr", "details"] as const;
  const viewLabels = {
    text: "Text",
    ocr: "Text recognition",
    details: "Details",
  };
  return (
    <dialog
      ref={dialog}
      className="modal analysis-dialog"
      data-view={result ? view : "loading"}
      aria-label="Document analysis"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else close();
      }}
    >
      <header className="analysis-header">
        <div>
          <h2>Document analysis</h2>
          <p title={name}>{name}</p>
        </div>
        <IconButton
          label="Close document analysis"
          disabled={saving}
          onClick={close}
        >
          <X size={18} />
        </IconButton>
      </header>
      <div
        className="analysis-tabs"
        role="tablist"
        aria-label="Analysis views"
        onKeyDown={(event) => {
          const direction =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!direction && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? views.length - 1
                : (views.indexOf(view) + direction + views.length) %
                  views.length;
          setView(views[index]);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>("button")
            [index]?.focus();
        }}
      >
        {views.map((item) => (
          <button
            key={item}
            role="tab"
            id={`analysis-tab-${item}`}
            aria-controls={`analysis-view-${item}`}
            aria-selected={view === item}
            tabIndex={view === item ? 0 : -1}
            onClick={() => setView(item)}
          >
            {viewLabels[item]}
            {item === "ocr" && ocrBusy && (
              <span className="spinner" aria-label="OCR running" />
            )}
          </button>
        ))}
      </div>
      <div className="analysis-body">
        {!result && !error && (
          <div className="analysis-progress" role="status">
            <span className="spinner" /> Analyzing document…
          </div>
        )}
        {result && (
          <>
            <section
              className="analysis-text analysis-view"
              role="tabpanel"
              id="analysis-view-text"
              aria-labelledby="analysis-tab-text"
              hidden={view !== "text"}
            >
              <div className="analysis-text-tools">
                <span>{ocr ? "Recognized text" : "Extracted text"}</span>
                <button
                  className={`copy-text-button ${copied ? "copied" : ""}`}
                  disabled={!markdown}
                  onClick={() => void copyRecognizedText()}
                  aria-label={ocr ? "Copy OCR text" : "Copy extracted text"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy text"}
                </button>
              </div>
              {markdown ? (
                <AnalysisText markdown={markdown} />
              ) : (
                <div className="analysis-no-text">
                  <ScanText size={24} />
                  <h3>No text extracted</h3>
                  <p>Use text recognition to read scanned pages.</p>
                  <button className="secondary" onClick={() => setView("ocr")}>
                    Set up OCR
                  </button>
                </div>
              )}
              {markdown.length > 30000 && (
                <p className="analysis-preview-limit">
                  Showing the first 30,000 characters. Copy and export include
                  all text.
                </p>
              )}
            </section>
            <section
              className="analysis-view analysis-ocr"
              role="tabpanel"
              id="analysis-view-ocr"
              aria-labelledby="analysis-tab-ocr"
              hidden={view !== "ocr"}
            >
              <h3>Recognize scanned text</h3>
              <p>
                {result.pagesNeedingOcr.length
                  ? `${result.pagesNeedingOcr.length} of ${result.pageCount} ${result.pageCount === 1 ? "page is" : "pages are"} suggested for OCR.`
                  : markdown
                    ? "This PDF already contains text. Use OCR if the extraction is incomplete."
                    : "This PDF has no extractable text."}
              </p>
              <p className="analysis-ocr-note">
                Apple Vision runs on your Mac. Results appear in the Text tab.
              </p>
              <div className="ocr-controls">
                <label>
                  Language
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
                      {`Run OCR${result.pagesNeedingOcr.length ? ` · ${result.pagesNeedingOcr.length} ${result.pagesNeedingOcr.length === 1 ? "page" : "pages"}` : ""}`}
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
              {(result.pagesNeedingOcr.length || result.pageCount) > 100 && (
                <p className="analysis-preview-limit">
                  OCR supports up to 100 pages per run. Extract a smaller page
                  range first.
                </p>
              )}
              {ocr && (
                <p className="analysis-ocr-result">
                  Recognized {ocr.pages.length}{" "}
                  {ocr.pages.length === 1 ? "page" : "pages"} ·{" "}
                  {Math.round(
                    (ocr.pages.reduce((sum, page) => sum + page.confidence, 0) /
                      Math.max(1, ocr.pages.length)) *
                      100,
                  )}
                  % average confidence
                </p>
              )}
              {ocr &&
                ocr.pages.some((page) => (page.uncertain?.length ?? 0) > 0) && (
                  <details className="analysis-uncertain" open>
                    <summary>Flagged for review</summary>
                    <ul>
                      {ocr.pages.flatMap((page) =>
                        (page.uncertain ?? []).map((item) => (
                          <li key={`${page.page}-${item.text}`}>
                            <span className="analysis-uncertain-page">
                              p.{page.page}
                            </span>
                            <span>{item.text}</span>
                            <small>
                              {Math.round(item.confidence * 100)}%
                            </small>
                          </li>
                        )),
                      )}
                    </ul>
                    <p>
                      Low-confidence text — especially numbers — may be misread.
                      Compare against the original page before relying on it.
                    </p>
                  </details>
                )}
            </section>
            <section
              className="analysis-view analysis-details"
              role="tabpanel"
              id="analysis-view-details"
              aria-labelledby="analysis-tab-details"
              hidden={view !== "details"}
            >
              <h3>Document details</h3>
              <dl>
                <div>
                  <dt>PDF type</dt>
                  <dd>{labels[result.pdfType] || "Unclassified PDF"}</dd>
                </div>
                <div>
                  <dt>Pages</dt>
                  <dd>{result.pageCount}</dd>
                </div>
                <div>
                  <dt>Classification confidence</dt>
                  <dd>{Math.round(result.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Pages suggested for OCR</dt>
                  <dd>{pages(result.pagesNeedingOcr)}</dd>
                </div>
                <div>
                  <dt>Pages with tables</dt>
                  <dd>{pages(result.layout.pagesWithTables)}</dd>
                </div>
                <div>
                  <dt>Pages with columns</dt>
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
                Classification is an estimate. Check the extracted text against
                your PDF.
              </p>
            </section>
          </>
        )}
        {error && (
          <p className="analysis-message" role="alert">
            {error}
          </p>
        )}
        {!result && error && (
          <button
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry analysis
          </button>
        )}
        {notice && (
          <p className="analysis-message" role="status">
            {notice}
          </p>
        )}
      </div>
      <footer className="analysis-footer">
        <span className="analysis-file-status">
          {result
            ? `${result.pageCount} ${result.pageCount === 1 ? "page" : "pages"} · ${labels[result.pdfType] || "Unclassified PDF"}`
            : "Analyzing…"}
        </span>
        <button className="secondary" disabled={saving} onClick={close}>
          {result ? "Done" : "Cancel"}
        </button>
        <button
          className="primary"
          disabled={saving || !markdown}
          onClick={() => void exportMarkdown()}
        >
          <Download size={15} /> {saving ? "Exporting…" : "Export Markdown"}
        </button>
      </footer>
    </dialog>
  );
}
