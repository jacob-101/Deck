# OpenPDF Studio

A local PDF workspace for macOS. No accounts, no uploads, no telemetry.

**Version 0.4:** a revision-aware editing engine, a unified local PDF Tools workspace, an agent-friendly offline CLI, accurate-layout and editable PDF-to-DOCX export, and offline Markdown/LaTeX publishing. Includes the Forest & Paper identity and persistent Settings workspace.

## Run

Requires Node.js 22.12+ and npm. Production packaging also requires Apple’s Xcode command-line tools and stable Rust/Cargo 1.84 or newer. On the first setup, dependency installation downloads Electron and Cargo resolves the pinned Rust image dependencies. PDF.js fonts, character maps, MuPDF WebAssembly, Apple Vision OCR, and the Rust image accelerator are bundled locally; opening and editing PDFs does not require a network connection.

```sh
npm ci
npm run dev
```

For a production build:

```sh
npm run build
npm start
```

Create an unsigned macOS application:

```sh
npm run package
```

Build the offline CLI for scripts and AI agents:

```sh
npm run build:cli
./bin/openpdf capabilities
```

See [docs/CLI.md](docs/CLI.md) for its JSON contract, commands, exit codes, secure password handling, and examples.

The application is generated in `release/mac-arm64/OpenPDF Studio.app` on Apple Silicon (or `release/mac/` on Intel). This is a local early release, not an Apple-notarized public distribution. No signing credentials are required for local builds. No files are installed in /Applications automatically.

## What works

- Native PDF open/save dialogs, recent documents, Finder open-file events, drag and drop.
- Multiple PDF tabs with independent edits, undo/redo, save state, and remembered page/zoom/search. Use **+** or **⌘T** for the start page, **⌘O** to open another PDF, and **⌘W** to close the active PDF. Closing a dirty tab asks to save, discard, or cancel; closing the window checks all open PDFs.
- Page thumbnails, page navigation, zoom, fit page/width, fullscreen, text selection/copy, text search, dark mode.
- Local document analysis classifies text, scanned, image-based, and mixed PDFs; flags pages that may need OCR and detects tables/columns. A dedicated offline Apple Vision OCR workspace recognizes up to 100 selected pages per run in supported languages, renders at 300 DPI, preserves table rows and columns as Markdown tables, flags low-confidence numbers for review against the original page, previews the result, copies recognized text through the native Mac clipboard, and exports Markdown without uploading the PDF.
- High-quality PNG/JPEG-to-PDF conversion supports 1–100 images with a visual preparation workspace. Crop with an adjustable frame, rotate in 90° steps, remove pages, add more images, and arrange page order before export. Crop and rotation are stored as PDF geometry, so original JPEG compression and source pixels stay embedded without downsampling or recompression.
- Offline DOC/DOCX-to-PDF conversion uses an installed LibreOffice engine, with Apple Pages as a fallback. Converted PDFs open immediately with selectable text. Layout fidelity still depends on the fonts and document features available to the installed converter.
- PDF-to-PPTX exports up to 100 pages as high-resolution slide images, preserving appearance; slide text and artwork are not individually editable. Mixed page sizes fit without stretching. PPT/PPTX-to-PDF uses installed LibreOffice or Apple Keynote, then opens the converted PDF. Both are available from the home screen; PPTX export is also in PDF Tools.
- PDF-to-DOCX offers two honest modes: **Exact Layout** embeds high-resolution page renders for visual fidelity; **Editable Text** preserves selectable extracted text and page breaks for rewriting.
- The offline Markdown publisher creates styled A4 PDFs with headings, lists, quotes, links, and code. LaTeX uses a restricted local MacTeX engine when installed and includes a built-in offline renderer for common sections, emphasis, lists, and inline formulas.
- Standard PDF highlights, underline, strike-through, ink, rectangles, ellipses, arrows, text boxes, sticky notes, and visible signature stamps. Select text while a markup tool is active; drag to draw; click to place a note or text box.
- **Redact:** drag over text or images to permanently remove the underlying content and bake a black box into the page. Redaction is destructive removal, not a drawing overlay, and cannot be reversed by the reader.
- **Add Text (FreeText):** place text boxes anywhere on the page with customizable font sizes (10–32 pt), font families (Helvetica, Courier, Times), dedicated text colors, transparent or colored PDF background fills, multiline/Unicode characters, and interactive move/resize bounding boxes on the page canvas.
- **Sign (Stamp):** draw a signature, type in elegant script styles, or import PNG/JPEG images (with automatic background transparency removal). Move and resize signatures with proportional aspect-ratio preservation. Save signatures locally with explicit opt-in.
- **Rust acceleration:** imported signatures are decoded, cleaned, tightly cropped, and encoded in a narrow native Rust process instead of blocking the renderer. The canvas implementation remains available in the browser-only preview. Consecutive PDF edits also stop resending the complete source revision to the worker when its native document session is already current.
- Annotation list, jump to annotated page, edit text/comments and color, adjust shape line weight, remove annotations. Locked annotations cannot be edited or deleted.
- Embedded PDF table of contents, including nested sections and page destinations that follow page reordering. External destinations are not opened.
- Document details: title, author, subject, creator, producer, PDF version, page dimensions, file size, and annotation count.
- Unified **PDF Tools**: lossless structural compression; page export to PNG/JPEG at 144–600 DPI; AES-256 password protection; flattening; crop and A4/Letter resize; a local privacy scanner and metadata/action cleaner; split by page count, target size, halves, bookmark chapters, or matching text; alternate/mix two PDFs; 2/4/6/9 pages per sheet; flip/mirror; fill existing PDF forms; edit metadata; Bates numbering; extract embedded images; unlock password-protected copies; and PDF-to-DOCX.
- Rotate, duplicate, delete, drag or button reorder, merge, and extract ranges.
- Named document history with undo/redo; annotations and page operations restore actual PDF bytes.
- Save, Save As, close confirmation, file-change conflict detection, atomic replacement of saved files.
- Print the whole document (rasterized at 108 dpi in this first release).

