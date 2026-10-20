import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const temp = await mkdtemp(join(tmpdir(), "openpdf-tabs-"));
const output = resolve("test-results/tabs");
await mkdir(output, { recursive: true });
console.log("Launching Electron for document tab checks");
const app = await electron.launch({
  args: ["."],
  timeout: 20000,
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const child = app.process();
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const ready = () =>
  page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
const idle = () => page.locator(".busy-indicator").waitFor({ state: "hidden" });
const selectTab = (name) => page.getByRole("tab", { name, exact: true });
const menu = (command) =>
  app.evaluate(({ Menu }, command) => {
    const file = Menu.getApplicationMenu().items.find(
      (item) => item.label === "File",
    );
    file.submenu.items.find((item) => item.label === command).click();
  }, command);

try {
  await page.getByRole("button", { name: /Take a look around/ }).click();
  await ready();
  const path = join(temp, "One.pdf");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, path);
  await menu("Save As…");
  await idle();
  await selectTab("One.pdf").waitFor();
  assert.equal((await readFile(path)).subarray(0, 4).toString(), "%PDF");
  await page
    .getByRole("button", { name: "Search document", exact: true })
    .click();
  await page.getByPlaceholder("Search this PDF").fill("document");
  await page.waitForFunction(
    () => document.querySelectorAll(".search-result").length === 4,
  );
  await page.locator(".search-result").nth(2).click();
  await ready();
  await page.getByLabel("Page fit", { exact: true }).selectOption("width");
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await page.getByRole("button", { name: /Take a look around/ }).click();
  await ready();
  assert.equal(await page.getByRole("tab").count(), 3);
  await selectTab("One.pdf").click();
  await ready();
  assert.equal(
    await page.getByRole("spinbutton", { name: "Page number" }).inputValue(),
    "3",
  );
  assert.equal(
    await page.getByPlaceholder("Search this PDF").inputValue(),
    "document",
  );
  assert.equal(
    await page.getByLabel("Page fit", { exact: true }).inputValue(),
    "width",
  );
  console.log("Separate PDFs and restored page, zoom, search verified");

  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await idle();
  await selectTab("One.pdf, unsaved changes").waitFor();
  await selectTab("Field Notes.pdf").click();
  await ready();
  assert.equal(
    await page.getByRole("button", { name: "Undo", exact: true }).isEnabled(),
    false,
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 2,
      checkboxChecked: false,
    });
  });
  await page
    .getByRole("button", { name: "Close One.pdf", exact: true })
    .click();
  await idle();
  assert.equal(await selectTab("One.pdf, unsaved changes").count(), 1);
  assert.equal(
    await selectTab("Field Notes.pdf").getAttribute("aria-selected"),
    "true",
  );
  console.log("Independent undo and cancelled background close verified");

  await page.screenshot({ path: join(output, "document-tabs.png") });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
  await page
    .getByRole("button", { name: "Close One.pdf", exact: true })
    .click();
  await idle();
  assert.equal(await selectTab("One.pdf").count(), 0);
  assert.equal(await selectTab("One.pdf, unsaved changes").count(), 0);
  assert.equal((await readFile(path)).subarray(0, 4).toString(), "%PDF");
  assert.equal(
    await selectTab("Field Notes.pdf").getAttribute("aria-selected"),
    "true",
  );

  await menu("New Tab");
  await selectTab("Start page").waitFor({ state: "visible" });
  assert.equal(
    await selectTab("Start page").getAttribute("aria-selected"),
    "true",
  );
  await selectTab("Field Notes.pdf").click();
  await ready();
  await page
    .getByRole("button", { name: "Close Field Notes.pdf", exact: true })
    .click();
  await idle();
  await page
    .getByRole("heading", { name: "Welcome back" })
    .waitFor();
  assert.equal(await page.getByRole("tab").count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    "Background save, native New Tab, final close, and renderer errors verified",
  );

  // Window shutdown must include dirty background PDFs, even on the start page.
  for (let index = 0; index < 2; index++) {
    await page.getByRole("button", { name: /Take a look around/ }).click();
    await ready();
    if (index)
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .click();
    await page.getByRole("button", { name: "Organize", exact: true }).click();
    await page.getByRole("button", { name: "Rotate", exact: true }).click();
    await idle();
    await page.getByRole("button", { name: "New tab", exact: true }).click();
  }
  const prompted = await app.evaluate(({ dialog, BrowserWindow }) => {
    let count = 0;
    dialog.showMessageBox = async () => {
      count++;
      return { response: 2, checkboxChecked: false };
    };
    BrowserWindow.getAllWindows()[0].close();
    return count;
  });
  assert.equal(prompted, 1, "Dirty background tabs must protect window close");
  assert.equal(page.isClosed(), false);
  await app.evaluate(({ dialog }, temp) => {
    let count = 0;
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: `${temp}/Unsaved-${++count}.pdf`,
    });
  }, temp);
  assert.deepEqual(errors, []);
  const closed = app.waitForEvent("close", { timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  const firstSaved = await readFile(join(temp, "Unsaved-1.pdf"));
  const secondSaved = await readFile(join(temp, "Unsaved-2.pdf"));
  assert.equal(firstSaved.subarray(0, 4).toString(), "%PDF");
  assert.equal(secondSaved.subarray(0, 4).toString(), "%PDF");
  assert.notDeepEqual(firstSaved, secondSaved);
  console.log(
    "Window close cancellation and saving all dirty tabs from the start page verified",
  );
} finally {
  if (child.exitCode === null)
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
