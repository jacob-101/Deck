import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { createSample, inspect } from "../src/core/pdf";

const execute = promisify(execFile);
const cli = resolve("dist-cli/openpdf.mjs");
let folder: string;
let input: string;

async function run(args: string[], env?: NodeJS.ProcessEnv) {
  return execute(process.execPath, [cli, ...args], {
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
  });
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "openpdf-cli-test-"));
  input = join(folder, "Field Notes.pdf");
  await writeFile(input, createSample());
});

describe("agent-friendly CLI", () => {
  it("publishes machine-readable capabilities and document inspection", async () => {
    const capabilities = JSON.parse((await run(["capabilities"])).stdout);
    expect(capabilities).toMatchObject({
      ok: true,
      name: "openpdf",
      offline: true,
    });
    expect(capabilities.commands).toContain("ocr");
    expect(capabilities.schemas["render-pages"]).toContain("--dpi 72..600");
    const report = JSON.parse((await run(["inspect", input])).stdout);
    expect(report.ok).toBe(true);
    expect(report.pages).toHaveLength(4);
    expect(report.bytes).toBeGreaterThan(1000);
  });

  it("extracts plain text and Markdown without UI automation", async () => {
    const text = (await run(["extract-text", input, "--pages", "1"])).stdout;
    expect(text).toContain("A little less friction");
    const structured = JSON.parse(
      (await run(["extract-text", input, "--pages", "1", "--json"])).stdout,
    );
    expect(structured).toMatchObject({
      ok: true,
      command: "extract-text",
    });
    expect(structured.content).toContain("A little less friction");
    const markdown = join(folder, "notes.md");
    const result = JSON.parse(
      (await run(["to-markdown", input, markdown])).stdout,
    );
    expect(result).toMatchObject({ ok: true, command: "to-markdown" });
    expect(await readFile(markdown, "utf8")).toContain("<!-- Page 4 -->");
  });

  it("writes transformations atomically and refuses accidental overwrites", async () => {
    const output = join(folder, "optimized.pdf");
    const result = JSON.parse((await run(["compress", input, output])).stdout);
    expect(result).toMatchObject({ ok: true, command: "compress", pages: 4 });
    expect(inspect(new Uint8Array(await readFile(output))).pages).toHaveLength(
      4,
    );
    await expect(run(["compress", input, output])).rejects.toMatchObject({
      code: 5,
      stderr: expect.stringContaining("OUTPUT_EXISTS"),
    });
    await expect(
      run(["compress", input, "--force", output]),
    ).resolves.toBeTruthy();
  });

  it("protects PDFs through an environment password and unlocks them", async () => {
    const locked = join(folder, "protected.pdf");
    const unlocked = join(folder, "unlocked.pdf");
    await run(["encrypt", input, locked], {
      OPENPDF_PASSWORD: "agent-safe-pass",
    });
    await run(["unlock", locked, unlocked], {
      OPENPDF_PASSWORD: "agent-safe-pass",
    });
    expect(
      inspect(new Uint8Array(await readFile(unlocked))).pages,
    ).toHaveLength(4);
  });

  it("scans privacy and exports deterministic page images", async () => {
    const privacy = JSON.parse((await run(["privacy-scan", input])).stdout);
    expect(privacy).toMatchObject({
      ok: true,
      report: { externalLinks: 0, embeddedFiles: [] },
    });
    const output = join(folder, "pages");
    const rendered = JSON.parse(
      (
        await run([
          "render-pages",
          input,
          "--output-dir",
          output,
          "--dpi",
          "72",
        ])
      ).stdout,
    );
    expect(rendered.count).toBe(4);
    expect(await readdir(output)).toHaveLength(4);
    expect((await readFile(rendered.outputs[0])).subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });
});
