import { _electron as electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import * as mupdf from "mupdf";

const output = resolve("test-results");
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "openpdf-desktop-"));
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") console.log("RENDERER:", message.text());
});
const steps = [];
const ready = () =>
  expect(page.locator(".page-stage .pdf-page")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
const noBusy = () =>
  expect(page.locator(".busy-indicator")).toHaveCount(0, { timeout: 30000 });
try {
  await expect(
    page.getByRole("heading", { name: "Your PDFs. On your terms." }),
  ).toBeVisible();
  await page.screenshot({ path: join(output, "welcome.png") });
  steps.push("Desktop welcome screen");
  const security = await app.evaluate(({ BrowserWindow }) => {
    const prefs =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: prefs.sandbox,
      contextIsolation: prefs.contextIsolation,
      nodeIntegration: prefs.nodeIntegration,
    };
  });
  expect(security).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
  steps.push("Sandbox and narrow preload verified");
  await page.getByRole("button", { name: /Take a look around/ }).click();
  await ready();
  await noBusy();
  await expect(page.locator(".textLayer").last()).toContainText(
    "A little less friction.",
  );
  await page.screenshot({ path: join(output, "reader.png") });
  steps.push("Worker generated and rendered actual PDF with selectable text");
  await page
    .getByRole("button", { name: "Search document", exact: true })
    .click();
  await page.getByPlaceholder("Search this PDF").fill("document");
  await expect(page.locator(".search-result")).toHaveCount(4);
  await page.locator(".search-result").nth(2).click();
  await ready();
  await expect(
    page.getByRole("spinbutton", { name: "Page number" }),
  ).toHaveValue("3");
  steps.push("Full document search and result navigation");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Go to page 1", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  let box = await page.locator(".page-stage .pdf-page").boundingBox();
  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.3);
  await page
    .getByRole("textbox", { name: "Annotation text" })
    .fill("Verified: this note stays inside the saved PDF.");
  await page.getByRole("button", { name: "Add to document" }).click();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toContainText(
    "Verified: this note stays inside the saved PDF.",
  );
  steps.push("Note created from page coordinates");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  box = await page.locator(".page-stage .pdf-page").boundingBox();
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 105, { steps: 8 });
  await page.mouse.up();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(2);
  steps.push("Drawing and undo/redo");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const title = page
    .locator(".page-stage .textLayer span")
    .filter({ hasText: "A little less friction." });
  const titleBox = await title.boundingBox();
  await page.mouse.move(titleBox.x + 1, titleBox.y + titleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    titleBox.x + titleBox.width - 1,
    titleBox.y + titleBox.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(3);
  await expect(page.locator(".note-card").last()).toContainText("Highlight");
  steps.push("Real text selection creates a persistent highlight");
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await noBusy();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await noBusy();
  await expect(page.locator(".page-card")).toHaveCount(5);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".page-card")).toHaveCount(5);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await noBusy();
  await expect(page.locator(".page-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Move page 2 right" }).click();
  await noBusy();
  await expect(page.locator(".page-card")).toHaveCount(4);
  await expect(page.locator(".page-card .pdf-page").first()).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.screenshot({ path: join(output, "organizer.png") });
  steps.push("Rotate, duplicate, delete confirmation and reorder");
  const saved = join(temp, "saved.pdf");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, saved);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await noBusy();
  await expect(page.locator(".status-left")).toContainText("All changes saved");
  const bytes = new Uint8Array(await readFile(saved));
  const doc = new mupdf.PDFDocument(bytes);
  expect(doc.countPages()).toBe(4);
  const first = doc.loadPage(0);
  const annots = first.getAnnotations();
  expect(annots.map((annotation) => annotation.getContents())).toContain(
    "Verified: this note stays inside the saved PDF.",
  );
  annots.forEach((annotation) => annotation.destroy());
  first.destroy();
  doc.destroy();
  steps.push("Native Save writes PDF with persisted annotations");
  const extracted = join(temp, "extracted.pdf");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, extracted);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("textbox", { name: "Pages to extract" }).fill("1, 3");
  await page.getByRole("button", { name: "Export PDFs", exact: true }).click();
  await noBusy();
  const extractedDoc = new mupdf.PDFDocument(
    new Uint8Array(await readFile(extracted)),
  );
  expect(extractedDoc.countPages()).toBe(2);
  extractedDoc.destroy();
  steps.push("Page range extraction writes a separate two-page PDF");
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, temp);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await page.getByRole("button", { name: "Export PDFs", exact: true }).click();
  await noBusy();
  const exportFolder = (await readdir(temp)).find((name) =>
    name.startsWith("OpenPDF export"),
  );
  expect(
    (await readdir(join(temp, exportFolder))).filter((name) =>
      name.endsWith(".pdf"),
    ),
  ).toHaveLength(4);
  steps.push("Split exports all pages into a new folder");
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, saved);
  await page.getByRole("button", { name: "Add PDF", exact: true }).click();
  await noBusy();
  await expect(page.locator(".page-card")).toHaveCount(8);
  steps.push("Native file selection and PDF merge");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: join(output, "dark-reader.png") });
  steps.push("Dark mode");
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      canceled: true,
      filePath: undefined,
    });
  });
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await noBusy();
  await expect(page.locator(".status-left")).toContainText("Unsaved changes");
  steps.push("Cancel Save As preserves dirty state");
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 2,
      checkboxChecked: false,
    });
    BrowserWindow.getAllWindows()[0].webContents.send("menu:command", "close");
  });
  await expect(page.locator(".page-stage .pdf-page")).toBeVisible();
  steps.push("Cancel close preserves the open document");
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
    BrowserWindow.getAllWindows()[0].webContents.send("menu:command", "close");
  });
  await expect(
    page.getByRole("heading", { name: "Your PDFs. On your terms." }),
  ).toBeVisible();
  await page
    .locator(".recent-list button")
    .filter({ hasText: "saved.pdf" })
    .click();
  await noBusy();
  await ready();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(3);
  steps.push("Reopen saved PDF from recent files with annotations intact");
  expect(errors).toEqual([]);
  await writeFile(
    join(output, "desktop-results.json"),
    JSON.stringify({ steps, security, errors, savedPDF: saved }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: steps.length, steps, security, errors }, null, 2),
  );
} catch (error) {
  console.error(
    "PAGE:",
    await page
      .locator("body")
      .innerText()
      .catch(() => "unavailable"),
  );
  console.error("ERRORS:", errors);
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
  );
  await app.close();
}
