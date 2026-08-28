# Verification — 2026-08-28

## Passed

- TypeScript check and Vite/Electron production build.
- 22 unit tests against real MuPDF documents and actual temporary files.
- 20 Electron desktop scenarios, run against both the source build and the packaged Apple Silicon `.app`.
- Gstack browser verification at 980 × 650: sample PDF opened, rendered with selectable text, interactive controls present, no browser console errors. Version 0.2 Settings and welcome layouts also checked at the minimum size.
- Visual inspection of welcome, reader, organizer, and minimum-window screenshots.

Desktop scenarios: launch; sandbox/preload settings; worker initialization and real PDF rendering; document search and navigation; note placement; drawing and undo/redo; mouse-selected text highlighting; page rotate/duplicate/delete/reorder; native save and annotation persistence; extraction; split; merge; dark mode; canceled Save As; canceled close; recent-file reopen with annotations intact.

Filesystem tests check atomic replacement and refusal to overwrite an externally modified original. PDF tests include all nine annotation types, rotated-page annotation coordinates, independent page duplication, preserved notes during copy/merge, invalid ranges, protected-file rejection, and history save-state correctness.

The desktop harness supplies native dialog choices but calls the real preload, IPC, filesystem service, PDF worker, and renderer. It does not modify user documents. Evidence is generated in ignored `test-results/`; the harness is `scripts/test-desktop.mjs`.

## Version 0.2 product and preferences checks

- Generated icon loads in the packaged renderer, and Info.plist points to the generated `icon.icns` (3.7 MB); bundle version is 0.2.0.
- Native Settings menu, System/Light/Dark appearance, live palette changes, reduced-motion setting, and persistence after renderer reload.
- Default fit, sidebar visibility, annotation color, and line weight applied to a real opened PDF.
- Confirmed preference reset; Escape closes Settings without changing the active annotation tool or document.
- Clear recent history updates the native JSON file and renderer while preserving the actual PDF files.
- Validation rejects unsupported preference values, tolerates damaged/unavailable storage, and migrates the original light/dark preference.
- Final packaged-app run: 20 scenarios passed, zero renderer errors. Unit suite: 22 passed.

## Packaging

`release/mac-arm64/OpenPDF Studio.app`, Electron 44.0.0, macOS arm64. Version 0.2.0. Local unsigned distribution. No upload or public release performed.

## Not verified

Physical printing, Finder associations after installation into Applications, Intel builds, Apple signing/notarization, screen-reader usability, and a large external PDF compatibility corpus. Forms, PDF/A preservation, certificate signatures, OCR, scanning, Office conversion, redaction, and editing existing PDF text are outside this release. See README for size and history limits.

## Fixes found during verification

1. Worker requests could arrive before the MuPDF WebAssembly import completed. Added a ready-message queue before sending the first request.
2. Native filesystem copy operations stalled on generated resources inside this Documents folder. Resource packaging now uses ordinary byte reads/writes.
3. Importing the complete PDF.js viewer stylesheet affected the application's sidebar. Included only the required text-layer layout rules.
4. With Vite `copyPublicDir: false`, the first icon integration was absent in the production renderer. The icon is now a direct Vite asset import, and desktop QA asserts its decoded image dimensions.
5. Settings dismissal originally also reset the active annotation tool through the document Escape handler. The handler now respects dialogs; desktop QA covers this.
