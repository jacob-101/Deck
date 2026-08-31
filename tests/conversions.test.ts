import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as mupdf from "mupdf";
import { createDocx } from "../electron/conversions";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

describe("native document conversions", () => {
  it("replaces an existing DOCX without retaining stale page media", async () => {
    const folder = await mkdtemp(join(tmpdir(), "openpdf-docx-test-"));
    folders.push(folder);
    const output = join(folder, "result.docx");
    const pixmap = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 4, 4],
      false,
    );
    pixmap.clear(220);
    const image = new Uint8Array(pixmap.asPNG()).slice();
    pixmap.destroy();
    await createDocx(
      [
        { image, width: 612, height: 792 },
        { image, width: 612, height: 792 },
      ],
      output,
      "layout",
    );
    await createDocx([{ image, width: 612, height: 792 }], output, "layout");
    const archive = (await readFile(output)).toString("latin1");
    expect(archive).toContain("word/media/page-1.png");
    expect(archive).not.toContain("word/media/page-2.png");
  });
});
