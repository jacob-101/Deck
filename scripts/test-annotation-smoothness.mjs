import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
const temp = await mkdtemp(join(tmpdir(), "openpdf-annotation-"));
const output = resolve("test-results/annotation-smoothness");
await mkdir(output, { recursive: true });
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const child = app.process();
const page = await app.firstWindow();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const ready = () =>
  page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
const idle = () => page.locator(".busy-indicator").waitFor({ state: "hidden" });
try {
  await page.getByRole("button", { name: /Take a look around/ }).click();
  await ready();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page.getByRole("button", { name: "Text box", exact: true }).click();
  const box = await page.locator(".page-stage .pdf-page").boundingBox();
  await page.mouse.click(box.x + 120, box.y + 200);
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Annotation text").fill("Smooth annotation");
  await modal.getByLabel("Font size").selectOption("24");
  await modal
    .getByRole("button", { name: "Cream background", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "Add to document", exact: true })
    .click();
  await idle();
  await ready();
  const annotation = page.getByRole("button", {
    name: "FreeText annotation 1",
    exact: true,
  });
  await annotation.waitFor();
  const start = await annotation.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 40,
    start.y + start.height / 2 + 30,
    { steps: 8 },
  );
  await page.locator(".annotation-drag-preview").waitFor();
  assert.equal(
    await page.locator(".annotation-drag-preview").evaluate((canvas) => {
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, i) => i % 4 === 3 && value > 0);
    }),
    true,
    "Drag preview must contain the actual annotation artwork",
  );
  await page.screenshot({ path: join(output, "dragging.png") });
  await page.mouse.up();
  await idle();
  await ready();
  await page.locator(".annotation-drag-preview").waitFor({ state: "hidden" });
  const moved = await annotation.boundingBox();
  assert.ok(Math.abs(moved.x - start.x - 40) < 3);
  assert.ok(Math.abs(moved.y - start.y - 30) < 3);
  console.log(
    "Actual annotation artwork follows dragging and persists at release",
  );
  const resize = page.getByLabel("SE resize handle for FreeText annotation 1");
  const corner = await resize.boundingBox();
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    corner.x + corner.width / 2 + 25,
    corner.y + corner.height / 2 + 15,
    { steps: 8 },
  );
  await page.locator(".annotation-drag-preview").waitFor();
  await page.mouse.up();
  await idle();
  await ready();
  await page.locator(".annotation-drag-preview").waitFor({ state: "hidden" });
  const resized = await annotation.boundingBox();
  assert.ok(resized.width > moved.width + 20);
  await page.mouse.move(
    resized.x + resized.width / 2,
    resized.y + resized.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resized.x + resized.width / 2 + 12,
    resized.y + resized.height / 2 + 10,
    { steps: 5 },
  );
  await page.locator(".annotation-drag-preview").waitFor();
  await annotation.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.locator(".annotation-drag-preview").waitFor({ state: "hidden" });
  const cancelled = await annotation.boundingBox();
  assert.ok(Math.abs(cancelled.x - resized.x) < 1);
  assert.ok(Math.abs(cancelled.y - resized.y) < 1);
  console.log("Actual artwork resize and cancelled drag restore verified");
  await annotation.dblclick();
  const editor = page.getByRole("dialog", {
    name: "Edit annotation",
    exact: true,
  });
  await editor.getByLabel("Annotation contents").fill("Live text preview");
  assert.equal(
    await editor.getByLabel("Annotation preview").textContent(),
    "Live text preview",
  );
  await editor.getByLabel("Annotation contents").fill("Smooth annotation");
  assert.equal(
    await editor
      .getByRole("button", { name: "Update annotation", exact: true })
      .isEnabled(),
    false,
  );
  await editor.getByRole("button", { name: "Close annotation editor" }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  // Hold the PDF worker response briefly to expose the preview-to-PDF handoff.
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      setTimeout(() => post.apply(this, args), 300);
    };
  });
  await page.mouse.move(box.x + 100, box.y + 450);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 480, { steps: 20 });
  await page.mouse.up();
  assert.ok(
    await page.locator(".draw-layer polyline").count(),
    "Stroke preview must survive until the new PDF canvas arrives",
  );
  await idle();
  await ready();
  await page.locator(".draw-layer polyline").waitFor({ state: "hidden" });
  for (const tool of ["Highlight", "Underline"]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    const text = page
      .locator(".page-stage .textLayer span")
      .filter({ hasText: "A little less friction." })
      .first();
    const span = await text.boundingBox();
    assert.ok(span);
    await page.mouse.move(span.x + 1, span.y + span.height / 2);
    await page.mouse.down();
    await page.mouse.move(span.x + span.width - 1, span.y + span.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    const preview = page.locator(
      tool === "Highlight" ? ".draw-layer polygon" : ".draw-layer line",
    );
    assert.ok(
      await preview.count(),
      `${tool} preview must survive while the PDF edit is pending`,
    );
    await idle();
    await ready();
    await preview.waitFor({ state: "hidden" });
  }
  console.log(
    "Highlight and underline previews remain visible through delayed PDF updates",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Live text editing, reverted text, and uninterrupted ink commit verified",
  );
} finally {
  if (child.exitCode === null)
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
