import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicSave, readPDF, stamp, validateBytes } from "../electron/files";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
describe("authorized filesystem operations", () => {
  it("atomically writes and refuses to overwrite an externally modified file", async () => {
    const folder = await mkdtemp(join(tmpdir(), "openpdf-test-"));
    folders.push(folder);
    const path = join(folder, "document.pdf");
    const first = new TextEncoder().encode("%PDF-1.7\nfirst");
    const second = new TextEncoder().encode("%PDF-1.7\nsecond");
    await atomicSave(path, first, null);
    const opened = await readPDF(path);
    expect(opened.bytes).toEqual(first);
    await writeFile(path, "%PDF-1.7\nexternally changed");
    await expect(atomicSave(path, second, opened.stamp)).rejects.toThrow(
      "changed on disk",
    );
    expect((await readFile(path)).toString()).toContain("externally changed");
    await atomicSave(path, second, await stamp(path));
    expect((await readPDF(path)).bytes).toEqual(second);
    expect(await readdir(folder)).toEqual(["document.pdf"]);
  });
  it("rejects non-PDF payloads and oversized bytes", () => {
    expect(() => validateBytes("not bytes")).toThrow();
    expect(() => validateBytes(new Uint8Array(60 * 1024 * 1024))).toThrow();
    expect(() =>
      validateBytes(new TextEncoder().encode("<html>bad</html>")),
    ).toThrow("not a PDF");
  });
});
