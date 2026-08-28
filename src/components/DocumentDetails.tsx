import { useEffect, useRef } from "react";
import { FileText, ShieldCheck, X } from "lucide-react";
import type { DocumentInfo } from "../types";
import { IconButton } from "./Button";

export function DocumentDetails({
  info,
  name,
  bytes,
  dirty,
  page,
  onClose,
}: {
  info: DocumentInfo;
  name: string;
  bytes: number;
  dirty: boolean;
  page: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const current = info.pages[page];
  const annotations = info.pages.reduce(
    (sum, p) => sum + p.annotations.length,
    0,
  );
  const fields = [
    ["Title", info.title],
    ["Author", info.author],
    ["Subject", info.subject],
    ["Created with", info.creator],
    ["PDF producer", info.producer],
    ["Format", info.format],
    [
      "Current page",
      current
        ? `${Math.round(current.width)} × ${Math.round(current.height)} pt · ${current.rotation}° rotation`
        : "",
    ],
  ];
  return (
    <dialog
      className="modal document-details"
      ref={dialog}
      aria-label="Document details"
      onCancel={onClose}
    >
      <div className="modal-heading">
        <div className="modal-icon">
          <FileText size={23} />
        </div>
        <IconButton label="Close document details" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <span className="inspector-eyebrow">DOCUMENT DETAILS</span>
      <h2>{name}</h2>
      <p>
        {dirty
          ? "Includes your current unsaved changes."
          : "The document currently open in your workspace."}
      </p>
      <div className="document-stats">
        <div>
          <strong>{info.pages.length}</strong>
          <span>{info.pages.length === 1 ? "page" : "pages"}</span>
        </div>
        <div>
          <strong>{annotations}</strong>
          <span>{annotations === 1 ? "annotation" : "annotations"}</span>
        </div>
        <div>
          <strong>
            {bytes >= 1024 * 1024
              ? (bytes / (1024 * 1024)).toFixed(1)
              : (bytes / 1024).toFixed(0)}
          </strong>
          <span>{bytes >= 1024 * 1024 ? "MB" : "KB"}</span>
        </div>
      </div>
      <dl className="document-metadata">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={!value ? "metadata-empty" : ""}>
              {value || "Not specified"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="details-privacy">
        <ShieldCheck size={15} />
        <span>Read from this PDF, entirely on your Mac.</span>
      </div>
      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
