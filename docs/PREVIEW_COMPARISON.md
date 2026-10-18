# Apple Preview comparison

Inspected locally on 2026-10-13 using REA 6.4.0 and the running Apple Preview app. This is an initial architecture and interaction study, not a reconstruction of Apple's implementation.

## Evidence

Command: `npx -y rea-agents@latest inspect-macho /System/Applications/Preview.app --format json`

The complete REA evidence is in [research/preview-macho.json](research/preview-macho.json). Its binary SHA-256 is `9992534fbe7587b06232c9c997c4c94f6f0d1c2003a5e0ee97841fd2bb137440`; source version is `1113.5.3`. Load commands include PDFKit, CoreGraphics, QuartzCore, Metal, MetalKit, Accelerate, AppKit, PaperKit, and private AnnotationKit/CorePDF frameworks. These prove linked dependencies, not that any particular operation uses GPU acceleration or a particular cache.

Opened a generated 12-page selectable PDF in Preview using native UI automation. The accessibility tree exposed:

- A thumbnail collection showing pages 1–5 initially.
- A document scroll area with page text and continuous page navigation.
- Main toolbar controls for sidebar, zoom out/actual size/in, highlight, rotate, form filling, markup, inspector, and search.
- A separate markup toolbar containing selection, redact, sketch, shapes, text, sign, note, and style controls.

The five visible thumbnails suggest viewport-oriented presentation; they do not prove that offscreen rasters are released. Neither binary inspection nor accessibility establishes Apple's timing, memory consumption, render tiling, or search indexing implementation. No Apple code or assets were copied.

## First improvements implemented

| OpenPDF finding | Change | Expected effect and tradeoff |
| --- | --- | --- |
| Every search query extracted text from every page again | Share pending extraction and reuse page text by immutable PDF.js document proxy | Warm queries avoid extraction. A 4 million character LRU budget bounds cached strings; larger documents may need extraction again. Closing/replacing a proxy allows garbage collection. |
| Zoomed pages allocated full Retina rasters without an area limit | Cap each canvas at 8 million pixels and 8192 pixels per side | A 612×792 pt page at 400% on a 2× display previously requested 31,021,056 pixels (~118 MiB RGBA per surface). It now stays below ~31 MiB per surface. CSS geometry and selectable text remain unchanged; high-zoom raster artwork can look softer. Two surfaces coexist during a swap, and this is not a total application memory cap. |
| Deferred text extraction could finish after navigation and rejected outside the render error handler | Cancel scheduled idle work, check cancellation after extraction, catch asynchronous failures, and give idle callbacks a 250 ms timeout | Avoid stale text-layer construction and unhandled failures; text selection gets a bounded scheduling delay under sustained activity, excluding extraction/render time. |

These are independently derived fixes to observed OpenPDF code. There is no measured claim that OpenPDF now matches Preview's speed.

## Next priorities

1. Continuous reading with viewport-based page mounting, overscan, and stable page dimensions. Keep the active page, keyboard navigation, search destinations, and annotation geometry synchronized. This is the most visible difference from Preview's reading workflow.
2. Reusable thumbnail scheduling with bounded concurrency and offscreen bitmap eviction. Current thumbnails load lazily but remain retained after viewing.
3. Progressive search results and navigation to individual occurrences, with consistent cross-span phrase highlighting. Current search returns page-level matches after the scan; highlights are span-based.
4. Optional markup toolbar to increase document space while reading. Preserve quick access to highlight and signature tools.
5. Benchmark both apps with the same generated documents: 12-page text, 100-page scanned, mixed-size pages, and a large vector page. Record cold/warm open, first visible page, page changes, search, high zoom, and peak resident memory. Static framework links cannot substitute for those measurements.

## Verification

`tests/viewer-performance.test.ts` covers extraction reuse, concurrent queries, revision isolation, failed extraction retries, cache eviction, Retina resolution, and extreme aspect ratios. Run `npx vitest run tests/viewer-performance.test.ts`, `npm run build`, and `npm run test:desktop`.

Results for this pass: all four targeted tests pass; TypeScript, `git diff --check`, and the full production build pass. Desktop verification was attempted but stopped after the runner remained blocked in a filesystem open before Electron launched. Cloud-only dependency files also stalled the first build attempts; restoring the exact installed npm versions resolved the build stalls without changing dependency versions. End-to-end desktop behavior and actual latency/memory benchmarks remain unverified.
