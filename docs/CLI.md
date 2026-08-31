# OpenPDF Studio CLI

`openpdf` gives scripts and AI agents direct access to OpenPDF Studio’s offline engine. It does not automate the graphical interface and does not upload documents.

## Setup

From the repository:

```sh
npm ci
npm run build:cli
./bin/openpdf capabilities
```

To make `openpdf` available from any directory on this Mac:

```sh
npm link
openpdf version
```

Node.js 22.12 or newer is required. Offline OCR is macOS-only and also requires `npm run build:native` once.

## Agent contract

- `openpdf capabilities` returns the supported commands, exact usage schemas, global options, and examples as JSON.
- Inspection, scans, and successful file operations write JSON to standard output.
- Failures write one JSON object to standard error and return a nonzero exit code.
- Text and Markdown extraction write document content to standard output unless an output path or `--json` is supplied.
- Existing outputs are never replaced unless the caller supplies `--force`.
- Output files are written to a temporary sibling and renamed atomically.
- Passwords default to the `OPENPDF_PASSWORD` environment variable so agents do not need to place secrets in shell history. Select another variable with `--password-env NAME`.

Exit codes:

| Code | Meaning                       |
| ---: | ----------------------------- |
|    0 | Success                       |
|    2 | Invalid command or arguments  |
|    3 | Input or password problem     |
|    4 | PDF processing or OCR failure |
|    5 | Output already exists         |

## Common agent workflows

Inspect a document:

```sh
openpdf inspect contract.pdf
```

Extract selected pages into a JSON response:

```sh
openpdf extract-text contract.pdf --pages 1,3-5 --json
```

Convert selectable text to Markdown:

```sh
openpdf to-markdown report.pdf report.md
```

Run offline Apple Vision OCR and save Markdown:

```sh
openpdf ocr scan.pdf scan.md --pages 1-10 --language auto
```

Render high-quality page images:

```sh
openpdf render-pages report.pdf --output-dir ./pages --format png --dpi 300
```

Scan and clean hidden data:

```sh
openpdf privacy-scan report.pdf
openpdf privacy-clean report.pdf cleaned.pdf
```

Protect or unlock a copy without exposing a password in arguments:

```sh
OPENPDF_PASSWORD='use-a-secret-manager' openpdf encrypt report.pdf protected.pdf
OPENPDF_PASSWORD='use-a-secret-manager' openpdf unlock protected.pdf unlocked.pdf
```

The CLI also supports compression, flattening, crop/resize, page extraction, five split modes, image extraction, PDF creation from images, metadata, Bates numbering, mirroring, N-up sheets, alternate mixing, form inspection, and form filling. Run `openpdf capabilities` for the authoritative schema.

## Form filling

First inspect field IDs:

```sh
openpdf form-fields form.pdf
```

Create a JSON object mapping the returned IDs to values:

```json
{
  "0:0": "Jacob",
  "0:1": "on"
}
```

Then create a filled copy:

```sh
openpdf fill-form form.pdf filled.pdf --values values.json
```

## Limits

The CLI uses the same safety bounds as the app: PDFs up to 50 MB and 500 pages, image rendering and OCR up to 100 pages per operation, and rendering from 72–600 DPI. It does not provide certificate signatures, redaction, or direct editing of existing page text.
