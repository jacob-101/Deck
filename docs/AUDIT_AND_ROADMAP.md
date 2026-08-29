# OpenPDF Studio: Comprehensive Product Audit & Roadmap

**Date:** 2026-08-28  
**Release:** OpenPDF Studio 0.3.0  
**Target Platform:** macOS (Apple Silicon arm64 & universal ready)  
**License:** AGPL-3.0-only

---

## 1. Executive Summary

OpenPDF Studio was audited to address key functional gaps—specifically making **Add Text** robust and implementing a native **Sign (Visible Stamp)** workflow with full persistence, aspect-ratio preservation, move/resize capabilities, and strict offline guarantees.

All 34 unit tests and 25 desktop end-to-end Electron integration tests passed cleanly, validating both source builds and the packaged `.app` bundle (`release/mac-arm64/OpenPDF Studio.app`).

---

## 2. Comprehensive Feature Matrix & Verification Status

| Feature / Area                        | Status                 | Verified Capabilities                                                                                                                                                                                                                                                                                                                                                                                                                   | Technical Notes & Constraints                                                                                                                                    |
| :------------------------------------ | :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Reading & Search**         | **Working & Verified** | • Clean rendering via PDF.js worker<br>• Full-text keyword search with snippets & page jumping<br>• Page fit, width fit, manual zoom (15%–400%)<br>• Page thumbnails & embedded outline navigation                                                                                                                                                                                                                                      | Up to 500 pages / 50 MB documents supported by default.                                                                                                          |
| **Add Text (FreeText Annotations)**   | **Working & Verified** | • Interactive placement on page via click or drag<br>• Dedicated font size (10–32 pt), font family (`Helv`, `Cour`, `Times`), and readable text color palette<br>• Transparent, preset, and custom PDF background fills<br>• Unicode characters (e.g. `Café`, `€`, `©`) and multiline formatting<br>• Interactive move & resize bounding box on page canvas<br>• Full undo/redo, native save, and reload persistence                    | Uses standard PDF `FreeText` annotation appearance streams. Does not alter underlying static text content streams.                                               |
| **Sign Workflow (Stamp Annotations)** | **Working & Verified** | • 4 creation modes: Saved, Draw (interactive canvas), Type (cursive styles), Import (PNG/JPEG up to 5 MB / 4096px)<br>• Background removal for scanned signatures<br>• Interactive placement, drag repositioning, and corner resize with strict aspect-ratio preservation<br>• Explicit opt-in local storage with quota error handling and deletion controls<br>• Standard PDF `Stamp` annotation persistence with embedded image bytes | Distinct from cryptographic certificate signing. Modifying digitally signed PDFs warns users of certificate invalidation.                                        |
| **Markup & Shapes**                   | **Working & Verified** | • Text selection highlight, underline, strikethrough<br>• Ink drawing, Rectangle, Ellipse, Arrow/Line<br>• Sticky notes with comment editing<br>• Line weights (1–5 pt) and color palette selection<br>• Annotation inspection dialog & undo/redo stack                                                                                                                                                                                 | Repositioning restricted to rectangular annotations (`FreeText`, `Stamp`, `Square`, `Circle`, `Text`) to prevent engine crashes on stroke annotations.           |
| **Page Organization**                 | **Working & Verified** | • Rotate page 90° clockwise<br>• Duplicate page independently<br>• Delete page with safety confirmation<br>• Drag-and-drop / button reordering<br>• Extract page ranges (e.g. `1, 3-5`) to separate PDF<br>• Split all pages into individual PDFs<br>• Merge additional PDFs into current document                                                                                                                                      | All page operations operate on byte representations with history undo/redo.                                                                                      |
| **Security & Privacy**                | **Working & Verified** | • 100% offline document processing (zero network requests, zero telemetry)<br>• Sandboxed Electron renderer (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`)<br>• Strict preload IPC whitelist for native file dialogs<br>• Safe atomic save prevents file corruption<br>• External modification detection prevents accidental overwrites                                                                          | Conforms to strict local privacy design.                                                                                                                         |
| **AcroForms / Interactive Forms**     | _Roadmap_              | _Not yet supported_                                                                                                                                                                                                                                                                                                                                                                                                                     | Viewing flattened form fields works via PDF.js, but interactive field editing requires widget annotation handlers.                                               |
| **Offline OCR**                       | **Working & Verified** | Apple Vision recognition, language selection, Markdown merge/export, native text copy, and scanned-page detection for up to 100 selected pages per run.                                                                                                                                                                                                                                                                                 | OCR output must still be reviewed for recognition errors. Scanner capture remains roadmap work.                                                                  |
| **True Content Redaction**            | _Roadmap_              | _Not yet supported_                                                                                                                                                                                                                                                                                                                                                                                                                     | Drawing a black rectangle is markup, not true redaction. True redaction requires destructive removal of underlying text/vector glyphs and image pixels in MuPDF. |
| **Existing PDF Text Editing**         | _Roadmap_              | _Not yet supported_                                                                                                                                                                                                                                                                                                                                                                                                                     | Reflowing existing layout / editing compiled content streams requires font extraction and text run replacement.                                                  |
| **Cryptographic Digital Signatures**  | _Roadmap_              | _Not yet supported_                                                                                                                                                                                                                                                                                                                                                                                                                     | PKCS#7 / PAdES certificate validation and cryptographic signing are separate from visible signature stamps.                                                      |

---

## 3. Ranked Product Roadmap

### Milestone 1: Form Filling & Annotation Flattening (Immediate Next Priority)

- **Interactive Form Filling:** Support text fields, checkboxes, and radio buttons in standard AcroForms without external cloud dependencies.
- **Annotation Flattening:** Allow users to bake annotations and signatures permanently into page content streams before sharing.

### Milestone 2: Local OCR & Scanned Document Processing

- **Apple Vision / Tesseract Integration:** On-device OCR for scanned documents to generate selectable and searchable text layers.
- **Image Extraction & Insertion:** Ability to extract embedded raster images or insert images directly into pages.

### Milestone 3: PDF Optimizer & True Redaction

- **Compression / Optimizer:** MuPDF stream deduplication, unused object removal, and lossless/lossy image re-compression to reduce file sizes.
- **Destructive Redaction:** True permanent redaction removing underlying text streams, vector paths, and pixel data beneath redacted zones.

### Milestone 4: Advanced Document Editing & Certificate Signing

- **In-Place Text Editing:** Targeted text run modification for minor typos in standard embedded fonts.
- **Cryptographic PAdES Signatures:** Optional certificate-based signing with local keychain integration.

---

## 4. Verification Evidence

- **Unit Suite:** 34 tests in `tests/pdf.test.ts`, `tests/preferences.test.ts`, and `tests/files.test.ts` (all passing).
- **Desktop E2E Suite:** 25 end-to-end automated Electron scenarios in `scripts/test-desktop.mjs` (all passing on source build and packaged `.app`).
