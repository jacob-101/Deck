# Performance baselines

Measured on Jacob’s Apple Silicon Mac on 2026-08-31. These are local regression baselines, not claims about every machine.

## Rust signature accelerator

The old imported-signature path decoded an image on the renderer thread, scanned every RGBA pixel once to remove white, scanned every pixel again to find visible bounds, cropped through canvas, and encoded a PNG. Large images could block multiple animation frames.

The replacement sends the compressed PNG/JPEG bytes to `openpdf-native`, a 653 KB Rust sidecar. Rust decodes, removes white, discovers bounds in the same pass, adds padding, crops, and encodes the output PNG outside the renderer. Electron validates the input and returned PNG before crossing the preload boundary. Canvas processing remains available in the browser-only preview; the desktop app surfaces native failures rather than retrying potentially hostile input in the renderer.

| Measurement            |  Median | Scope                                                          |
| ---------------------- | ------: | -------------------------------------------------------------- |
| Former JavaScript path | 45.6 ms | White removal and bound scan only, 4000×4000 RGBA              |
| Rust native path       | 32.8 ms | Process IPC, PNG decode, cleanup, bound scan, crop, PNG encode |
| Packaged UI workflow   |   32 ms | Click “Place Signature” through completed PDF revision         |

The warm native path is about 28% faster despite performing more work, and its CPU-heavy portion no longer runs on the renderer thread. The first cold process launch measured higher and is not hidden; this tool is optimized for interaction smoothness and warm application use.

## PDF edit transport

The worker already retains the active MuPDF document by immutable revision ID. Consecutive edits now omit the full source PDF from the request when that session is current. If a worker has restarted, it returns a session-miss signal and the client retries once with the exact revision bytes. Undo and branched history still send the required source revision.

A 50 MB structured clone measured a 2.56 ms local Node median and 10.9 ms maximum in the benchmark sample. Browser and memory-pressure costs vary, but the optimized path removes one complete input clone and allocation from every consecutive edit without changing output or history semantics.

## Bundle impact

- Native Rust binary: 653 KB, stripped release build.
- Renderer bundle: approximately 752 KB uncompressed, effectively unchanged at the displayed filesystem precision.
- PDF worker bundle: approximately 112 KB uncompressed, effectively unchanged at the displayed filesystem precision.

## Reproduction

```sh
npm run test:rust
npm test
npm run package
npm run test:desktop
```

The packaged test output includes `rustSignatureImportMs`. Rust dependencies are locked in `native-rust/Cargo.lock`.
