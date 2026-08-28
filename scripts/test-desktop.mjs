import { _electron as electron, expect } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import * as mupdf from "mupdf";

const output = resolve("test-results");
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "openpdf-desktop-"));
const app = await electron.launch({
  ...(process.env.OPENPDF_TEST_EXECUTABLE
    ? { executablePath: process.env.OPENPDF_TEST_EXECUTABLE }
    : { args: ["."] }),
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
    console.log("RENDERER:", message.text());
  }
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
  await expect(page.locator(".product-icon").first()).toHaveJSProperty(
    "naturalWidth",
    256,
  );
  await page.screenshot({
    animations: "disabled",
    path: join(output, "welcome.png"),
  });
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
  // Preferences are real persisted state; exercise native entry and live updates.
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu().items[0].submenu.items.find(
      (item) => item.label === "Settings…",
    );
    if (!menu) throw new Error("Native Settings menu missing");
    menu.click();
  });
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByLabel("Default page view").selectOption("width");
  await settings.getByRole("switch", { name: "Show the page sidebar" }).click();
  await settings
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await settings.getByRole("button", { name: "System appearance" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await settings.getByRole("button", { name: "Light appearance" }).click();
  await settings.getByRole("button", { name: "Cobalt palette" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "cobalt");
  await settings.getByRole("switch", { name: "Reduce motion" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.screenshot({
    animations: "disabled",
    path: join(output, "settings-appearance.png"),
  });
  await settings
    .getByRole("button", { name: "Annotations", exact: true })
    .click();
  await settings.getByRole("button", { name: "Blue annotation color" }).click();
  await settings.getByLabel("Default line weight").selectOption("5");
  await page.screenshot({
    animations: "disabled",
    path: join(output, "settings-annotations.png"),
  });
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "cobalt");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("openpdf:preferences:v1")),
    ),
  ).toMatchObject({
    defaultFit: "width",
    showSidebar: false,
    annotationColor: "#719cd6",
    strokeWidth: 5,
  });
  steps.push(
    "Native Settings, system appearance, live palettes, reduced motion and reload persistence",
  );
  await page.getByRole("button", { name: /Take a look around/ }).click();
  await ready();
  await noBusy();
  await expect(page.locator(".textLayer").last()).toContainText(
    "A little less friction.",
  );
  await page.screenshot({
    animations: "disabled",
    path: join(output, "reader.png"),
  });
  steps.push("Worker generated and rendered actual PDF with selectable text");
  const markdown = join(temp, "Field Notes.md");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, markdown);
  await page.getByRole("button", { name: "Analyze document", exact: true }).click();
  const analysis = page.getByRole("dialog", { name: "Document analysis", exact: true });
  await expect(analysis).toBeVisible();
  await expect(analysis).toContainText("Text-based PDF", { timeout: 30000 });
  await expect(analysis.locator("#markdown-preview")).toContainText(
    "A little less friction",
  );
  await analysis.getByRole("button", { name: "Export Markdown", exact: true }).click();
  await expect(analysis).toContainText("Markdown exported");
  await expect(readFile(markdown, "utf8")).resolves.toContain(
    "A little less friction",
  );
  await analysis.getByRole("button", { name: "Done", exact: true }).click();
  steps.push("Local document classification and native Markdown export");
  await expect(page.getByLabel("Page fit", { exact: true })).toHaveValue(
    "width",
  );
  await expect(
    page.getByRole("button", { name: "Show sidebar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await expect(page.getByLabel("Stroke width", { exact: true })).toHaveValue(
    "5",
  );
  await expect(
    page.getByRole("button", { name: "Color #719cd6", exact: true }),
  ).toHaveClass(/selected/);
  steps.push(
    "Saved viewer and annotation defaults applied to an actual document",
  );
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settings.getByRole("button", { name: "About", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: join(output, "settings-about.png"),
  });
  await settings
    .getByRole("button", { name: "Reset settings", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "cobalt");
  await settings
    .getByRole("button", { name: "Confirm reset", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "forest");
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rectangle", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await page.getByLabel("Page fit", { exact: true }).selectOption("page");
  await ready();
  await page.screenshot({
    animations: "disabled",
    path: join(output, "reader.png"),
  });
  steps.push(
    "Confirmed reset and Escape return to the document without changing it",
  );

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
  await page
    .getByRole("button", { name: "Table of contents", exact: true })
    .click();
  await expect(page.locator(".outline-item")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Yours to keep 4", exact: true })
    .click();
  await ready();
  await expect(
    page.getByRole("spinbutton", { name: "Page number" }),
  ).toHaveValue("4");
  await expect(page.locator(".page-stage .textLayer")).toContainText(
    "Yours to keep.",
  );
  await page.screenshot({
    animations: "disabled",
    path: join(output, "document-outline.png"),
  });
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu().items.find(
      (item) => item.label === "File",
    );
    file.submenu.items
      .find((item) => item.label === "Document Details…")
      .click();
  });
  const details = page.getByRole("dialog", {
    name: "Document details",
    exact: true,
  });
  await expect(details).toContainText(
    "Field Notes — A guide to OpenPDF Studio",
  );
  await expect(details).toContainText("OpenPDF Studio");
  await expect(details.locator(".document-stats")).toContainText("4");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".page-navigation input")).toHaveValue("4");
  await page.screenshot({
    animations: "disabled",
    path: join(output, "document-details.png"),
  });
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  steps.push(
    "Embedded table of contents navigates actual pages; native document details display metadata",
  );

  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Go to page 1", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page.evaluate(() => {
    window.__openpdfPageBlinked = false;
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".page-stage .pdf-page"))
        window.__openpdfPageBlinked = true;
    });
    observer.observe(document.querySelector(".page-stage"), {
      childList: true,
      subtree: true,
    });
    window.__openpdfBlinkObserver = observer;
  });
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
  expect(
    await page.evaluate(() => {
      window.__openpdfBlinkObserver?.disconnect();
      return window.__openpdfPageBlinked;
    }),
  ).toBe(false);
  steps.push("Note created from page coordinates");
  await page
    .getByRole("button", { name: "Edit annotation 1 on page 1", exact: true })
    .click();
  const annotationEditor = page.getByRole("dialog", {
    name: "Edit annotation",
    exact: true,
  });
  await expect(
    annotationEditor.getByRole("button", { name: "Update annotation" }),
  ).toBeDisabled();
  await annotationEditor.getByLabel("Annotation contents").fill("");
  await annotationEditor
    .getByRole("button", { name: "Update annotation" })
    .click();
  await expect(annotationEditor.getByRole("alert")).toContainText(
    "Add some text",
  );
  await annotationEditor
    .getByLabel("Annotation contents")
    .fill("Edited: this note stays inside the saved PDF.");
  await annotationEditor
    .getByRole("button", { name: "Blue color", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: join(output, "annotation-editor.png"),
  });
  await annotationEditor
    .getByRole("button", { name: "Update annotation" })
    .click();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.locator(".note-card")).toContainText(
    "Edited: this note stays inside the saved PDF.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  await expect(page.locator(".note-card")).toContainText(
    "Verified: this note stays inside the saved PDF.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await ready();
  await expect(page.locator(".note-card")).toContainText(
    "Edited: this note stays inside the saved PDF.",
  );
  await page
    .getByRole("button", { name: "Edit annotation 1 on page 1", exact: true })
    .click();
  await annotationEditor
    .getByLabel("Annotation contents")
    .fill("Cancel this draft");
  await annotationEditor
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".note-card")).toContainText(
    "Edited: this note stays inside the saved PDF.",
  );
  steps.push(
    "Edit annotation text and color, validate empty text, cancel drafts, and undo/redo changes",
  );

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
  await page
    .getByRole("button", { name: "Edit annotation 2 on page 1", exact: true })
    .click();
  await annotationEditor.getByLabel("Annotation line weight").fill("5");
  await annotationEditor
    .getByLabel("Annotation contents")
    .fill("Review this section.");
  await annotationEditor
    .getByRole("button", { name: "Update annotation" })
    .click();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card").nth(1)).toContainText(
    "Review this section.",
  );
  steps.push("Shape annotation line weight and comment editing");

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

  // Add Text (FreeText) workflow
  await page.getByRole("button", { name: "Text box", exact: true }).click();
  box = await page.locator(".page-stage .pdf-page").boundingBox();
  await page.mouse.click(box.x + 200, box.y + 160);
  const textModal = page.getByRole("dialog");
  await expect(textModal).toBeVisible();
  await textModal.getByLabel("Font size").selectOption("18");
  await textModal.getByLabel("Font family").selectOption("Cour");
  await textModal.getByRole("button", { name: "Charcoal" }).click();
  await textModal.getByLabel("Annotation text").fill("Café Approval — 100€\nReviewed & Accepted ©");
  await textModal.getByRole("button", { name: "Add to document", exact: true }).click();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(4);
  await expect(page.locator(".note-card").last()).toContainText("Café Approval — 100€");

  // Move Text Box via page interaction
  const freeTextHandle = page.locator('.annotation-interaction-layer div[role="button"][aria-label*="FreeText"]');
  await expect(freeTextHandle).toBeVisible();
  const ftBox = await freeTextHandle.boundingBox();
  await page.mouse.move(ftBox.x + ftBox.width / 2, ftBox.y + ftBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(ftBox.x + ftBox.width / 2 + 30, ftBox.y + ftBox.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await noBusy();
  await ready();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await ready();
  steps.push("Add text with custom font size, Courier family, Unicode/multiline text, and move interaction");

  // Signature workflow (Sign / Stamp)
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  const signatureModal = page.getByRole("dialog", {
    name: "Signature creation and placement",
  });
  await expect(signatureModal).toBeVisible();
  // Type signature tab
  await signatureModal
    .getByRole("button", { name: "Type", exact: true })
    .click();
  await signatureModal.getByLabel("Full name or initials").fill("Jane Doe");
  await signatureModal
    .getByRole("checkbox", {
      name: "Save signature for future use (stored locally on this Mac)",
    })
    .check();
  await signatureModal
    .getByRole("button", { name: "Place Signature", exact: true })
    .click();
  await noBusy();
  await ready();
  await expect(page.locator(".note-card")).toHaveCount(5);
  await expect(page.locator(".note-card").last()).toContainText("Signature");

  // Reopen Signature Modal and verify saved signature persistence
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(signatureModal).toBeVisible();
  await expect(
    signatureModal.getByRole("button", { name: /Saved/ }),
  ).toBeVisible();
  await expect(signatureModal.getByText("Jane Doe")).toBeVisible();

  // Delete saved signature
  await signatureModal
    .getByRole("button", { name: "Delete saved signature", exact: true })
    .click();
  await expect(signatureModal.getByRole("button", { name: "Draw" })).toHaveClass(
    /active/,
  );
  await signatureModal.getByRole("button", { name: "Cancel" }).click();
  steps.push(
    "Sign workflow with typed signature, persistence opt-in, placement, and saved signature deletion",
  );

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
  await page.screenshot({
    animations: "disabled",
    path: join(output, "organizer.png"),
  });
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
    "Edited: this note stays inside the saved PDF.",
  );
  expect(annots.map((annotation) => annotation.getContents())).toContain(
    "Café Approval — 100€\nReviewed & Accepted ©",
  );
  const stampAnnot = annots.find((a) => a.getType() === "Stamp");
  expect(stampAnnot).toBeDefined();
  expect(annots[0].getColor()[2]).toBeCloseTo(214 / 255);
  expect(annots[1].getBorderWidth()).toBe(5);
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
  await page.screenshot({
    animations: "disabled",
    path: join(output, "dark-reader.png"),
  });
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
  await expect(page.locator(".note-card")).toHaveCount(5);
  steps.push("Reopen saved PDF from recent files with annotations intact");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settings.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(settings).toContainText("2 documents in your recent list");
  await page.screenshot({
    animations: "disabled",
    path: join(output, "settings-privacy.png"),
  });
  await settings
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(settings).toContainText("Recent history cleared");
  expect(await page.evaluate(() => window.desktop.recents())).toEqual([]);
  expect(
    JSON.parse(
      await readFile(join(temp, "profile", "recent-files.json"), "utf8"),
    ),
  ).toEqual([]);
  expect((await readFile(saved)).length).toBeGreaterThan(0);
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  steps.push(
    "Privacy history clearing persists on disk and leaves PDF files intact",
  );
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
  await page
    .screenshot({ animations: "disabled", path: join(output, "failure.png") })
    .catch(() => {});
  throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
  );
  await app.close();
}
