import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisText } from "../src/components/AnalysisText";

it("presents extraction markup as readable headings and tables", () => {
  const html = renderToStaticMarkup(
    <AnalysisText
      markdown={
        "<!-- Page 1 -->\n\n# Statement\n\nA **bold** summary.\n\n| Item | Total |\n| --- | --- |\n| Balance | 120 |"
      }
    />,
  );
  expect(html).toContain("<h1>Statement</h1>");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain("<table>");
  expect(html).toContain("<td>120</td>");
  expect(html).not.toContain("<!-- Page 1 -->");
});

it("does not turn document content into navigation, embedded HTML, or remote images", () => {
  const html = renderToStaticMarkup(
    <AnalysisText
      markdown={
        '[Document link](https://example.com/private)\n\n![Remote image](https://example.com/tracker.png)\n\n<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>'
      }
    />,
  );
  expect(html).toContain("Document link");
  expect(html).not.toMatch(/<(?:a\s|img\s|script|iframe)/);
  expect(html).not.toContain("example.com");
});
