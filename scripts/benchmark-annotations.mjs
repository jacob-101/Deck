import { _electron as electron } from "playwright";
import * as mupdf from "mupdf";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const temp = await mkdtemp(join(tmpdir(), "openpdf-perf-"));
const pdfPath = join(temp, "annotation-stress.pdf");
const doc = new mupdf.PDFDocument();
const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
const vectors = Array.from(
  { length: 6000 },
  (_, i) =>
    `${(i % 31) / 31} 0.7 0.6 rg ${(i * 17) % 600} ${(i * 11) % 780} 3 3 re f`,
).join("\n");
for (let i = 0; i < 40; i++)
  doc.insertPage(
    -1,
    doc.addPage(
      [0, 0, 612, 792],
      0,
      { Font: { F1: font } },
      `${vectors}\nBT /F1 18 Tf 50 730 Td (Annotation stress document - ${i + 1}) Tj ET`,
    ),
  );
const first = doc.loadPage(0);
for (let i = 0; i < 301; i++) {
  const a = first.createAnnotation("FreeText");
  const x = i === 300 ? 80 : 20 + (i % 15) * 38,
    y = i === 300 ? 500 : 100 + Math.floor(i / 15) * 16;
  a.setRect([x, y, x + (i === 300 ? 180 : 35), y + 20]);
  a.setDefaultAppearance("Helv", i === 300 ? 14 : 7, [0, 0, 0]);
  a.setBorderWidth(0);
  a.setFlags(mupdf.PDFAnnotation.IS_PRINT);
  a.setContents(i === 300 ? "Drag this annotation" : `Note ${i}`);
  a.update();
  a.destroy();
}
await writeFile(pdfPath, doc.saveToBuffer("compress").asUint8Array());
doc.destroy();
const executablePath = process.env.OPENPDF_BENCH_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : { args: ["."] }),
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const child = app.process();
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("CONSOLE", message.text());
  });
  await page
    .getByRole("heading", { name: "Welcome back" })
    .waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, pdfPath);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("menu:command", "open"),
  );
  await page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  const records = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    const annotation = page.getByRole("button", {
      name: "FreeText annotation 301",
      exact: true,
    });
    const box = await annotation.boundingBox();
    await page.evaluate(() => {
      const m = (window.__annotationMeasure = {
        frames: [],
        allocations: [],
        start: 0,
        preview: 0,
        up: 0,
        commit: 0,
        last: performance.now(),
        running: true,
      });
      const tick = (now) => {
        if (!m.running) return;
        m.frames.push(now - m.last);
        m.last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      document.addEventListener(
        "pointerdown",
        () => {
          m.start = performance.now();
        },
        { once: true, capture: true },
      );
      document.addEventListener(
        "pointerup",
        () => {
          m.up = performance.now();
        },
        { once: true, capture: true },
      );
      m.observer = new MutationObserver(() => {
        if (!m.preview && document.querySelector(".annotation-drag-preview"))
          m.preview = performance.now();
        if (
          m.up &&
          document.querySelector('.page-stage .pdf-page[data-ready="true"]')
        )
          m.commit = performance.now();
      });
      m.observer.observe(document.querySelector(".page-stage"), {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-ready"],
      });
      if (!window.__canvasHeight) {
        window.__canvasHeight = Object.getOwnPropertyDescriptor(
          HTMLCanvasElement.prototype,
          "height",
        );
        Object.defineProperty(HTMLCanvasElement.prototype, "height", {
          ...window.__canvasHeight,
          set(value) {
            window.__canvasHeight.set.call(this, value);
            window.__annotationMeasure?.allocations.push(this.width * value);
          },
        });
      }
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 35,
      box.y + box.height / 2 + 15,
      { steps: 80 },
    );
    await page.locator(".annotation-drag-preview").waitFor();
    await page.mouse.up();
    await page.locator(".busy-indicator").waitFor({ state: "hidden" });
    await page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
    await page.locator(".annotation-drag-preview").waitFor({ state: "hidden" });
    records.push(
      await page.evaluate(() => {
        const m = window.__annotationMeasure;
        m.running = false;
        m.observer.disconnect();
        return {
          previewMs: Math.round(m.preview - m.start),
          commitMs: Math.round(m.commit - m.up),
          slowFrames: m.frames.filter((n) => n > 32).length,
          maxFrameMs: Math.round(Math.max(...m.frames)),
          allocatedPixels: m.allocations.reduce((a, b) => a + b, 0),
          maxCanvasPixels: Math.max(...m.allocations),
        };
      }),
    );
  }
  const label = process.env.OPENPDF_BENCH_LABEL || "current";
  const output = resolve("test-results/annotation-benchmark");
  await mkdir(output, { recursive: true });
  const result = {
    label,
    fixture: { pages: 40, annotations: 301, vectorsPerPage: 6000 },
    records,
  };
  await writeFile(
    join(output, `${label}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const pages = app.windows();
  if (pages[0])
    console.log((await pages[0].locator("body").innerText()).slice(-2500));
  throw error;
} finally {
  if (child.exitCode === null)
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
