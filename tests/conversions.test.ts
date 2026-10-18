import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as mupdf from "mupdf";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createPptx, createDocx } from "../electron/conversions";

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

describe("PowerPoint export", () => {
  it("creates ordered image slides and replaces previous exports", async () => {
    const folder = await mkdtemp(join(tmpdir(), "openpdf-pptx-test-"));
    folders.push(folder);
    const output = join(folder, "result.pptx");
    const pixmap = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 4, 4],
      false,
    );
    pixmap.clear(220);
    const image = new Uint8Array(pixmap.asPNG()).slice();
    pixmap.destroy();
    const pages = [
      { image, width: 720, height: 405 },
      { image, width: 405, height: 720 },
    ];
    await createPptx(pages, output);
    const unzip = (part: string) =>
      execFileSync("/usr/bin/unzip", ["-p", output, part], {
        encoding: "utf8",
      });
    expect(unzip("ppt/presentation.xml")).toContain(
      'cx="9144000" cy="5143500"',
    );
    expect(unzip("ppt/slides/slide2.xml")).toContain("<p:pic>");
    const soffice = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
    if (process.env.OPENPDF_TEST_OFFICE === "1" && existsSync(soffice)) {
      execFileSync(
        soffice,
        [
          `-env:UserInstallation=${pathToFileURL(join(folder, "profile")).href}`,
          "--headless",
          "--convert-to",
          "pdf:impress_pdf_Export",
          "--outdir",
          folder,
          output,
        ],
        { timeout: 60000 },
      );
      const pdf = mupdf.Document.openDocument(
        new Uint8Array(await readFile(join(folder, "result.pdf"))),
        "application/pdf",
      );
      try {
        expect(pdf.countPages()).toBe(2);
        const page = pdf.loadPage(0);
        try {
          const bounds = page.getBounds();
          expect(bounds[2]).toBeCloseTo(720, 1);
          expect(bounds[3]).toBeCloseTo(405, 1);
          const rendered = page.toPixmap(
            mupdf.Matrix.scale(0.1, 0.1),
            mupdf.ColorSpace.DeviceRGB,
            false,
            true,
          );
          try {
            expect(rendered.getPixels()[0]).toBeLessThan(240);
          } finally {
            rendered.destroy();
          }
        } finally {
          page.destroy();
        }
      } finally {
        pdf.destroy();
      }
    }
    const extracted = execFileSync("/usr/bin/unzip", [
      "-p",
      output,
      "ppt/media/image-1-1.png",
    ]);
    expect(extracted).toEqual(Buffer.from(image));
    await createPptx(pages.slice(0, 1), output);
    const entries = execFileSync("/usr/bin/unzip", ["-Z1", output], {
      encoding: "utf8",
    });
    expect(entries).not.toContain("ppt/slides/slide2.xml");
    await expect(
      createPptx([{ ...pages[0], width: NaN }], output),
    ).rejects.toThrow("dimensions");
    expect(unzip("ppt/slides/slide1.xml")).toContain("<p:pic>");
  }, 90000);
  it("rejects empty decks and invalid images", async () => {
    await expect(createPptx([], "/unused")).rejects.toThrow("1–100");
    await expect(
      createPptx(
        [{ width: 720, height: 405, image: new Uint8Array(8) }],
        "/unused",
      ),
    ).rejects.toThrow("image");
  });
});
