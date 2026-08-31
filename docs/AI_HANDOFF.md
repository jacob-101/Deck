# OpenPDF Studio: independent audit and improvement handoff

> **Historical 0.3.0 handoff:** Add Text, visible signing, OCR, image conversion, and the 0.4.0 PDF Tools suite were implemented after this prompt was written. Use `README.md` and `docs/VERIFICATION.md` as the current source of truth before acting on any “missing” claim below.

Prepared 2026-08-28 for another coding agent. This is an instruction prompt, not a claim that the missing features are implemented.

## Locations and baseline

- Public repository: https://github.com/jacob-101/openpdf-studio
- Local checkout: `/Users/jacob/Documents/ChatGPT/I-hate-adobe`
- macOS application: `/Users/jacob/Documents/ChatGPT/I-hate-adobe/release/mac-arm64/OpenPDF Studio.app`
- Main branch baseline: `9b161f162098d17e827c60f9966837b81aa0e7b9` (version 0.3.0).
- This handoff file is initially local; do not assume it has been pushed to GitHub.
- Generated build directories and test evidence are ignored by Git. A fresh clone will not contain the `.app` or screenshots.

## User request and quality bar

Jacob wants a real offline, open-source Acrobat alternative for macOS, with a cohesive product identity and a professional interface. The current build is a partial implementation, not a complete Acrobat replacement.

Latest direct feedback: **many features are missing, including signing; the Add Text option is buggy.** The precise Add Text reproduction steps have not yet been supplied. Treat this as an unresolved user report, not a bug already fixed by existing tests.

Use Garry Tan’s gstack when available. Relevant local skills are under `/Users/jacob/.codex/skills/gstack-*`. Read the applicable skill before using it. Use investigation, QA, and review workflows as appropriate; distinguish a browser preview visual check from actual Electron verification. Do not claim a workflow ran if the tools were unavailable.

## Your task

Act as an independent product engineer and QA reviewer. Inspect the implementation, run the app, reproduce defects, and implement improvements. Do not stop at a written plan or assume the previous agent’s claims establish correctness. Prioritize reliable everyday document workflows over cosmetic expansion.

### 1. Audit the current product

Read README.md, docs/BUILD_PLAN.md, docs/VERIFICATION.md, package.json, and the implementation. Produce a feature matrix with these statuses: working and verified, present but buggy/incomplete, missing, and not verified. Record actual evidence, severity, and user impact. Include:

- Open/save, Save As, cancellation, external file changes, document switching, and unsaved changes.
- Read/search/copy, thumbnails, zoom/fit, document outlines, and keyboard controls.
- Add Text, notes, highlight/underline/strike-through, shapes, drawing, annotation editing/removal, and undo/redo.
- Organize, rotate, reorder, duplicate, delete, merge, extract, and split.
- Signature placement, forms, OCR/scanning, conversion, compression, redaction, and editing existing text/images.
- Settings, accessibility, minimum window size, large documents, error states, and packaging.

Prioritize defects that can lose data or produce an incorrect saved PDF. Do not treat an attractive screen or a passing sample-file test as proof that a workflow works with real documents.

### 2. Fix Add Text first

Reproduce the full UI path: open a PDF → Annotate → Text box → place text → save → close → reopen. Test ordinary PDFs, scanned pages, rotated pages, nonzero crop-box origins, different zoom levels, and placement near every page edge. Test multiline and long text, punctuation, Unicode and font fallback, empty input, cancellation, repeated edits, undo/redo, and reopening in another PDF reader.

Code observations to investigate, **not confirmed root causes of Jacob’s report**:

- `src/components/PDFPage.tsx`, `finishDrawing`: FreeText placement uses a fixed approximately 230 × 72 point rectangle, clipped against the right/bottom page edges. Drag dimensions are ignored for the final text box.
- The same component computes positions from the displayed page rectangle and scale. Check how that maps to PDF rotations, crop boxes, and the editing engine’s coordinate system.
- `src/core/pdf.ts`, `addAnnotation`: FreeText uses `Helv` at a hardcoded 14 points. Verify text wrapping, glyph coverage, clipping, and appearance generation.
- FreeText inherits the shared annotation color, whose default is honey/yellow. That may be unsuitable for readable added text.
- The current annotation editor changes contents/color and some line weights; it does not provide a full text layout, font-size, move, or resize workflow.
- Existing FreeText tests exercise engine operations and rendering, but the desktop suite does not yet place a text box through the full UI workflow.

Implement a discoverable **Add Text** workflow with readable defaults, useful sizing/font controls, predictable placement, and repositioning/resizing if needed. Make wrapping/overflow behavior explicit. Preserve page text and images underneath. Clearly distinguish adding text annotations from editing existing PDF text. Do not claim existing-text editing unless it is actually implemented.

Add failing regression tests for reproduced defects, then verify the fixes through the real Electron UI and saved output. If the exact reported bug cannot be reproduced, say so and request a sample or precise steps without blocking unrelated confirmed fixes.

### 3. Add a usable Sign workflow

Implement a first-class visible-signature workflow: draw a signature, type one with preview, or import an image; place it on a PDF; move/resize it with predictable bounds and preserved proportions; cancel/delete it; undo/redo; save and reopen with the signature present. Include clear validation and error states.

