import {
  inspect,
  edit,
  editDocument,
  extract,
  createSample,
  imagesToPDF,
  inspectDocument,
  inspectPage,
  openPDF,
  serializePDF,
} from "./pdf";
import type * as mupdf from "mupdf";
import type { DocumentInfo } from "../types";
import {
  addBatesNumbers,
  alternateMix,
  docxPages,
  cleanPrivacy,
  cropResizePDF,
  encryptPDF,
  extractImages,
  flattenPDF,
  fillForm,
  listFormFields,
  mirrorPages,
  optimizePDF,
  pagesPerSheet,
  pdfPagesToImages,
  scanPrivacy,
  splitDocument,
  unlockPDF,
  updateMetadata,
} from "./document-tools";

let sessionDocument: mupdf.PDFDocument | null = null;
let sessionRevisionId = "";
let sessionInfo: DocumentInfo | null = null;

self.addEventListener("close", () => {
  sessionDocument?.destroy();
  sessionInfo = null;
});
self.onmessage = ({ data }) => {
  const {
    id,
    action,
    bytes,
    command,
    pages,
    images,
    baseRevisionId,
    nextRevisionId,
    values,
    options,
    secondBytes,
    firstOrder,
    direction,
    perSheet,
    name,
    mode,
    value,
    password,
    format,
    dpi,
    quality,
    marginPercent,
    size,
  } = data;
  try {
    let result;
    if (action === "inspect") result = { bytes, info: inspect(bytes) };
    else if (action === "edit") {
      const output = edit(bytes, command);
      result = { bytes: output, info: inspect(output) };
    } else if (action === "edit-session") {
      if (!sessionDocument || sessionRevisionId !== baseRevisionId) {
        if (!(bytes instanceof Uint8Array))
          throw new Error("PDF_EDIT_SESSION_MISS");
        sessionDocument?.destroy();
        sessionDocument = openPDF(bytes);
        sessionRevisionId = baseRevisionId;
        sessionInfo = inspectDocument(sessionDocument);
      }
      editDocument(sessionDocument, command);
      const output = serializePDF(sessionDocument);
      sessionRevisionId = nextRevisionId;
      if (
        sessionInfo &&
        (command.type === "annotate" ||
          command.type === "update-annotation" ||
          command.type === "remove-annotation")
      ) {
        sessionInfo = {
          ...sessionInfo,
          pages: sessionInfo.pages.map((page, index) =>
            index === command.page ? inspectPage(sessionDocument!, index) : page,
          ),
        };
      } else {
        sessionInfo = inspectDocument(sessionDocument);
      }
      result = { bytes: output, info: sessionInfo };
    } else if (action === "extract") result = extract(bytes, pages);
    else if (action === "images") {
      const output = imagesToPDF(images);
      result = { bytes: output, info: inspect(output) };
    } else if (action === "metadata") result = updateMetadata(bytes, values);
    else if (action === "form-fields") result = listFormFields(bytes);
    else if (action === "fill-form") result = fillForm(bytes, values);
    else if (action === "bates") result = addBatesNumbers(bytes, options);
    else if (action === "mix")
      result = alternateMix(bytes, secondBytes, firstOrder);
    else if (action === "mirror") result = mirrorPages(bytes, direction);
    else if (action === "pages-per-sheet")
      result = pagesPerSheet(bytes, perSheet);
    else if (action === "split-tools")
      result = splitDocument(bytes, name, mode, value);
    else if (action === "extract-images") result = extractImages(bytes, name);
    else if (action === "unlock") result = unlockPDF(bytes, password);
    else if (action === "docx-pages") result = docxPages(bytes, mode);
    else if (action === "optimize") result = optimizePDF(bytes);
    else if (action === "render-images")
      result = pdfPagesToImages(bytes, name, format, dpi, quality);
    else if (action === "encrypt") result = encryptPDF(bytes, password);
    else if (action === "flatten") result = flattenPDF(bytes);
    else if (action === "crop-resize")
      result = cropResizePDF(bytes, marginPercent, size);
    else if (action === "privacy-scan") result = scanPrivacy(bytes);
    else if (action === "privacy-clean") result = cleanPrivacy(bytes);
    else if (action === "sample") {
      const output = createSample();
      result = { bytes: output, info: inspect(output) };
    } else throw new Error("Unknown PDF operation");
    self.postMessage({ id, result });
  } catch (error) {
    if (action === "edit-session") {
      sessionDocument?.destroy();
      sessionDocument = null;
      sessionRevisionId = "";
      sessionInfo = null;
    }
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "The PDF could not be processed.",
    });
  }
};
self.postMessage({ ready: true });
