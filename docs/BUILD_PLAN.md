# OpenPDF Studio 0.1

Build requested by Jacob on 2026-08-28. Working scope: offline Electron app for macOS, PDF reader, page organization, annotations, undo/redo and saving. No accounts, cloud, telemetry, AI, or subscriptions.

## Architecture

- React + TypeScript + Vite + Tailwind CSS, with Zustand for document history.
- PDF.js for canvas rendering, selectable text, thumbnails and search.
- MuPDF WebAssembly in a dedicated renderer worker for document changes. Never run PDF JavaScript. Main process only handles user-authorized files and native menus/dialogs.
- Narrow preload API; context isolation and renderer sandbox enabled. Files selected through a native dialog get opaque handles. Renderer cannot supply arbitrary filesystem paths.
- Immutable document revisions record named commands. Undo and redo restore actual PDF bytes. Editing saves standard PDF annotations, not separate overlay files.
- Source files are only replaced on explicit Save; Save As uses a native dialog. Atomic replacement; conflict detection if the original changed on disk.

## Acceptance

Open, view, select/copy text, search, navigate, zoom, fit, dark mode; rotate/delete/duplicate/reorder/extract/merge/split pages; highlight/underline/strikeout/ink/rectangle/ellipse/arrow/text/note annotations; undo/redo; Save/Save As; confirm unsaved changes; reopen saved output with annotations intact.

## Deliberate limits

0.1 is not an arbitrary existing-text editor, OCR/scanner, form designer, certificate-signing tool, or Office converter. Those are later releases. Password-protected PDFs require an explicit unsupported-file error in this first release. Large inputs are bounded to keep a byte-snapshot history practical. Distribution starts with a locally built unsigned .app; public notarized releases and CI release signing require Apple credentials and are deferred.

MuPDF has an AGPL option. The application is developed as AGPL-3.0-only with notices retained. No claim of permissive licensing or compliance certification.

## Verification

Unit tests run actual MuPDF operations on generated PDFs and reopen saved bytes. Desktop integration tests run Electron, open a sample, verify page operations, annotations, search, history, sandbox settings and export. Inspect a screenshot of the actual app.

## Version 0.3 continuation

Improve the existing reader and annotation workflow: edit existing annotation contents, colors, and line weights; navigate embedded outlines; inspect document metadata. Annotation updates use the PDF worker and existing byte history, preserve page content, and respect annotation locks. Outline navigation is restricted to valid destinations in the current document. Native File → Document Details and View → Table of Contents provide menu entry points.
