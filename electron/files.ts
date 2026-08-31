import {
  readFile,
  stat,
  writeFile,
  rename,
  unlink,
  mkdir,
} from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_FILE_SIZE } from "../src/types";

export function validateBytes(value: unknown): asserts value is Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength < 5 ||
    value.byteLength > MAX_FILE_SIZE
  )
    throw new Error("Choose a PDF smaller than 50 MB.");
  if (new TextDecoder().decode(value.subarray(0, 5)) !== "%PDF-")
    throw new Error("This file is not a PDF.");
}
export async function readPDF(path: string) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_FILE_SIZE)
    throw new Error("Choose a PDF smaller than 50 MB.");
  const bytes = new Uint8Array(await readFile(path));
  validateBytes(bytes);
  return { bytes, stamp: `${info.mtimeMs}:${info.size}` };
}
export async function stamp(path: string) {
  try {
    const info = await stat(path);
    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return null;
  }
}
export async function atomicSave(
  path: string,
  bytes: Uint8Array,
  expected?: string | null,
  validatePDF = true,
) {
  if (validatePDF) validateBytes(bytes);
  if (expected !== undefined && (await stamp(path)) !== expected)
    throw new Error(
      "This file changed on disk. Use Save As to keep both versions.",
    );
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try {
    mode = (await stat(path)).mode & 0o777;
  } catch {
    /* New file. */
  }
  try {
    await writeFile(temp, bytes, { flag: "wx", mode });
    if (expected !== undefined && (await stamp(path)) !== expected)
      throw new Error(
        "This file changed on disk. Use Save As to keep both versions.",
      );
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function writeJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
}
export async function writeText(path: string, value: string) {
  if (typeof value !== "string" || value.length > 10 * 1024 * 1024)
    throw new Error("Markdown export is limited to 10 MB.");
  await writeFile(path, value, { flag: "w", mode: 0o600 });
}
