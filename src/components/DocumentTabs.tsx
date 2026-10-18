import { useEffect, useRef } from "react";
import { FileText, Home, Plus, X } from "lucide-react";
import { isDocumentDirty, type DocumentSession } from "../core/history";

export function DocumentTabs({
  documents,
  activeId,
  disabled,
  onSelect,
  onClose,
  onNew,
}: {
  documents: DocumentSession[];
  activeId: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const revealSelected = () =>
      element
        .querySelector('[aria-selected="true"]')
        ?.closest(".document-tab")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeId, documents.length]);
  return (
    <nav className="document-tabs" aria-label="Document tabs">
      <div
        ref={strip}
        className="document-tab-list"
        role="tablist"
        aria-label="Open PDFs"
        onKeyDown={(event) => {
          if (
            disabled ||
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
          )
            return;
          if (
            !(event.target instanceof HTMLElement) ||
            event.target.getAttribute("role") !== "tab"
          )
            return;
          const tabs = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            ),
          ];
          const index = tabs.indexOf(event.target as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                  tabs.length;
          event.preventDefault();
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        <div
          className={`document-tab start-tab ${activeId === null ? "active" : ""}`}
        >
          <button
            role="tab"
            aria-label="Start page"
            title="Start page"
            aria-selected={activeId === null}
            tabIndex={activeId === null ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="document-tab-select"
          >
            <Home size={15} />
          </button>
        </div>
        {documents.map((document) => (
          <div
            className={`document-tab ${document.id === activeId ? "active" : ""}`}
            key={document.id}
          >
            <button
              role="tab"
              aria-selected={document.id === activeId}
              tabIndex={document.id === activeId ? 0 : -1}
              aria-label={`${document.name}${isDocumentDirty(document) ? ", unsaved changes" : ""}`}
              title={document.name}
              disabled={disabled}
              className="document-tab-select"
              onClick={() => onSelect(document.id)}
            >
              <FileText size={14} /> <span>{document.name}</span>
              {isDocumentDirty(document) && (
                <span className="dirty-dot" aria-hidden="true" />
              )}
            </button>
            <button
              className="document-tab-close"
              aria-label={`Close ${document.name}`}
              disabled={disabled}
              onClick={() => onClose(document.id)}
              title="Close tab"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="document-tab-new"
        aria-label="New tab"
        title="New tab (⌘T)"
        disabled={disabled}
        onClick={onNew}
      >
        <Plus size={17} />
      </button>
    </nav>
  );
}
