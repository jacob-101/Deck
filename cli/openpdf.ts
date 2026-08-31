#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  access,
  link,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addBatesNumbers,
  alternateMix,
  cleanPrivacy,
  cropResizePDF,
  encryptPDF,
  extractImages,
  fillForm,
  flattenPDF,
  listFormFields,
  mirrorPages,
  optimizePDF,
  pagesPerSheet,
  pdfPagesToImages,
  scanPrivacy,
  splitDocument,
  unlockPDF,
  updateMetadata,
} from "../src/core/document-tools";
import { extract, imagesToPDF, inspect, openPDF } from "../src/core/pdf";
import { parsePageRange } from "../src/core/ranges";

type OptionValue = string | boolean;
type Parsed = {
  command: string;
  positionals: string[];
  options: Map<string, OptionValue>;
};

const VERSION = "0.4.0";
const commandSchemas = {
  inspect: "inspect INPUT.pdf",
  "extract-text":
    "extract-text INPUT.pdf [OUTPUT.txt] [--pages 1,3-5] [--json]",
  "to-markdown": "to-markdown INPUT.pdf [OUTPUT.md] [--pages 1,3-5] [--json]",
  ocr: "ocr INPUT.pdf [OUTPUT.md|OUTPUT.json] [--pages 1,3-5] [--language auto|LANG]",
  compress: "compress INPUT.pdf OUTPUT.pdf",
  encrypt: "encrypt INPUT.pdf OUTPUT.pdf [--password-env NAME]",
  unlock: "unlock INPUT.pdf OUTPUT.pdf [--password-env NAME]",
  flatten: "flatten INPUT.pdf OUTPUT.pdf",
  crop: "crop INPUT.pdf OUTPUT.pdf [--margin 0..40] [--size keep|a4|letter]",
  "privacy-scan": "privacy-scan INPUT.pdf",
  "privacy-clean": "privacy-clean INPUT.pdf OUTPUT.pdf",
  "render-pages":
    "render-pages INPUT.pdf --output-dir DIR [--format png|jpg] [--dpi 72..600] [--quality 35..100]",
  "extract-images": "extract-images INPUT.pdf --output-dir DIR",
  "extract-pages": "extract-pages INPUT.pdf OUTPUT.pdf --pages 1,3-5",
  split:
    "split INPUT.pdf --output-dir DIR [--mode pages|size|half|chapter|text] [--value VALUE]",
  metadata:
    "metadata INPUT.pdf OUTPUT.pdf [--title TEXT] [--author TEXT] [--subject TEXT] [--keywords TEXT] [--creator TEXT]",
  bates:
    "bates INPUT.pdf OUTPUT.pdf [--prefix TEXT] [--suffix TEXT] [--start N] [--digits N] [--position POSITION]",
  mirror: "mirror INPUT.pdf OUTPUT.pdf [--direction horizontal|vertical|both]",
  nup: "nup INPUT.pdf OUTPUT.pdf [--pages-per-sheet 2|4|6|9]",
  mix: "mix INPUT.pdf OUTPUT.pdf --with SECOND.pdf [--second-first]",
  "form-fields": "form-fields INPUT.pdf",
  "fill-form": "fill-form INPUT.pdf OUTPUT.pdf --values VALUES.json",
  "images-to-pdf": "images-to-pdf IMAGE.png [IMAGE.jpg ...] OUTPUT.pdf",
} as const;
const capabilities = {
  name: "openpdf",
  version: VERSION,
  offline: true,
  contract: {
    success:
      "JSON on stdout for operations; document content for extraction without --output",
    errors: "JSON on stderr",
    overwrite: "Refused unless --force is supplied",
    password: "Set OPENPDF_PASSWORD or use --password-env NAME",
  },
  commands: [
    "inspect",
    "extract-text",
    "to-markdown",
    "ocr",
    "compress",
    "encrypt",
    "unlock",
    "flatten",
    "crop",
    "privacy-scan",
    "privacy-clean",
    "render-pages",
    "extract-images",
    "extract-pages",
    "split",
    "metadata",
    "bates",
    "mirror",
    "nup",
    "mix",
    "form-fields",
    "fill-form",
    "images-to-pdf",
  ],
  schemas: commandSchemas,
  globalOptions: {
    "--force": "replace existing outputs atomically",
    "--json": "wrap extracted text or Markdown in a JSON response",
  },
  examples: [
    "openpdf inspect report.pdf",
    "openpdf to-markdown scan.pdf result.md",
    "openpdf ocr scan.pdf result.md --pages 1-3",
    "OPENPDF_PASSWORD='...' openpdf encrypt input.pdf protected.pdf",
    "openpdf render-pages report.pdf --output-dir pages --dpi 300",
  ],
};

