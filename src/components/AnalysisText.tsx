import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];
const components: Components = {
  a: ({ children }) => <span>{children}</span>,
  table: ({ children }) => (
    <div className="analysis-table">
      <table>{children}</table>
    </div>
  ),
};

/** A reading preview only: document content cannot load remote images or navigate. */
export const AnalysisText = memo(function AnalysisText({
  markdown,
}: {
  markdown: string;
}) {
  return (
    <div
      id="markdown-preview"
      className="analysis-reading markdown-preview"
      tabIndex={0}
      role="region"
      aria-label="Extracted text preview"
    >
      <Markdown
        remarkPlugins={plugins}
        skipHtml
        disallowedElements={["img"]}
        components={components}
      >
        {markdown.slice(0, 30000)}
      </Markdown>
    </div>
  );
});
