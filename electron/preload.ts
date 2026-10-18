import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI, OpenFile } from "../src/types";
const api: DesktopAPI = {
  copyText: (value) => ipcRenderer.invoke("clipboard:write-text", value),
  open: () => ipcRenderer.invoke("files:open"),
  openRecent: (id) => ipcRenderer.invoke("files:recent", id),
  openImages: () => ipcRenderer.invoke("files:open-images"),
  prepareSignature: (bytes, removeWhite) =>
    ipcRenderer.invoke("image:prepare-signature", bytes, removeWhite),
  convertPresentation: () => ipcRenderer.invoke("files:convert-presentation"),
  convertPDFToPptx: (pages, name) =>
    ipcRenderer.invoke("files:convert-pdf-pptx", pages, name),
  convertWord: () => ipcRenderer.invoke("files:convert-word"),
  pickPDF: () => ipcRenderer.invoke("files:pick-pdf"),
  convertPDFToDocx: (pages, name, mode) =>
    ipcRenderer.invoke("files:convert-pdf-docx", pages, name, mode),
  convertMarkup: (source, name, format) =>
    ipcRenderer.invoke("files:convert-markup", source, name, format),
  recents: () => ipcRenderer.invoke("files:recents"),
  clearRecents: () => ipcRenderer.invoke("files:clear-recents"),
  save: (bytes, id, name, saveAs) =>
    ipcRenderer.invoke("files:save", bytes, id, name, saveAs),
  exportFiles: (files) => ipcRenderer.invoke("files:export", files),
  exportMarkdown: (markdown, name) =>
    ipcRenderer.invoke("files:export-markdown", markdown, name),
  runOCR: (bytes, pages, language) =>
    ipcRenderer.invoke("document:ocr", bytes, pages, language),
  cancelOCR: () => ipcRenderer.send("document:ocr-cancel"),
  setDirty: (value) => ipcRenderer.send("document:dirty", value),
  confirmClose: (name) => ipcRenderer.invoke("document:confirm", name),
  closeWindow: () => ipcRenderer.send("window:close"),
  fullscreen: () => ipcRenderer.send("window:fullscreen"),
  print: () => ipcRenderer.send("window:print"),
  ready: () => ipcRenderer.send("renderer:ready"),
  onCommand: (cb) => {
    const listener = (_: unknown, command: string) => cb(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
  onFile: (cb) => {
    const listener = (_: unknown, file: OpenFile) => cb(file);
    ipcRenderer.on("files:opened", listener);
    return () => ipcRenderer.removeListener("files:opened", listener);
  },
};
contextBridge.exposeInMainWorld("desktop", api);
