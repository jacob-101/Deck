import { BookOpen, ChevronRight } from "lucide-react";
import type { OutlineEntry } from "../types";

export function DocumentOutline({
  entries,
  page,
  notice,
  onNavigate,
}: {
  entries: OutlineEntry[];
  page: number;
  notice: string | null;
  onNavigate: (page: number) => void;
}) {
  const item = (entry: OutlineEntry) => (
    <li key={entry.id}>
      {entry.children.length ? (
        <details open={entry.open}>
          <summary>
            <ChevronRight size={12} />
            <span>{entry.title}</span>
          </summary>
          {entry.page !== null && (
            <button
              className="outline-group-page"
              onClick={() => onNavigate(entry.page!)}
            >
              Go to page {entry.page + 1}
            </button>
          )}
          <ul>{entry.children.map(item)}</ul>
        </details>
      ) : (
        <button
          className="outline-item"
          disabled={entry.page === null}
          title={
            entry.page === null
              ? "This entry does not point to a page in this document."
              : entry.title
          }
          aria-current={page === entry.page ? "location" : undefined}
          onClick={() => entry.page !== null && onNavigate(entry.page)}
        >
          <span>{entry.title}</span>
          {entry.page !== null && <small>{entry.page + 1}</small>}
        </button>
      )}
    </li>
  );
  return (
    <div className="outline-panel">
      {entries.length ? (
        <nav aria-label="Document contents">
          <ul>{entries.map(item)}</ul>
        </nav>
      ) : (
        <div className="empty-notes">
          <BookOpen size={26} />
          <h3>A simpler kind of document.</h3>
          <p>
            This PDF has no table of contents. Use Pages or Search to find your
            place.
          </p>
        </div>
      )}
      {notice && (
        <p className="outline-notice" role="status">
          {notice}
        </p>
      )}
      {entries.length > 0 && (
        <p className="outline-footnote">
          Contents provided by this PDF. Only destinations within the document
          can be opened.
        </p>
      )}
    </div>
  );
}