class CLIError extends Error {
  constructor(
    message: string,
    readonly code = "USAGE",
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

function parse(argv: string[]): Parsed {
  const command = argv.shift() || "help";
  const positionals: string[] = [];
  const options = new Map<string, OptionValue>();
  const booleanOptions = new Set(["force", "second-first", "json"]);
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    if (equals > 2) {
      options.set(token.slice(2, equals), token.slice(equals + 1));
      continue;
    }
    const key = token.slice(2);
    if (booleanOptions.has(key)) {
      options.set(key, true);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(key, next);
      index++;
    } else options.set(key, true);
  }
  return { command, positionals, options };
}

const textOption = (parsed: Parsed, key: string, fallback = "") => {
  const value = parsed.options.get(key);
  return typeof value === "string" ? value : fallback;
};
const numberOption = (
  parsed: Parsed,
  key: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const raw = textOption(parsed, key, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max)
    throw new CLIError(`--${key} must be between ${min} and ${max}.`);
  return value;
};
const flag = (parsed: Parsed, key: string) => parsed.options.get(key) === true;
const required = (value: string | undefined, usage: string) => {
  if (!value) throw new CLIError(`Missing argument. Usage: ${usage}`);
  return value;
};

async function readBytes(path: string) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error();
    return new Uint8Array(await readFile(path));
  } catch {
    throw new CLIError(`Cannot read input file: ${path}`, "INPUT", 3);
  }
}

async function writeAtomic(path: string, bytes: Uint8Array, force: boolean) {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  if (!force) {
    try {
      await access(output);
      throw new CLIError(
        `Output already exists: ${output}. Use --force to replace it.`,
        "OUTPUT_EXISTS",
        5,
      );
    } catch (error) {
      if (error instanceof CLIError) throw error;
    }
  }
  const temporary = join(
    dirname(output),
    `.${basename(output)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    if (force) await rename(temporary, output);
    else {
      try {
        await link(temporary, output);
        await unlink(temporary);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "EEXIST"
        )
          throw new CLIError(
            `Output already exists: ${output}. Use --force to replace it.`,
            "OUTPUT_EXISTS",
            5,
          );
        throw error;
      }
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return output;
}

async function writeText(path: string, value: string, force: boolean) {
  return writeAtomic(path, new TextEncoder().encode(value), force);
}

async function writeFiles(
  folder: string,
  files: { name: string; bytes: Uint8Array }[],
  force: boolean,
) {
  const output = resolve(folder);
  await mkdir(output, { recursive: true });
  const paths: string[] = [];
  for (const file of files)
    paths.push(
      await writeAtomic(join(output, basename(file.name)), file.bytes, force),
    );
  return paths;
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function selectedPages(bytes: Uint8Array, range: string) {
  const count = inspect(bytes).pages.length;
  return range
    ? parsePageRange(range, count)
    : Array.from({ length: count }, (_, index) => index);
}

function extractContent(bytes: Uint8Array, range: string, markdown: boolean) {
  const doc = openPDF(bytes);
  try {
    const pages = range
      ? parsePageRange(range, doc.countPages())
      : Array.from({ length: doc.countPages() }, (_, index) => index);
    return pages
      .map((index) => {
        const page = doc.loadPage(index);
        const structured = page.toStructuredText("preserve-whitespace");
        try {
          const value = structured.asText().trim();
          return markdown
            ? `<!-- Page ${index + 1} -->\n\n## Page ${index + 1}\n\n${value}`
            : value;
        } finally {
          structured.destroy();
          page.destroy();
        }
      })
      .join(markdown ? "\n\n---\n\n" : "\n\n");
  } finally {
    doc.destroy();
  }
}