Persist the signature in the PDF using a suitable standard representation. An HTML overlay or application-only sidecar is not completion. Keep signatures local and do not retain a reusable signature without explicit opt-in and a deletion control. Handle imported images through the existing restricted desktop file-access model; do not expose arbitrary filesystem access.

**Visible signatures are not cryptographic digital signatures.** Label the feature honestly. Do not add a “verified” badge, certificate claim, or legal-validity guarantee without implementing and verifying the corresponding capability. PDF certificate signatures and Apple app code signing/notarization are also different features.

Warn that rewriting an already signed PDF can invalidate existing digital signatures. Preserve originals and make saving a copy easy. Do not quietly remove or imply preservation of existing signature validation.

### 4. Continue the roadmap with explicit boundaries

After Add Text and visible signing work reliably, rank the remaining gaps and implement the next coherent, testable milestone. Candidates include form filling, images, OCR, scanning, compression, conversion, and true redaction. Document the engine/API and licensing implications before adding dependencies.

Do not quietly redefine the full product as only a viewer. Equally, do not claim all missing features are done in a single pass. Report exactly what ships and what remains.

## Architecture and important files

The current stack is Electron 44, React 19, TypeScript, Vite, Zustand, PDF.js 6.2, and MuPDF 1.28 WebAssembly. Verify installed versions rather than relying on this snapshot.

| Area | Files |
| --- | --- |
| Main interface, tools, dialogs, save actions | `src/App.tsx` |
| Page rendering, text layer, pointer coordinates, placement | `src/components/PDFPage.tsx` |
| PDF inspection, annotation creation/update, page operations | `src/core/pdf.ts` |
| Worker protocol, initialization, timeouts | `src/core/client.ts`, `src/core/worker.ts` |
| Immutable byte revisions, undo/redo, saved state | `src/core/history.ts` |
| Annotation inspector | `src/components/AnnotationEditor.tsx` |
| Shared data and command types | `src/types.ts` |
| Native dialogs, filesystem safety, restricted IPC | `electron/main.ts`, `electron/preload.ts`, `electron/files.ts` |
| Preferences and visual system | `src/core/preferences.ts`, `src/components/Settings.tsx`, `src/styles.css`, `src/settings.css`, `src/inspector.css` |
| Brand/icon assets and prompt | `brand/README.md`, `brand/icon-source.png`, `build/icon.png`, `src/assets/app-icon.png` |
| Engine/filesystem/preferences tests | `tests/pdf.test.ts`, `tests/files.test.ts`, `tests/preferences.test.ts` |
| Real Electron integration tests | `scripts/test-desktop.mjs` |

## Guardrails

- Keep the app offline during document processing: no accounts, cloud uploads, analytics, or paid PDF SDK dependency by default.
- Maintain renderer sandboxing, context isolation, disabled Node integration, disabled PDF JavaScript, denied unexpected permissions, and narrowly validated IPC.
- Use copies of user documents for testing. Never silently overwrite originals, discard unsaved edits, or weaken conflict detection.
- Preserve the Forest & Paper identity and light/dark/system themes while improving usability. Functional correctness takes priority over decorative changes.
- Source is AGPL-3.0-only. Retain notices and review dependency compatibility.
- Current limits are 50 MB / 500 pages, bounded byte-history memory, and restricted print/export sizes. Reassess deliberately, not by removing guards.
- Vite intentionally has `copyPublicDir: false`. Import renderer images from `src/assets`; PDF.js resources are copied separately. macOS clonefile/copyfile stalls were observed in this Documents directory, so the resource script uses byte reads/writes.
- Work on a branch such as `codex/audit-text-and-sign`. Do not force-push, change repository visibility, publish releases, install credentials, or bypass OS/network approval requirements. Ask before pushing.

## Run and verify

Requires macOS for native app testing and Node.js 22.12+ with npm. Initial dependency installation needs network access.

```sh
cd "/Users/jacob/Documents/ChatGPT/I-hate-adobe"
npm ci
npm run dev
```

On another machine, clone `https://github.com/jacob-101/openpdf-studio.git` and use that checkout instead. Inspect local changes before installing dependencies or starting work.

```sh
npm test
npm run build
npm run test:desktop
npm run package
```

Verify the packaged Apple Silicon application, not only `electron .`:

```sh
OPENPDF_TEST_EXECUTABLE="$PWD/release/mac-arm64/OpenPDF Studio.app/Contents/MacOS/OpenPDF Studio" npm run test:desktop
```

`npm run dev:web` provides a preview on `http://127.0.0.1:5173`; it cannot prove native file dialogs, filesystem safety, window behavior, or packaged execution. Screenshots and test reports go under ignored `test-results/`. The current application is unsigned and not Apple-notarized.

Previous baseline: 28 unit tests and 23 desktop scenarios passed. Those are limited regression checks, not a complete product audit; rerun them and extend meaningful gaps. Independent saved-file validation and end-to-end Add Text/Sign coverage are required.

## Required deliverables

1. Evidence-based feature matrix and prioritized defect list.
2. Reproduced Add Text issues, root causes, implemented fixes, and regression tests.
3. A usable visible-signature workflow with saved-PDF persistence and honest capability labels.
4. Screenshots and test PDFs demonstrating placement at multiple zooms, rotations, and page boundaries; no private user content in committed fixtures.
5. Updated documentation, fresh packaged `.app`, exact verification results, and a clear remaining-feature list.

Start by running the existing app and testing Add Text. Then implement and verify the fixes; do not respond with a plan alone.
