import { useEffect, useRef, useState } from "react";
import type { PdfProcessResult } from "@firecrawl/pdf-inspector-wasm";
import { FileSearch, Download, ShieldCheck, X } from "lucide-react";
import { analyzePDF } from "../core/inspector";
import { IconButton } from "./Button";

const labels = { TextBased: "Text-based PDF", Scanned: "Likely scanned PDF", ImageBased: "Image-based PDF", Mixed: "Mixed text and images" };
export function DocumentAnalysis({ bytes, name, onClose }: {
  bytes: Uint8Array; name: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<PdfProcessResult | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(""); setNotice("");
    void analyzePDF(bytes, controller.signal).then(setResult).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [bytes, attempt]);
  const exportMarkdown = async () => {
    if (!result?.markdown?.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const filename = name.replace(/\.pdf$/i, "") + ".md";
      if (window.desktop) {
        const saved = await window.desktop.exportMarkdown(result.markdown, filename);
        setNotice(saved ? "Markdown exported. Your PDF is unchanged." : "Export cancelled.");
      } else {
        const url = URL.createObjectURL(new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Markdown download started. Your PDF is unchanged.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
    finally { setSaving(false); }
  };
  const pages = (values: number[]) => values.length ? values.join(", ") : "None detected";
  return <dialog ref={dialog} className="modal document-details analysis-dialog" aria-label="Document analysis" onCancel={e => { if (saving) e.preventDefault(); else onClose(); }}>
    <div className="modal-heading"><div className="modal-icon"><FileSearch size={23} /></div><IconButton label="Close document analysis" disabled={saving} onClick={onClose}><X size={18} /></IconButton></div>
    <span className="inspector-eyebrow">DOCUMENT INTELLIGENCE</span>
    <h2>Document analysis</h2><p>{name} · Current PDF revision</p>
    {!result && !error && <div className="analysis-progress" role="status"><span className="spinner" /> Analyzing locally… You can close this window to cancel.</div>}
    {result && <>
      <div className="analysis-summary"><strong>{labels[result.pdfType] || "Unclassified PDF"}</strong><span>{result.pageCount} pages · {Math.round(result.confidence * 100)}% classification confidence</span></div>
      <dl className="document-metadata">
        <div><dt>May need OCR</dt><dd>{pages(result.pagesNeedingOcr)}</dd></div>
        <div><dt>Tables detected on</dt><dd>{pages(result.layout.pagesWithTables)}</dd></div>
        <div><dt>Columns detected on</dt><dd>{pages(result.layout.pagesWithColumns)}</dd></div>
        <div><dt>Text encoding</dt><dd>{result.hasEncodingIssues ? "Possible encoding issues — review extracted text" : "No issues detected"}</dd></div>
      </dl>
      <p className="analysis-caveat">These are estimates, not a completeness check. OCR is not included. Scanned pages, drawings and signature stamps are not transcribed; review extracted text before using it.</p>
      {result.pagesNeedingOcr.length > 0 && <p role="status">Export may be incomplete: {result.pagesNeedingOcr.length} page(s) may need OCR.</p>}
      {result.markdown?.trim() ? <><label htmlFor="markdown-preview">Markdown preview</label><pre id="markdown-preview" className="markdown-preview" tabIndex={0}>{result.markdown.slice(0, 30000)}</pre>{result.markdown.length > 30000 && <p>Preview limited to 30,000 characters. Export includes all extracted text.</p>}</> : <p>No extractable text found. Markdown export is unavailable; this document may need OCR.</p>}
    </>}
    {error && <p role="alert">{error}</p>}{!result && error && <button className="secondary" onClick={() => setAttempt(n => n + 1)}>Retry analysis</button>}
    {notice && <p role="status">{notice}</p>}
    <div className="details-privacy"><ShieldCheck size={15} /><span>PDF Inspector · Processed on your Mac. No document uploads.</span></div>
    <div className="modal-actions"><button className="secondary" disabled={saving} onClick={onClose}>{result ? "Done" : "Cancel"}</button><button className="primary" disabled={saving || !result?.markdown?.trim()} onClick={() => void exportMarkdown()}><Download size={15} />{saving ? "Exporting…" : "Export Markdown"}</button></div>
  </dialog>;
}
