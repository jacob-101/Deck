import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const temp = await mkdtemp(join(tmpdir(), "openpdf-ui-"));
const output = resolve("test-results/workspace-ui");
await mkdir(output, { recursive: true });
const app = await electron.launch({
  ...(process.env.OPENPDF_TEST_EXECUTABLE
    ? { executablePath: process.env.OPENPDF_TEST_EXECUTABLE }
    : { args: ["."] }),
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const child = app.process();
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const ready = () =>
    page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
  const screenshot = async (name) => {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await ready();
    await page
      .locator(".page-stage .pdf-page > canvas")
      .first()
      .evaluate((canvas) => canvas.getContext("2d").getImageData(0, 0, 1, 1));
    return page.screenshot({
      path: join(output, name),
      animations: "disabled",
    });
  };
  for (const name of [
    "whiteboard-answers — reviewed and signed.pdf",
    "Project notes — final revision.pdf",
    "Reference material — working copy.pdf",
  ]) {
    if ((await page.getByRole("tab").count()) > 1)
      await page.getByRole("button", { name: "New tab", exact: true }).click();
    await page.getByRole("button", { name: /Take a look around/ }).click();
    await ready();
    await app.evaluate(
      ({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      },
      join(temp, name),
    );
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()
        .items.find((item) => item.label === "File")
        .submenu.items.find((item) => item.label === "Save As…")
        .click(),
    );
    await page.getByRole("tab", { name, exact: true }).waitFor();
  }
  assert.equal(await page.getByRole("tab").count(), 4);
  assert.ok(
    (await page.getByRole("main", { name: "PDF workspace" }).boundingBox()).y <=
      120,
    "Reading chrome must leave more vertical space for the PDF",
  );
  await screenshot("reader-light.png");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(980, 700),
  );
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Highlight", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  for (const label of [
    "New tab",
    "Settings",
    "Open",
    "PDF Tools",
    "Read",
    "Annotate",
    "Organize",
    "Save",
    "Select",
    "Highlight",
    "Underline",
    "Strike through",
    "Draw",
    "Rectangle",
    "Ellipse",
    "Arrow",
    "Text box",
    "Sticky note",
    "Sign",
  ]) {
    const box = await page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.x + box.width <= 980 &&
        box.y >= 0 &&
        box.y + box.height <= 700,
      `${label} must remain accessible at the minimum window size`,
    );
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.waitForFunction(() => {
    const active = document
      .querySelector('[role="tab"][aria-selected="true"]')
      .closest(".document-tab")
      .getBoundingClientRect();
    const strip = document
      .querySelector(".document-tab-list")
      .getBoundingClientRect();
    return active.left >= strip.left - 1 && active.right <= strip.right + 1;
  });
  await screenshot("annotate-minimum-light.png");
  const beforeTheme = await page
    .locator(".page-stage .pdf-page > canvas")
    .first()
    .evaluate((canvas) => canvas.toDataURL());
  await page
    .getByRole("button", { name: "Use dark appearance", exact: true })
    .click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await screenshot("annotate-minimum-dark.png");
  assert.equal(
    await page
      .locator(".page-stage .pdf-page > canvas")
      .first()
      .evaluate((canvas) => canvas.toDataURL()),
    beforeTheme,
    "Changing the UI theme must preserve the PDF artwork",
  );
  await page.getByRole("tab", { name: "Start page", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome back" })
    .waitFor();
  await page
    .getByRole("tab", {
      name: "whiteboard-answers — reviewed and signed.pdf",
      exact: true,
    })
    .click();
  await ready();
  assert.equal(await page.getByRole("tab").count(), 4);
  assert.deepEqual(errors, []);
  console.log(
    "Light/dark minimum-window layout, long filenames, grouped tools, and tab navigation verified",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  if (child.exitCode === null)
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