Use **Take a look around** to open an included four-page sample. It is a real, selectable PDF, generated locally.

## Make it yours

Open **OpenPDF Studio → Settings…** or press **⌘,**. Preferences save automatically on this Mac.

- **General:** default page fit and whether the thumbnail sidebar opens with each PDF.
- **Appearance:** Light, Dark, or System; Forest & Paper, Slate, Cobalt, or Clay palettes; reduced motion. System reduced-motion preferences are always respected.
- **Annotations:** live color/line preview and working default color and line weight. Changes affect new marks, never existing annotations.
- **Privacy:** clear recent-file history without deleting any PDFs. The packaged app blocks web requests and has no analytics.
- **About:** version, open-source foundations, release limitations, and confirmed preference reset.

Viewer defaults apply when opening a document. Appearance and annotation defaults update immediately. The original 0.1 light/dark preference migrates automatically. The icon source and generation prompt are in [brand/README.md](brand/README.md).

## Shortcuts

| Shortcut            | Action                   |
| ------------------- | ------------------------ |
| ⌘O                  | Open PDF                 |
| ⌘S / ⇧⌘S            | Save / Save As           |
| ⌘T                  | New tab / start page     |
| ⌘W                  | Close active PDF tab     |
| ⌘F                  | Search                   |
| ⌘Z / ⇧⌘Z            | Undo / redo              |
| ⌘+ / ⌘− / ⌘0        | Zoom in / out / fit page |
| ⌘P                  | Print                    |
| ⌘,                  | Settings                 |
| ⌘I                  | Document details         |
| Left / right arrows | Previous / next page     |
| Escape              | Return to selection tool |

## Limits and cautions

This is not full Acrobat parity. Editing existing page text/images, scanner capture, form creation, cryptographic signatures, and lossy image recompression are not implemented. Existing AcroForm fields can be filled. Structural compression may not shrink an already-optimized PDF. The **Redact** tool permanently removes text and images; other markup (highlights, rectangles, ink) does **not** redact.

- Inputs: PDF up to 50 MB and 500 pages. Password-protected PDFs can be opened through **Unlock PDF** with the correct password and saved as an unencrypted copy.
- History: per PDF tab, at most 40 revisions, normally within 96 MB; at least the current and previous revisions are retained. Closing its tab clears its history. Tabs are held in memory during the session and are not restored after quitting.
- Print: up to 100 pages; oversized pages are rejected. It prints rendered page images, not vector text.
- Split export: at most 100 MB of combined output per operation.
- PDF-to-image export: up to 100 pages and 100 MB of combined output per operation. PNG is lossless; JPEG uses the selected quality.
- Privacy cleaning removes metadata, embedded files, and document-level open/JavaScript actions. It reports but preserves links, annotations, and form fields.
- Crop with original dimensions preserves vectors and selectable text. Resizing to A4 or Letter creates a high-resolution flattened copy.
- Saving is a full PDF rewrite. It can invalidate digital signatures. Use Save As for signed or important originals. The app does not claim PDF/A, tagged-PDF, accessibility-tree, attachment, or complex interactive-feature preservation.
- Notes remain editable PDF annotations. Text boxes are annotations; they do not modify underlying text.
- Browser preview supports file selection and downloads for testing. Native filesystem and window features are desktop-only.
- Recent document paths are stored locally in Electron's application data folder. PDF contents are not stored there. Validated workspace preferences are stored locally in the renderer’s localStorage.

## Architecture

`electron/main.ts` owns native dialogs and file access. The isolated preload exposes an explicit API, not Node, paths, or arbitrary IPC. File handles are opaque and originate from user file selection. Renderer IPC validates its sending window/frame. Permission requests, new windows, webviews, external navigation, and production HTTP requests are blocked.

`src/core/worker.ts` runs MuPDF WebAssembly in a worker in the sandboxed renderer. The worker keeps the active parsed document alive and keys it to the immutable revision ID. Sequential edits avoid reparsing or retransferring the input PDF; undo and branched history safely reload the exact stored revision. PDF JavaScript is disabled. `src/core/history.ts` stores immutable byte revisions. PDF.js renders canvas and a selectable text layer without the scripting viewer.

Generated PDF.js resources are copied as bytes, avoiding macOS clonefile stalls observed in a cloud-managed Documents folder. `out/renderer` is the production renderer; `dist-electron` contains the main/preload bundles.

## Verify

```sh
npm test
npm run build
npm run test:desktop
node scripts/test-tabs.mjs
```

Desktop tests launch actual Electron windows using Playwright, exercise the UI and real file services, and write temporary test PDFs. Native file-dialog selections are supplied by the test harness; no existing user files are modified. Screenshots and results are written to ignored `test-results/`.

## License

AGPL-3.0-only. MuPDF is used under its open-source AGPL license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No license fees, accounts, cloud services, or proprietary PDF SDKs are required by this build.