function password(parsed: Parsed) {
  const environment = textOption(parsed, "password-env", "OPENPDF_PASSWORD");
  const value = process.env[environment];
  if (!value)
    throw new CLIError(
      `Set ${environment} to the PDF password or choose another variable with --password-env.`,
      "PASSWORD_REQUIRED",
      3,
    );
  return value;
}

async function runOCR(bytes: Uint8Array, parsed: Parsed) {
  const localRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [
    process.env.OPENPDF_OCR_BIN,
    join(localRoot, "build/native/openpdf-ocr"),
    join(process.cwd(), "build/native/openpdf-ocr"),
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      ? join(
          (process as NodeJS.Process & { resourcesPath: string }).resourcesPath,
          "native/openpdf-ocr",
        )
      : undefined,
  ].filter((value): value is string => !!value);
  let executable = "";
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executable = candidate;
      break;
    } catch {
      /* Try next local binary. */
    }
  }
  if (!executable)
    throw new CLIError(
      "Offline OCR binary not found. Run npm run build:native first.",
      "OCR_UNAVAILABLE",
      4,
    );
  const args: string[] = [];
  const range = textOption(parsed, "pages");
  if (range)
    args.push(
      "--pages",
      selectedPages(bytes, range)
        .map((page) => page + 1)
        .join(","),
    );
  const language = textOption(parsed, "language", "auto");
  args.push("--language", language);
  return new Promise<Record<string, unknown>>((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    let error = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      if (error.length < 8000) error += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(error.trim() || "Offline OCR failed."));
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(output).toString()));
      } catch {
        reject(new Error("Offline OCR returned invalid JSON."));
      }
    });
    child.stdin.end(Buffer.from(bytes));
  });
}

