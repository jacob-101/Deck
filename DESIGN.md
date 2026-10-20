# OpenPDF Studio — supplied Sealdesk theme

The user's HTML in [ui-preview/theme-reference.html](ui-preview/theme-reference.html)
is the visual source of truth. Copy its styling and SVG artwork directly. Do not
reinterpret or simplify the theme. Item placement may change to support OpenPDF's
existing local PDF workflows. This supersedes the earlier Azure interpretation.

## Exact light theme

| Surface                    | Reference value |
| -------------------------- | --------------- |
| App background             | #F3F7FE         |
| Titlebar and page rail     | #E4ECFA         |
| Navy navigation            | #0F2358         |
| Quick-actions panel        | #E2EBFA         |
| Document canvas            | #DCE7F9         |
| Cards and document content | #FFFFFF         |
| Primary action             | #1560E8         |
| Primary text               | #0F1F44         |
| Secondary text             | #4A5B7F         |
| Metadata                   | #5B6B8C         |
| Soft controls              | #D4E2FA         |
| Border                     | #D5E1F7         |
| Illustration outline       | #14327F         |
| Dropzone border            | #9DBAE9         |
| Local note                 | #CFE0FB         |
| Focus and warm accents     | #F6C445         |

## Typography

Bundle all fonts offline. DM Sans 400/500/600/700 is the body face. Plus Jakarta
Sans 500/600/700/800 is the heading and control face. Caveat 600 is used by the
original signature illustration. Code uses the existing monospace stack.

Copy the reference hierarchy: page heading 800 32px/1.15 with -.6px tracking;
section headings 800 19px; dropzone heading 800 28px/1.2 with -.5px tracking;
quick-action titles 800 17px/1.2; document titles 700 14.5px; sidebar 600 14.5px
(700 when selected); supporting text 500 14.5px and metadata 12–12.5px.

## Components

- Titlebar: light blue, 52px high. Navy belongs to the navigation sidebar.
- Sidebar: 232px, 44px navigation rows with 13px radii; light selected row.
- Dropzone: white, 292px high, 26px radius, 2px dashed #9DBAE9 border. Keep both
  original 170×200 document/pen and camera/scan illustrations. Primary action:
  52px high, 15px radius, 800 17px text, `0 8px 18px rgba(21,96,232,.35)`.
- Recent documents: white cards, 78px high, 18px radius, 40×50 original document
  artwork, `0 1px 0 #D5E1F7, 0 6px 14px rgba(21,54,125,.06)`.
- Quick actions: 280px panel; white 112px cards with 20px radius and original
  illustrations; `0 1px 0 #D0DDF5, 0 8px 16px rgba(21,54,125,.07)`.
- Editor: light toolbar, blue page rail and canvas; white 52px field buttons
  with 14px radii and `0 1px 0 #D0DDF5, 0 4px 10px rgba(21,54,125,.06)`.
- Focus: 3px #F6C445 outline with 2px offset.

Use src/design-system.css for shared styling and src/components/ThemeArtwork.tsx
for the SVGs copied from the supplied HTML. Keep the reference HTML intact.

The app remains local-first. Keep its actual product name, real documents and
existing functions. Do not introduce the reference's demo accounts, subscription,
cloud signers or fabricated document statuses. Existing dark mode and optional
palettes remain available; the supplied light theme is the visual target.

## Settings

Use literal section names (General, Appearance, Annotations, Privacy, About).
No slogan headings, duplicate eyebrow labels, decorative principle badges or
marketing callouts. Preference rows and keyboard shortcuts are utility content:
13–14px body text, 24px section titles, white groups with only the reference's
single bottom-edge shadow. Settings has the same light titlebar and navy sidebar
as the supplied theme. Its backdrop dims the workspace without blurring it.

The sidebar’s “100% local / Learn more” promotional card is intentionally removed
at the user's request. Do not restore it from the reference HTML.

The Home footer slogan, “Made for your Mac,” and version strip are intentionally
removed at the user's request. Keep version information in About.

The editor has no persistent right-hand Markup/Annotations/Save panel. Use the
existing toolbar for tools and saving, and the left Annotations tab for browsing,
editing, and deleting annotations.

Document analysis uses a compact titlebar and filename, and three task tabs:
Text, Text recognition, and Details. Show extracted text immediately, with OCR
and plain diagnostic rows in their own views. Keep footer actions visible while
content scrolls. No stacked cards, intelligence eyebrow, decorative OCR banner,
or repeated privacy footer.

Analysis typography uses the supplied fonts at their reference scale: 24px/800
Plus Jakarta Sans for the dialog title, 19px/800 section headings, 14.5px body
and navigation, and 14px controls. The default preview renders Markdown into
readable paragraphs and tables with DM Sans. Preserve the original Markdown in
copy and export; do not show markup syntax as the default reading experience.