async function execute(parsed: Parsed) {
  const [input, output] = parsed.positionals;
  const force = flag(parsed, "force");
  if (["help", "--help", "-h"].includes(parsed.command)) {
    const requested = parsed.positionals[0] as keyof typeof commandSchemas;
    if (requested && commandSchemas[requested]) {
      process.stdout.write(`Usage: openpdf ${commandSchemas[requested]}\n`);
      return;
    }
    process.stdout.write(
      `OpenPDF Studio CLI ${VERSION}\n\nUsage: openpdf <command> [input] [output] [options]\n\nRun 'openpdf capabilities' for the machine-readable command list.\nCommon options: --pages 1,3-5  --force  --output-dir PATH\nPasswords: OPENPDF_PASSWORD=... openpdf encrypt input.pdf output.pdf\n`,
    );
    return;
  }
  if (parsed.command === "version")
    return print({ ok: true, version: VERSION });
  if (parsed.command === "capabilities")
    return print({ ok: true, ...capabilities });
  if (!(parsed.command in commandSchemas))
    throw new CLIError(`Unknown command: ${parsed.command}`);
  const inputPath = required(input, `openpdf ${parsed.command} INPUT [OUTPUT]`);
  const bytes = await readBytes(inputPath);

  if (parsed.command === "inspect") {
    const info = inspect(bytes);
    return print({
      ok: true,
      input: resolve(inputPath),
      bytes: bytes.length,
      ...info,
    });
  }
  if (parsed.command === "extract-text" || parsed.command === "to-markdown") {
    const content = extractContent(
      bytes,
      textOption(parsed, "pages"),
      parsed.command === "to-markdown",
    );
    if (!output)
      return flag(parsed, "json")
        ? print({ ok: true, command: parsed.command, content })
        : process.stdout.write(content + "\n");
    const path = await writeText(output, content, force);
    return print({
      ok: true,
      command: parsed.command,
      output: path,
      characters: content.length,
    });
  }
  if (parsed.command === "ocr") {
    const result = await runOCR(bytes, parsed);
    if (!output) return print({ ok: true, ...result });
    const value = output.toLowerCase().endsWith(".md")
      ? String(result.markdown || "")
      : JSON.stringify(result, null, 2);
    const path = await writeText(output, value, force);
    return print({
      ok: true,
      command: "ocr",
      output: path,
      engine: result.engine,
    });
  }
  if (parsed.command === "privacy-scan")
    return print({
      ok: true,
      input: resolve(inputPath),
      report: scanPrivacy(bytes),
    });
  if (parsed.command === "form-fields")
    return print({
      ok: true,
      input: resolve(inputPath),
      fields: listFormFields(bytes),
    });

  if (
    parsed.command === "render-pages" ||
    parsed.command === "extract-images" ||
    parsed.command === "split"
  ) {
    const folder = required(
      textOption(parsed, "output-dir") || output,
      `openpdf ${parsed.command} INPUT --output-dir DIRECTORY`,
    );
    let files;
    if (parsed.command === "render-pages") {
      const format = textOption(parsed, "format", "png");
      if (format !== "png" && format !== "jpg")
        throw new CLIError("--format must be png or jpg.");
      files = pdfPagesToImages(
        bytes,
        basename(inputPath),
        format,
        numberOption(parsed, "dpi", 300, 72, 600),
        numberOption(parsed, "quality", 92, 35, 100),
      );
    } else if (parsed.command === "extract-images")
      files = extractImages(bytes, basename(inputPath));
    else {
      const mode = textOption(parsed, "mode", "pages");
      if (!["pages", "size", "half", "chapter", "text"].includes(mode))
        throw new CLIError(
          "--mode must be pages, size, half, chapter or text.",
        );
      files = splitDocument(
        bytes,
        basename(inputPath),
        mode as "pages" | "size" | "half" | "chapter" | "text",
        textOption(parsed, "value", "1"),
      );
    }
    const paths = await writeFiles(folder, files, force);
    return print({
      ok: true,
      command: parsed.command,
      outputs: paths,
      count: paths.length,
    });
  }

  if (parsed.command === "images-to-pdf") {
    const imagePaths = parsed.positionals.slice(0, -1);
    const target = parsed.positionals.at(-1);
    if (imagePaths.length < 1 || !target)
      throw new CLIError("Usage: openpdf images-to-pdf IMAGE... OUTPUT.pdf");
    const images = await Promise.all(
      imagePaths.map(async (path) => ({
        name: basename(path),
        bytes: await readBytes(path),
      })),
    );
    const result = imagesToPDF(images);
    const path = await writeAtomic(target, result, force);
    return print({
      ok: true,
      command: parsed.command,
      output: path,
      pages: images.length,
    });
  }

  const target = required(output, `openpdf ${parsed.command} INPUT OUTPUT`);
  let result: Uint8Array;
  if (parsed.command === "compress") result = optimizePDF(bytes).bytes;
  else if (parsed.command === "encrypt")
    result = encryptPDF(bytes, password(parsed));
  else if (parsed.command === "unlock")
    result = unlockPDF(bytes, password(parsed)).bytes;
  else if (parsed.command === "flatten") result = flattenPDF(bytes).bytes;
  else if (parsed.command === "privacy-clean")
    result = cleanPrivacy(bytes).bytes;
  else if (parsed.command === "crop") {
    const size = textOption(parsed, "size", "keep");
    if (!["keep", "a4", "letter"].includes(size))
      throw new CLIError("--size must be keep, a4 or letter.");
    result = cropResizePDF(
      bytes,
      numberOption(parsed, "margin", 0, 0, 40),
      size as "keep" | "a4" | "letter",
    ).bytes;
  } else if (parsed.command === "extract-pages") {
    const range = required(
      textOption(parsed, "pages"),
      "openpdf extract-pages INPUT OUTPUT --pages 1,3-5",
    );
    result = extract(bytes, selectedPages(bytes, range));
  } else if (parsed.command === "metadata") {
    result = updateMetadata(bytes, {
      title: textOption(parsed, "title", inspect(bytes).title),
      author: textOption(parsed, "author", inspect(bytes).author),
      subject: textOption(parsed, "subject", inspect(bytes).subject),
      keywords: textOption(parsed, "keywords"),
      creator: textOption(parsed, "creator", inspect(bytes).creator),
    }).bytes;
  } else if (parsed.command === "bates") {
    const position = textOption(parsed, "position", "bottom-right");
    if (
      !["top-left", "top-right", "bottom-left", "bottom-right"].includes(
        position,
      )
    )
      throw new CLIError("Invalid --position.");
    result = addBatesNumbers(bytes, {
      prefix: textOption(parsed, "prefix", "BATES-"),
      suffix: textOption(parsed, "suffix"),
      start: numberOption(parsed, "start", 1, 0, Number.MAX_SAFE_INTEGER),
      digits: numberOption(parsed, "digits", 6, 1, 12),
      position: position as
        "top-left" | "top-right" | "bottom-left" | "bottom-right",
    }).bytes;
  } else if (parsed.command === "mirror") {
    const direction = textOption(parsed, "direction", "horizontal");
    if (!["horizontal", "vertical", "both"].includes(direction))
      throw new CLIError("--direction must be horizontal, vertical or both.");
    result = mirrorPages(
      bytes,
      direction as "horizontal" | "vertical" | "both",
    ).bytes;
  } else if (parsed.command === "nup") {
    const perSheet = numberOption(parsed, "pages-per-sheet", 4, 2, 9);
    if (![2, 4, 6, 9].includes(perSheet))
      throw new CLIError("--pages-per-sheet must be 2, 4, 6 or 9.");
    result = pagesPerSheet(bytes, perSheet as 2 | 4 | 6 | 9).bytes;
  } else if (parsed.command === "mix") {
    const second = required(
      textOption(parsed, "with"),
      "openpdf mix INPUT OUTPUT --with SECOND.pdf",
    );
    result = alternateMix(
      bytes,
      await readBytes(second),
      !flag(parsed, "second-first"),
    ).bytes;
  } else if (parsed.command === "fill-form") {
    const valuesPath = required(
      textOption(parsed, "values"),
      "openpdf fill-form INPUT OUTPUT --values values.json",
    );
    let values: unknown;
    try {
      values = JSON.parse(await readFile(valuesPath, "utf8"));
    } catch {
      throw new CLIError(
        "Form values must be a readable JSON object.",
        "INPUT",
        3,
      );
    }
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new CLIError("Form values must be a JSON object.", "INPUT", 3);
    if (Object.values(values).some((value) => typeof value !== "string"))
      throw new CLIError("Every form value must be a string.", "INPUT", 3);
    result = fillForm(bytes, values as Record<string, string>).bytes;
  } else throw new CLIError(`Unknown command: ${parsed.command}`);

  const path = await writeAtomic(target, result, force);
  const pageCount =
    parsed.command === "encrypt"
      ? inspect(bytes).pages.length
      : inspect(result).pages.length;
  return print({
    ok: true,
    command: parsed.command,
    input: resolve(inputPath),
    output: path,
    bytes: result.length,
    pages: pageCount,
  });
}

execute(parse(process.argv.slice(2))).catch((cause) => {
  const error =
    cause instanceof Error ? cause : new Error("Unknown CLI failure.");
  const code = cause instanceof CLIError ? cause.code : "PROCESSING_FAILED";
  const exitCode = cause instanceof CLIError ? cause.exitCode : 4;
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: { code, message: error.message } })}\n`,
  );
  process.exitCode = exitCode;
});
