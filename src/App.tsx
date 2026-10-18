import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BookOpen,
  Braces,
  LockKeyhole,
  Pencil,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FilePlus2,
  FileOutput,
  FileText,
  FileSearch,
  FolderOpen,
  Grid2X2,
  Highlighter,
  Info,
  Maximize,
  MessageSquare,
  Minus,
  Moon,
  MousePointer2,
  MoveUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  PenTool,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Strikethrough,
  Sun,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { pdfEngine } from "./core/client";
import { isDocumentDirty, useDocument } from "./core/history";
import { IconButton } from "./components/Button";
import { PDFPage, rgb } from "./components/PDFPage";
import { DocumentTabs } from "./components/DocumentTabs";
import {
  MAX_FILE_SIZE,
  type AnnotationInput,
  type AnnotationInfo,
  type AnnotationPatch,
  type EditCommand,
  type ImageFile,
  type ImagePDFInput,
  type OpenFile,
  type RecentFile,
  type Tool,
} from "./types";
import { parsePageRange } from "./core/ranges";
import { pageSearchText } from "./core/viewer-performance";
import {
  ANNOTATION_COLORS,
  COLOR_NAMES,
  TEXT_BACKGROUND_COLORS,
  TEXT_BACKGROUND_NAMES,
  TEXT_COLORS,
  TEXT_COLOR_NAMES,
  usePreferences,
} from "./core/preferences";
import { Settings, type SettingsSection } from "./components/Settings";
import { APP_VERSION, BrandIcon } from "./components/Brand";
import { AnnotationEditor } from "./components/AnnotationEditor";
import {
  SignatureModal,
  type SignatureResult,
} from "./components/SignatureModal";
import { DocumentDetails } from "./components/DocumentDetails";
import { DocumentAnalysis } from "./components/DocumentAnalysis";
import { ImagePDFEditor } from "./components/ImagePDFEditor";
import { DocumentOutline } from "./components/DocumentOutline";
import { PDFTools } from "./components/PDFTools";
import { MarkupConverter } from "./components/MarkupConverter";
import { UnlockPDF } from "./components/UnlockPDF";
import { annotationHex, annotationName } from "./core/annotation-style";
GlobalWorkerOptions.workerSrc = workerUrl;

const tools: {
  id: Tool;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
}[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
    hint: "Select text to copy it.",
  },
  {
    id: "Highlight",
    label: "Highlight",
    icon: Highlighter,
    hint: "Drag over text to highlight it.",
  },
  {
    id: "Underline",
    label: "Underline",
    icon: Underline,
    hint: "Select text to underline it.",
  },
  {
    id: "StrikeOut",
    label: "Strike through",
    icon: Strikethrough,
    hint: "Select text to strike it through.",
  },
  {
    id: "Ink",
    label: "Draw",
    icon: PenLine,
    hint: "Click and drag to draw on the page.",
  },
  {
    id: "Square",
    label: "Rectangle",
    icon: Square,
    hint: "Click and drag to draw a rectangle.",
  },
  {
    id: "Circle",
    label: "Ellipse",
    icon: Circle,
    hint: "Click and drag to draw an ellipse.",
  },
  {
    id: "Line",
    label: "Arrow",
    icon: MoveUpRight,
    hint: "Drag from the tail to the tip of your arrow.",
  },
  {
    id: "FreeText",
    label: "Text box",
    icon: Type,
    hint: "Click the page to add a text box.",
  },
  {
    id: "Text",
    label: "Sticky note",
    icon: MessageSquare,
    hint: "Click anywhere to leave a note.",
  },
  {
    id: "Stamp",
    label: "Sign",
    icon: PenTool,
    hint: "Click to create and place a visible signature.",
  },
];
const colors = ANNOTATION_COLORS;
const download = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};
type Modal =
  | { kind: "text"; type: "Text" | "FreeText"; rect: number[] }
  | { kind: "delete" | "extract" | "split" | "about" };

export default function App() {
  const state = useDocument();
  const { values: preferences, update: updatePreferences } = usePreferences();
  const [editor, setEditor] = useState<{
    annotation: AnnotationInfo;
    page: number;
    revisionId: string;
  } | null>(null);
  const [details, setDetails] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark =
    preferences.appearance === "system"
      ? systemDark
      : preferences.appearance === "dark";
  const revision = state.revisions[state.cursor];
  const dirty = !!revision && revision.id !== state.saved;
  const anyDirty = state.documents.some(isDocumentDirty);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfRevisionId, setPdfRevisionId] = useState("");
  const pdfTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [page, setPage] = useState(0);
  const [scaleMode, setScaleMode] = useState<"page" | "width" | "manual">(
    preferences.defaultFit,
  );
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState({ width: 900, height: 750 });
  const [mode, setMode] = useState<"read" | "annotate" | "organize">("read");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(preferences.annotationColor);
  const [stroke, setStroke] = useState(preferences.strokeWidth);
  const [sidebar, setSidebar] = useState(preferences.showSidebar);
  const [tab, setTab] = useState<"pages" | "search" | "notes" | "contents">(
    "pages",
  );
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    { page: number; count: number; snippet: string }[]
  >([]);
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [input, setInput] = useState("");
  const [modalError, setModalError] = useState("");
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [imageEditor, setImageEditor] = useState<ImageFile[] | null>(null);
  const [toolsOpen, setToolsOpen] = useState<
    | null
    | "split"
    | "mix"
    | "sheet"
    | "mirror"
    | "form"
    | "metadata"
    | "bates"
    | "images"
    | "unlock"
    | "docx"
    | "pptx"
  >(null);
  const [markupConverter, setMarkupConverter] = useState<
    "markdown" | "latex" | null
  >(null);
  const [unlockFile, setUnlockFile] = useState<OpenFile | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    number | null
  >(null);
  const [pendingStampRect, setPendingStampRect] = useState<number[] | null>(
    null,
  );
  const [textModalColor, setTextModalColor] = useState(
    preferences.defaultTextColor || "#1f2421",
  );
  const [textModalFontSize, setTextModalFontSize] = useState(
    String(preferences.defaultFontSize || 14),
  );
  const [textModalFont, setTextModalFont] = useState("Helv");
  const [textModalFill, setTextModalFill] = useState("none");
  const dialog = useRef<HTMLDialogElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filePurpose = useRef<"open" | "merge">("open");
  const dragPage = useRef<number | null>(null);
  type DocumentView = {
    page: number;
    zoom: number;
    scaleMode: typeof scaleMode;
    sidebar: boolean;
    tab: typeof tab;
    search: string;
    mode: typeof mode;
    top: number;
    left: number;
  };
  const documentViews = useRef(new Map<string, DocumentView>());
  const pendingScroll = useRef<{ top: number; left: number } | null>(null);
  const count = revision?.info.pages.length ?? 0;
  const pageInfo = revision?.info.pages[Math.min(page, count - 1)];
  const scale = Math.max(
    0.15,
    Math.min(
      4,
      scaleMode === "manual"
        ? zoom
        : pageInfo
          ? scaleMode === "width"
            ? (area.width - 100) / pageInfo.width
            : Math.min(
                (area.width - 100) / pageInfo.width,
                (area.height - 78) / pageInfo.height,
              )
          : 1,
    ),
  );
  const reportError = useCallback((message: string) => setError(message), []);
  const notify = (message: string) => {
    setToast(message);
  };
  const perform = async (label: string, task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : "Something went wrong. Your last revision is safe.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.palette = preferences.theme;
    document.documentElement.dataset.motion = preferences.reducedMotion
      ? "reduced"
      : "auto";
  }, [dark, preferences.theme, preferences.reducedMotion]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    setColor(preferences.annotationColor);
  }, [preferences.annotationColor]);
  useEffect(() => {
    setStroke(preferences.strokeWidth);
  }, [preferences.strokeWidth]);
  useEffect(() => {
    window.desktop?.setDirty(anyDirty);
    document.title = revision
      ? `${dirty ? "• " : ""}${state.name} — OpenPDF Studio`
      : "OpenPDF Studio";
  }, [dirty, anyDirty, state.name, revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    void window.desktop
      ?.recents()
      .then(setRecents)
      .catch(() => {});
  }, [state.name, settings]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setArea({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [!!revision]);
  useEffect(() => {
    setPage((value) => Math.max(0, Math.min(value, count - 1)));
  }, [count]);
  useEffect(() => {
    viewport.current?.scrollTo({ top: 0, left: 0 });
  }, [page]);
  useEffect(() => {
    if (!revision) {
      const previous = pdfTaskRef.current;
      pdfTaskRef.current = null;
      setPdf(null);
      void previous?.destroy();
      return;
    }
    let cancelled = false;
    let settled = false;
    const root = new URL("./pdfjs/", window.location.href).href;
    const loading = getDocument({
      data: revision.bytes.slice(),
      cMapUrl: root + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: root + "standard_fonts/",
      wasmUrl: root + "wasm/",
      iccUrl: root + "iccs/",
    });
    void loading.promise
      .then((document) => {
        settled = true;
        if (cancelled) {
          void loading.destroy();
          return;
        }
        const previous = pdfTaskRef.current;
        pdfTaskRef.current = loading;
        setPdf(document);
        setPdfRevisionId(revision.id);
        // Let React hand the new document to PDFPage before releasing the old
        // one whose rendered pixels remain visible during the swap.
        if (previous) setTimeout(() => void previous.destroy(), 0);
      })
      .catch((cause) => {
        if (!cancelled)
          reportError(`Could not display this PDF: ${cause.message}`);
      });
    return () => {
      cancelled = true;
      if (!settled) void loading.destroy();
    };
  }, [revision, reportError]);
  useEffect(
    () => () => {
      void pdfTaskRef.current?.destroy();
      pdfTaskRef.current = null;
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const needle = search.trim().toLowerCase();
    setResults([]);
    if (!pdf || !needle || tab !== "search") {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        const matches: typeof results = [];
        for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
          const text = await pageSearchText(pdf, i);
          if (cancelled) return;
          const lower = text.toLowerCase();
          const found = lower.indexOf(needle);
          if (found >= 0)
            matches.push({
              page: i - 1,
              count: lower.split(needle).length - 1,
              snippet: text.slice(
                Math.max(0, found - 35),
                found + needle.length + 70,
              ),
            });
        }
        if (!cancelled) {
          setResults(matches);
          setSearching(false);
        }
      })().catch(() => {
        if (!cancelled) {
          setSearching(false);
          reportError("Search could not read this document.");
        }
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdf, search, tab, reportError]);
  useEffect(() => {
    if (tab === "search") searchInput.current?.focus();
  }, [tab, sidebar]);
  useEffect(() => {
    if (modal) {
      setInput(modal.kind === "extract" ? String(page + 1) : "");
      setModalError("");
      if (modal.kind === "text" && modal.type === "FreeText")
        setTextModalFill("none");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [modal, page]);

  const saveCurrent = async (
    saveAs = false,
    documentId = useDocument.getState().activeId,
  ): Promise<boolean> => {
    const store = useDocument.getState();
    const current = store.documents.find(
      (document) => document.id === documentId,
    );
    if (!current) return false;
    const entry = current.revisions[current.cursor];
    if (!entry) return false;
    if (window.desktop) {
      const result = await window.desktop.save(
        entry.bytes,
        current.fileId,
        current.name,
        saveAs,
      );
      if (!result) return false;
      store.markSaved(entry.id, result.name, result.id, current.id);
    } else {
      download(entry.bytes, current.name);
      store.markSaved(entry.id, current.name, null, current.id);
    }
    notify("PDF saved. All changes are in the file.");
    return true;
  };
  const confirmLeave = async (documentId = useDocument.getState().activeId) => {
    const current = useDocument
      .getState()
      .documents.find((document) => document.id === documentId);
    if (!current) return true;
    const entry = current.revisions[current.cursor];
    if (!entry || entry.id === current.saved) return true;
    const answer = window.desktop
      ? await window.desktop.confirmClose(current.name)
      : window.confirm(
            "Discard unsaved changes? Cancel to return and save first.",
          )
        ? "discard"
        : "cancel";
    return answer === "save"
      ? saveCurrent(false, documentId)
      : answer === "discard";
  };
  const applyDocumentDefaults = () => {
    const prefs = usePreferences.getState().values;
    setScaleMode(prefs.defaultFit);
    setSidebar(prefs.showSidebar);
    setPage(0);
    setSearch("");
    setMode("read");
    setTool("select");
    setTab("pages");
  };
  const rememberView = () => {
    const id = useDocument.getState().activeId;
    if (id)
      documentViews.current.set(id, {
        page,
        zoom,
        scaleMode,
        sidebar,
        tab,
        search,
        mode,
        top: viewport.current?.scrollTop ?? 0,
        left: viewport.current?.scrollLeft ?? 0,
      });
  };
  const restoreView = (id: string | null) => {
    const view = id ? documentViews.current.get(id) : undefined;
    pendingScroll.current = view ? { top: view.top, left: view.left } : null;
    if (view) {
      setPage(view.page);
      setZoom(view.zoom);
      setScaleMode(view.scaleMode);
      setSidebar(view.sidebar);
      setTab(view.tab);
      setSearch(view.search);
      setMode(view.mode);
    } else applyDocumentDefaults();
    setTool("select");
    setSelectedAnnotationId(null);
    setEditor(null);
    setDetails(false);
    setAnalysis(false);
    setSettings(null);
    setPdf(null);
  };
  const activateDocument = (id: string | null) => {
    if (busyRef.current || id === useDocument.getState().activeId) return;
    rememberView();
    state.activate(id);
    restoreView(id);
  };
  const openDocument: typeof state.load = (...args) => {
    rememberView();
    state.load(...args);
    restoreView(useDocument.getState().activeId);
  };
  const closeDocument = (id: string | null) => {
    if (!id) return;
    void perform("Closing tab…", async () => {
      if (!(await confirmLeave(id))) return;
      const active = useDocument.getState().activeId;
      if (active === id) rememberView();
      state.close(id);
      documentViews.current.delete(id);
      if (active === id) restoreView(useDocument.getState().activeId);
    });
  };
  useEffect(() => {
    if (!pdf || !state.activeId) return;
    const view = pendingScroll.current;
    if (!view) return;
    const frame = requestAnimationFrame(() => {
      viewport.current?.scrollTo({ top: view.top, left: view.left });
      pendingScroll.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [pdf, state.activeId]);
  const loadFile = async (file: OpenFile) => {
    const existing =
      file.id &&
      useDocument
        .getState()
        .documents.find((document) => document.fileId === file.id);
    if (existing) {
      rememberView();
      state.activate(existing.id);
      restoreView(existing.id);
      return;
    }
    const result = await pdfEngine.inspect(file.bytes);
    openDocument(result.bytes, result.info, file.name, file.id);
    setSettings(null);
    setDetails(false);
    setEditor(null);
  };
  const chooseFile = (purpose: "open" | "merge" = "open") => {
    if (window.desktop)
      void perform(
        purpose === "merge" ? "Adding pages…" : "Opening PDF…",
        async () => {
          const file = await window.desktop!.open();
          if (!file) return;
          if (purpose === "open") await loadFile(file);
          else if (revision) {
            const result = await pdfEngine.edit(revision.bytes, {
              type: "merge",
              bytes: file.bytes,
            });
            state.commit(result.bytes, result.info, "Merge PDF");
            setPage(count);
            notify("Pages added to the end of your document.");
          }
        },
      );
    else {
      filePurpose.current = purpose;
      fileInput.current?.click();
    }
  };
  const acceptBrowserFile = (file: File) =>
    void perform("Opening PDF…", async () => {
      if (file.size > MAX_FILE_SIZE)
        throw new Error("Choose a PDF smaller than 50 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (filePurpose.current === "merge" && revision) {
        const result = await pdfEngine.editSession(
          revision.bytes,
          {
            type: "merge",
            bytes,
          },
          revision.id,
        );
        state.commit(result.bytes, result.info, "Merge PDF", result.revisionId);
        setPage(count);
      } else await loadFile({ id: null, name: file.name, bytes });
    });
  const applyEdit = async (
    command: EditCommand,
    label: string,
    nextPage?: number,
  ) => {
    let succeeded = false;
    await perform(label + "…", async () => {
      if (!revision) return;
      const result = await pdfEngine.editSession(
        revision.bytes,
        command,
        revision.id,
      );
      state.commit(result.bytes, result.info, label, result.revisionId);
      if (nextPage !== undefined) setPage(nextPage);
      succeeded = true;
    });
    return succeeded;
  };
  const saveAnnotation = async (patch: AnnotationPatch) => {
    const current = useDocument.getState();
    const entry = current.revisions[current.cursor];
    if (!editor || !entry || entry.id !== editor.revisionId)
      throw new Error(
        "The document changed. Close this editor and select the annotation again.",
      );
    if (busyRef.current)
      throw new Error("Please wait for the current operation to finish.");
    busyRef.current = true;
    setBusy("Updating annotation…");
    try {
      const result = await pdfEngine.editSession(
        entry.bytes,
        {
          type: "update-annotation",
          page: editor.page,
          id: editor.annotation.id,
          patch,
        },
        entry.id,
      );
      current.commit(
        result.bytes,
        result.info,
        "Edit annotation",
        result.revisionId,
      );
      setEditor(null);
      notify("Annotation updated. Save the PDF to keep your changes.");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const movePage = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= count) return;
    const order = Array.from({ length: count }, (_, i) => i);
    order.splice(to, 0, order.splice(from, 1)[0]);
    applyEdit({ type: "reorder", order }, "Reorder pages", to);
  };
  const addAnnotation = useCallback(
    (annotation: AnnotationInput) =>
      applyEdit(
        { type: "annotate", page, annotation },
        `Add ${annotation.type === "Text" ? "note" : annotation.type.toLowerCase()}`,
      ),
    [page, applyEdit],
  );
  const handleSignatureSelect = (sig: SignatureResult) => {
    if (!revision) return;
    const pInfo = revision.info.pages[page];
    const pw = pInfo?.width || 612;
    const ph = pInfo?.height || 792;
    let rect: number[];
    if (pendingStampRect) {
      rect = pendingStampRect;
      setPendingStampRect(null);
    } else {
      const targetW = Math.min(pw * 0.45, 180);
      const targetH = Math.min(
        ph * 0.25,
        Math.max(20, Math.round(targetW * (sig.height / sig.width))),
      );
      const x0 = Math.round((pw - targetW) / 2);
      const y0 = Math.round(ph * 0.7);
      rect = [x0, y0, x0 + targetW, y0 + targetH];
    }

    addAnnotation({
      type: "Stamp",
      rect,
      color: [0, 0, 0],
      width: 1,
      imageBytes: sig.imageBytes,
    });
    setTool("select");
    setTab("notes");
    notify("Signature placed on page. Drag to reposition or resize.");
  };
  const handleUpdateAnnotationRect = useCallback(
    (id: number, newRect: number[]) => {
      if (!revision) return;
      return applyEdit(
        {
          type: "update-annotation",
          page,
          id,
          patch: { rect: newRect },
        },
        "Move annotation",
      );
    },
    [revision, page, applyEdit],
  );
  // Stable callbacks for PDFPage — keeps memo() effective when unrelated
  // App state changes (e.g. toast, sidebar) don't re-render the page.
  const handleEditAnnotation = useCallback(
    (ann: AnnotationInfo) =>
      setEditor({ annotation: ann, page, revisionId: revision?.id ?? "" }),
    [page, revision?.id],
  );
  const handleText = useCallback(
    (rect: number[], type: "Text" | "FreeText") => {
      setTextModalFontSize(String(preferences.defaultFontSize || 14));
      setTextModalFont("Helv");
      setTextModalColor(
        type === "FreeText"
          ? preferences.defaultTextColor || "#1f2421"
          : preferences.annotationColor,
      );
      setInput("");
      setModalError("");
      setModal({ kind: "text", type, rect });
    },
    [
      preferences.defaultFontSize,
      preferences.defaultTextColor,
      preferences.annotationColor,
    ],
  );
  const handleStamp = useCallback((rect: number[]) => {
    setPendingStampRect(rect);
    setSignatureModalOpen(true);
  }, []);
  const printDocument = () =>
    void perform("Preparing all pages for print…", async () => {
      if (!pdf) return;
      const root = document.getElementById("print-root")!;
      root.replaceChildren();
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const canvas = document.createElement("canvas");
        const viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > 25_000_000 || pdf.numPages > 100)
          throw new Error(
            "Printing is limited to 100 pages and standard page sizes in this release. Extract a smaller range first.",
          );
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        const image = document.createElement("img");
        image.src = canvas.toDataURL();
        root.appendChild(image);
        await image.decode();
      }
      if (window.desktop) window.desktop.print();
      else window.print();
    });
  const commands = useRef<(name: string) => void>(() => {});
  commands.current = (name) => {
    if (name === "print-complete") {
      document.getElementById("print-root")?.replaceChildren();
      return;
    }
    if (
      busyRef.current ||
      ((modal ||
        editor ||
        details ||
        analysis ||
        imageEditor ||
        signatureModalOpen ||
        toolsOpen ||
        markupConverter ||
        unlockFile) &&
        name !== "save-and-close")
    )
      return;
    if (name === "settings" || name === "about") {
      setSettings(name === "about" ? "about" : "general");
      return;
    }
    if (settings && name !== "save-and-close") return;
    switch (name) {
      case "properties":
        if (revision) setDetails(true);
        break;
      case "contents":
        setSidebar(true);
        setTab("contents");
        break;
      case "new-tab":
        activateDocument(null);
        break;
      case "open":
        chooseFile();
        break;
      case "save":
        void perform("Saving…", () => saveCurrent().then(() => {}));
        break;
      case "save-as":
        void perform("Saving a copy…", () => saveCurrent(true).then(() => {}));
        break;
      case "save-and-close":
        void perform("Saving…", async () => {
          for (const document of useDocument
            .getState()
            .documents.filter(isDocumentDirty)) {
            if (!(await saveCurrent(false, document.id))) return;
          }
          window.desktop?.setDirty(false);
          window.desktop?.closeWindow();
        });
        break;
      case "close":
        closeDocument(state.activeId);
        break;
      case "undo":
        if (revision) state.undo();
        break;
      case "redo":
        if (revision) state.redo();
        break;
      case "search":
        setSidebar(true);
        setTab("search");
        searchInput.current?.focus();
        break;
      case "zoom-in":
        setScaleMode("manual");
        setZoom(Math.min(4, scale + 0.15));
        break;
      case "zoom-out":
        setScaleMode("manual");
        setZoom(Math.max(0.2, scale - 0.15));
        break;
      case "fit-page":
        setScaleMode("page");
        break;
      case "print":
        printDocument();
        break;
    }
  };
  const openFileHandler = useRef<(file: OpenFile) => void>(() => {});
  openFileHandler.current = (file) =>
    void perform("Opening PDF…", () => loadFile(file));
  useEffect(() => {
    const dispose = window.desktop?.onCommand((name) => commands.current(name));
    const fileDispose = window.desktop?.onFile((file) =>
      openFileHandler.current(file),
    );
    window.desktop?.ready();
    return () => {
      dispose?.();
      fileDispose?.();
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const input =
        event.target instanceof HTMLElement &&
        !!event.target.closest('input, textarea, [contenteditable="true"]');
      if (event.key === "Escape") {
        setSelectedAnnotationId(null);
        if (!settings && !modal && !editor && !details && !imageEditor)
          setTool("select");
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedAnnotationId !== null &&
        !input &&
        !modal &&
        !settings &&
        !editor &&
        !details &&
        !imageEditor &&
        !busyRef.current
      ) {
        const targetAnnot = pageInfo?.annotations.find(
          (a) => a.id === selectedAnnotationId,
        );
        if (targetAnnot && targetAnnot.editable && !targetAnnot.locked) {
          event.preventDefault();
          applyEdit(
            {
              type: "remove-annotation",
              page,
              id: selectedAnnotationId,
            },
            "Remove annotation",
          );
          setSelectedAnnotationId(null);
          return;
        }
      }
      if (!window.desktop && (event.metaKey || event.ctrlKey)) {
        if (
          input &&
          ["z", "a", "c", "v", "x"].includes(event.key.toLowerCase())
        )
          return;
        const command = (
          {
            ",": "settings",
            i: "properties",
            o: "open",
            t: "new-tab",
            s: event.shiftKey ? "save-as" : "save",
            f: "search",
            z: event.shiftKey ? "redo" : "undo",
            w: "close",
            p: "print",
            "+": "zoom-in",
            "=": "zoom-in",
            "-": "zoom-out",
            "0": "fit-page",
          } as Record<string, string>
        )[event.key.toLowerCase()];
        if (command) {
          event.preventDefault();
          commands.current(command);
        }
      } else if (
        !input &&
        !modal &&
        !settings &&
        !editor &&
        !details &&
        !imageEditor &&
        !busyRef.current
      ) {
        if (event.key === "ArrowRight" || event.key === "PageDown")
          setPage((value) => Math.min(count - 1, value + 1));
        if (event.key === "ArrowLeft" || event.key === "PageUp")
          setPage((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    count,
    modal,
    settings,
    editor,
    details,
    imageEditor,
    selectedAnnotationId,
    pageInfo,
    page,
  ]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (anyDirty && !window.desktop) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const submitModal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal) return;
    if (modal.kind === "text") {
      const contents = textInput.current?.value.trim() ?? "";
      if (!contents) {
        setModalError("Add some text first.");
        return;
      }
      if (contents.length > 5000) {
        setModalError("Keep annotation text to 5,000 characters or fewer.");
        return;
      }
      const isFreeText = modal.type === "FreeText";
      const annotColor = isFreeText
        ? [1, 3, 5].map(
            (offset) =>
              parseInt(textModalColor.slice(offset, offset + 2), 16) / 255,
          )
        : rgb(color);

      let rect = modal.rect;
      if (isFreeText) {
        const fSize = Number(textModalFontSize) || 14;
        const lines = contents.split("\n");
        const lineCount = lines.length;
        const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
        const charW = fSize * 0.58;
        const computedW = Math.max(120, maxLineLen * charW + 24);
        const computedH = Math.max(28, lineCount * (fSize * 1.35) + 16);
        const pInfo = revision?.info.pages[page];
        const pw = pInfo?.width || 612;
        const ph = pInfo?.height || 792;
        const curW = Math.max(rect[2] - rect[0], computedW);
        const curH = Math.max(rect[3] - rect[1], computedH);
        const x0 = Math.max(0, Math.min(pw - curW, rect[0]));
        const y0 = Math.max(0, Math.min(ph - curH, rect[1]));
        rect = [x0, y0, Math.min(pw, x0 + curW), Math.min(ph, y0 + curH)];
      }

      addAnnotation({
        type: modal.type,
        rect,
        color: annotColor,
        width: isFreeText ? 0 : stroke,
        contents,
        fontSize: isFreeText ? Number(textModalFontSize) : undefined,
        font: isFreeText ? textModalFont : undefined,
        fillColor:
          isFreeText && textModalFill !== "none"
            ? [1, 3, 5].map(
                (offset) =>
                  parseInt(textModalFill.slice(offset, offset + 2), 16) / 255,
              )
            : null,
      });
      setModal(null);
      setTool("select");
      setTab("notes");
      return;
    }
    if (modal.kind === "delete") {
      applyEdit({ type: "delete", page }, "Delete page");
      setModal(null);
      return;
    }
    if ((modal.kind === "extract" || modal.kind === "split") && revision) {
      let indices: number[];
      try {
        indices =
          modal.kind === "split"
            ? Array.from({ length: count }, (_, i) => i)
            : parsePageRange(input, count);
      } catch (error) {
        setModalError((error as Error).message);
        return;
      }
      const split = modal.kind === "split";
      setModal(null);
      void perform(
        split ? "Splitting document…" : "Extracting pages…",
        async () => {
          const base = state.name.replace(/\.pdf$/i, "");
          if (!split) {
            const bytes = await pdfEngine.extract(revision.bytes, indices);
            if (window.desktop) {
              if (
                !(await window.desktop.save(
                  bytes,
                  null,
                  `${base} - extracted.pdf`,
                  true,
                ))
              )
                return;
            } else download(bytes, `${base} - extracted.pdf`);
          } else {
            const files = [];
            let totalBytes = 0;
            for (const index of indices) {
              const bytes = await pdfEngine.extract(revision.bytes, [index]);
              totalBytes += bytes.length;
              if (totalBytes > 100 * 1024 * 1024)
                throw new Error(
                  "The split output exceeds 100 MB. Extract smaller ranges first.",
                );
              files.push({
                name: `${base} - page ${String(index + 1).padStart(3, "0")}.pdf`,
                bytes,
              });
            }
            if (window.desktop) {
              if (!(await window.desktop.exportFiles(files))) return;
            } else {
              for (const file of files) download(file.bytes, file.name);
            }
          }
          notify(
            split
              ? "Every page exported as a separate PDF."
              : "Selected pages exported. Original unchanged.",
          );
        },
      );
    }
  };
  const showPage = (index: number) => {
    setPage(index);
    setMode((current) => (current === "organize" ? "read" : current));
  };
  const canEdit = !!pdf && !busy;
  const chooseImagesForPDF = async () => {
    if (!window.desktop)
      throw new Error("Image conversion is available in the Mac app.");
    return window.desktop.openImages();
  };
  const convertImages = () => {
    setError("");
    void chooseImagesForPDF()
      .then((images) => {
        if (images?.length) setImageEditor(images);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not open images.",
        ),
      );
  };
  const finishImageConversion = async (images: ImagePDFInput[]) => {
    if (!window.desktop || busyRef.current) return;
    busyRef.current = true;
    setBusy("Creating your PDF…");
    setError("");
    try {
      const result = await pdfEngine.images(images);
      const saved = await window.desktop.save(
        result.bytes,
        null,
        images.length === 1
          ? images[0].name.replace(/\.(png|jpe?g)$/i, "") + ".pdf"
          : "Images.pdf",
        true,
      );
      if (!saved) return;
      openDocument(result.bytes, result.info, saved.name, saved.id);
      setImageEditor(null);
      notify(
        `${images.length} image${images.length === 1 ? "" : "s"} converted with original pixels preserved.`,
      );
    } catch (cause) {
      throw new Error(
        cause instanceof Error
          ? cause.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            )
          : "The images could not be converted.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const convertPresentation = () =>
    void perform("Converting PowerPoint presentation…", async () => {
      if (!window.desktop)
        throw new Error("PowerPoint conversion is available in the Mac app.");
      const converted = await window.desktop.convertPresentation();
      if (!converted) return;
      await loadFile(converted);
      notify(`Presentation converted locally with ${converted.engine}.`);
    });
  const convertWord = () =>
    void perform("Converting Word document…", async () => {
      if (!window.desktop)
        throw new Error("Word conversion is available in the Mac app.");
      const converted = await window.desktop.convertWord();
      if (!converted) return;
      await loadFile(converted);
      notify(`Word document converted locally with ${converted.engine}.`);
    });
  const openToolWithPDF = (tool: NonNullable<typeof toolsOpen>) =>
    void perform("Opening PDF tool…", async () => {
      if (!window.desktop)
        throw new Error("PDF Tools are available in the Mac app.");
      const file = await window.desktop.pickPDF();
      if (!file) return;
      await loadFile(file);
      setToolsOpen(tool);
    });
  const chooseProtectedPDF = () =>
    void perform("Opening protected PDF…", async () => {
      if (!window.desktop)
        throw new Error("Unlock PDF is available in the Mac app.");
      const file = await window.desktop.pickPDF();
      if (file) setUnlockFile(file);
    });
  return (
    <div
      className={`app ${dragging ? "dragging-file" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        if (settings || modal || editor || details || imageEditor) {
          event.preventDefault();
          setDragging(false);
          return;
        }
        event.preventDefault();
        setDragging(false);
        filePurpose.current = "open";
        acceptBrowserFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) acceptBrowserFile(file);
          event.target.value = "";
        }}
      />
      <header className="titlebar">
        <div className="title-brand">
          <BrandIcon size={26} />
          <span>
            OpenPDF <b>Studio</b>
          </span>
        </div>
        <DocumentTabs
          documents={state.documents}
          activeId={state.activeId}
          disabled={
            !!busy ||
            !!settings ||
            !!modal ||
            !!editor ||
            details ||
            analysis ||
            !!imageEditor ||
            signatureModalOpen ||
            !!toolsOpen ||
            !!markupConverter ||
            !!unlockFile
          }
          onSelect={activateDocument}
          onClose={closeDocument}
          onNew={() => activateDocument(null)}
        />
        <div className="title-actions">
          {revision && (
            <IconButton
              label="Document details"
              onClick={() => setDetails(true)}
            >
              <Info size={16} />
            </IconButton>
          )}
          <IconButton
            label={dark ? "Use light appearance" : "Use dark appearance"}
            onClick={() =>
              updatePreferences({ appearance: dark ? "light" : "dark" })
            }
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettings("general")}>
            <Settings2 size={17} />
          </IconButton>
        </div>
      </header>

      {revision ? (
        <>
          <div className="main-toolbar">
            <div className="toolbar-side">
              <IconButton
                label={sidebar ? "Hide sidebar" : "Show sidebar"}
                onClick={() => setSidebar(!sidebar)}
              >
                {sidebar ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </IconButton>
              <span className="divider" />
              <IconButton
                label="Analyze document"
                disabled={!!busy}
                onClick={() => setAnalysis(true)}
              >
                <FileSearch size={17} />
              </IconButton>
              <button
                className="text-button tools-button"
                disabled={!!busy}
                onClick={() => setToolsOpen("split")}
              >
                <Braces size={16} /> PDF Tools
              </button>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => chooseFile()}
              >
                <FolderOpen size={16} /> Open
              </button>
            </div>
            <div
              className="mode-switch"
              role="group"
              aria-label="Workspace mode"
            >
              {(["read", "annotate", "organize"] as const).map((item) => (
                <button
                  key={item}
                  className={mode === item ? "selected" : ""}
                  aria-pressed={mode === item}
                  onClick={() => {
                    setMode(item);
                    if (item !== "annotate") setTool("select");
                  }}
                >
                  {item === "read" ? (
                    <FileText size={15} />
                  ) : item === "annotate" ? (
                    <PenLine size={15} />
                  ) : (
                    <Grid2X2 size={15} />
                  )}
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
            <div className="toolbar-side right">
              <IconButton
                label="Undo"
                disabled={!!busy || state.cursor <= 0}
                onClick={state.undo}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                label="Redo"
                disabled={!!busy || state.cursor >= state.revisions.length - 1}
                onClick={state.redo}
              >
                <Redo2 size={17} />
              </IconButton>
              <span className="divider" />
              <button
                className="primary small"
                disabled={!!busy}
                onClick={() => commands.current("save")}
              >
                <Save size={15} /> Save
              </button>
              <IconButton
                label="Save As"
                disabled={!!busy}
                onClick={() => commands.current("save-as")}
              >
                <Download size={17} />
              </IconButton>
            </div>
          </div>
          {mode === "annotate" ? (
            <div className="context-toolbar">
              <div
                className="annotation-tools"
                role="toolbar"
                aria-label="Annotation tools"
              >
                {[
                  { label: "Selection", ids: ["select"] },
                  {
                    label: "Text markup",
                    ids: ["Highlight", "Underline", "StrikeOut"],
                  },
                  {
                    label: "Drawing and shapes",
                    ids: ["Ink", "Square", "Circle", "Line"],
                  },
                  {
                    label: "Text, notes and signatures",
                    ids: ["FreeText", "Text", "Stamp"],
                  },
                ].map((group) => (
                  <div
                    className="annotation-tool-group"
                    role="group"
                    aria-label={group.label}
                    key={group.label}
                  >
                    {tools
                      .filter((item) => group.ids.includes(item.id))
                      .map(({ id, label, icon: Icon }) => (
                        <IconButton
                          key={id}
                          label={label}
                          active={tool === id}
                          disabled={!canEdit}
                          onClick={() => {
                            if (id === "Stamp") setSignatureModalOpen(true);
                            else setTool(id);
                          }}
                        >
                          <Icon size={17} />
                        </IconButton>
                      ))}
                  </div>
                ))}
              </div>
              <span className="divider" />
              <div className="swatches">
                {colors.map((swatch) => (
                  <button
                    key={swatch}
                    className={`swatch ${color === swatch ? "selected" : ""}`}
                    style={{ background: swatch }}
                    title={`Color ${swatch}`}
                    aria-label={`Color ${swatch}`}
                    onClick={() => setColor(swatch)}
                  >
                    {color === swatch && <Check size={12} />}
                  </button>
                ))}
              </div>
              <select
                aria-label="Stroke width"
                value={stroke}
                onChange={(event) => setStroke(Number(event.target.value))}
              >
                <option value={1}>1 pt</option>
                <option value={2}>2 pt</option>
                <option value={3}>3 pt</option>
                <option value={5}>5 pt</option>
              </select>
              <span className="context-hint">
                {tools.find((item) => item.id === tool)?.hint}
              </span>
            </div>
          ) : mode === "organize" ? (
            <div className="context-toolbar organize-toolbar">
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() => chooseFile("merge")}
              >
                <FilePlus2 size={16} /> Add PDF
              </button>
              <span className="divider" />
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() =>
                  applyEdit({ type: "rotate", page, angle: 90 }, "Rotate page")
                }
              >
                <RotateCw size={16} /> Rotate
              </button>
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() =>
                  applyEdit(
                    { type: "duplicate", page },
                    "Duplicate page",
                    page + 1,
                  )
                }
              >
                <Copy size={16} /> Duplicate
              </button>
              <button
                className="text-button"
                disabled={!canEdit || count < 2}
                onClick={() => setModal({ kind: "delete" })}
              >
                <Trash2 size={16} /> Delete
              </button>
              <span className="divider" />
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() => setModal({ kind: "extract" })}
              >
                <Download size={16} /> Extract
              </button>
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() => setModal({ kind: "split" })}
              >
                <Scissors size={16} /> Split
              </button>
              <button
                className="text-button"
                disabled={!canEdit}
                onClick={() => setToolsOpen("mix")}
              >
                <Braces size={16} /> All tools
              </button>
              <span className="context-hint">Drag pages to reorder</span>
            </div>
          ) : null}
          <div className="workspace">
            {sidebar && (
              <aside className="sidebar">
                <div className="sidebar-tabs">
                  {(["pages", "contents", "search", "notes"] as const).map(
                    (item) => (
                      <button
                        key={item}
                        className={tab === item ? "selected" : ""}
                        onClick={() => setTab(item)}
                        aria-label={
                          item === "search"
                            ? "Search document"
                            : item === "notes"
                              ? "Annotations"
                              : item === "contents"
                                ? "Table of contents"
                                : "Pages"
                        }
                      >
                        {item === "pages" ? (
                          <Grid2X2 size={16} />
                        ) : item === "search" ? (
                          <Search size={16} />
                        ) : item === "contents" ? (
                          <BookOpen size={16} />
                        ) : (
                          <MessageSquare size={16} />
                        )}
                      </button>
                    ),
                  )}
                </div>
                <div className="sidebar-heading">
                  <h2>
                    {tab === "pages"
                      ? "Pages"
                      : tab === "search"
                        ? "Find in document"
                        : tab === "contents"
                          ? "Contents"
                          : "Annotations"}
                  </h2>
                  <span>
                    {tab === "pages"
                      ? count
                      : tab === "notes"
                        ? revision.info.pages.reduce(
                            (sum, page) => sum + page.annotations.length,
                            0,
                          )
                        : tab === "contents"
                          ? revision.info.outline.length
                          : "⌘ F"}
                  </span>
                </div>
                {tab === "pages" ? (
                  <>
                    <div className="thumbnail-list">
                      {pdf &&
                        revision.info.pages.map((info, index) => (
                          <button
                            key={`${revision.id}-${index}`}
                            className={`thumbnail ${page === index ? "selected" : ""}`}
                            aria-label={`Go to page ${index + 1}`}
                            aria-current={page === index ? "page" : undefined}
                            draggable={canEdit}
                            onDragStart={() => {
                              dragPage.current = index;
                            }}
                            onDragOver={(event) => {
                              if (dragPage.current !== null)
                                event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (dragPage.current !== null)
                                movePage(dragPage.current, index);
                              dragPage.current = null;
                            }}
                            onDragEnd={() => {
                              dragPage.current = null;
                            }}
                            onClick={() => setPage(index)}
                          >
                            <div className="thumbnail-paper">
                              <PDFPage
                                pdf={pdf}
                                pageNumber={index + 1}
                                scale={128 / info.width}
                                thumbnail
                              />
                            </div>
                            <span className="thumbnail-number">
                              {index + 1}
                              {info.annotations.length > 0 && (
                                <span className="annotation-dot" />
                              )}
                            </span>
                          </button>
                        ))}
                    </div>
                    <div className="sidebar-bottom">
                      <button
                        className="text-button"
                        disabled={!canEdit}
                        onClick={() => chooseFile("merge")}
                      >
                        <Plus size={15} /> Add pages
                      </button>
                      <IconButton
                        label="Organize pages"
                        onClick={() => setMode("organize")}
                      >
                        <Grid2X2 size={16} />
                      </IconButton>
                    </div>
                  </>
                ) : tab === "contents" ? (
                  <DocumentOutline
                    entries={revision.info.outline}
                    notice={revision.info.outlineNotice}
                    page={page}
                    onNavigate={showPage}
                  />
                ) : tab === "search" ? (
                  <div className="search-panel">
                    <div className="search-field">
                      <Search size={15} />
                      <input
                        ref={searchInput}
                        placeholder="Search this PDF"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && results.length)
                            showPage(
                              results.find((result) => result.page > page)
                                ?.page ?? results[0].page,
                            );
                        }}
                      />
                      {search && (
                        <button
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <p className="subtle">
                      {searching
                        ? "Searching pages…"
                        : search
                          ? `${results.reduce((sum, result) => sum + result.count, 0)} matches in ${results.length} pages`
                          : "Find a word or phrase in your document."}
                    </p>
                    {results.map((result) => (
                      <button
                        className={`search-result ${page === result.page ? "selected" : ""}`}
                        key={result.page}
                        onClick={() => showPage(result.page)}
                      >
                        <b>
                          Page {result.page + 1}
                          <span>{result.count}</span>
                        </b>
                        <p>…{result.snippet}…</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="notes-panel">
                    {revision.info.pages.every(
                      (page) => !page.annotations.length,
                    ) ? (
                      <div className="empty-notes">
                        <MessageSquare size={25} />
                        <h3>A little room for thought.</h3>
                        <p>
                          Your highlights, notes, and drawings will appear here.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setMode("annotate");
                            setTool("Text");
                          }}
                        >
                          Add your first note <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : (
                      revision.info.pages.flatMap((info, index) =>
                        info.annotations.map((annotation) => (
                          <div
                            className="note-card"
                            key={`${index}-${annotation.id}`}
                          >
                            <button
                              className="note-main"
                              onClick={() => showPage(index)}
                            >
                              <span className="note-type">
                                <i
                                  className="note-color"
                                  style={{
                                    background: annotationHex(annotation.color),
                                  }}
                                />
                                <MessageSquare size={13} />
                                {annotationName(annotation.type)}
                                {annotation.locked && <LockKeyhole size={11} />}
                                <small>p. {index + 1}</small>
                              </span>
                              <p>
                                {annotation.contents || "Drawing annotation"}
                              </p>
                            </button>
                            <div className="note-actions">
                              <IconButton
                                label={`Edit annotation ${annotation.id + 1} on page ${index + 1}`}
                                disabled={!canEdit || !annotation.editable}
                                onClick={() =>
                                  setEditor({
                                    annotation,
                                    page: index,
                                    revisionId: revision.id,
                                  })
                                }
                              >
                                <Pencil size={13} />
                              </IconButton>
                              <IconButton
                                label={`Delete annotation ${annotation.id + 1} on page ${index + 1}`}
                                disabled={!canEdit || annotation.locked}
                                onClick={() =>
                                  applyEdit(
                                    {
                                      type: "remove-annotation",
                                      page: index,
                                      id: annotation.id,
                                    },
                                    "Remove annotation",
                                  )
                                }
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            </div>
                          </div>
                        )),
                      )
                    )}
                  </div>
                )}
              </aside>
            )}
            <main
              className={`document-area ${mode === "organize" ? "organizer" : ""}`}
              ref={viewport}
              aria-label="PDF workspace"
            >
              {mode === "organize" ? (
                <>
                  <div className="organizer-heading">
                    <div>
                      <span className="eyebrow">THE BIG PICTURE</span>
                      <h1>A place for every page.</h1>
                      <p>Select a page to edit it. Drag to rearrange.</p>
                    </div>
                    <span className="pill">{count} pages</span>
                  </div>
                  <div className="page-grid">
                    {pdf &&
                      revision.info.pages.map((info, index) => (
                        <div
                          className={`page-card ${page === index ? "selected" : ""}`}
                          key={`${revision.id}-${index}`}
                        >
                          <button
                            className="grid-page"
                            aria-label={`Select page ${index + 1}`}
                            draggable={canEdit}
                            onDragStart={() => {
                              dragPage.current = index;
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (dragPage.current !== null)
                                movePage(dragPage.current, index);
                              dragPage.current = null;
                            }}
                            onDragEnd={() => {
                              dragPage.current = null;
                            }}
                            onClick={() => setPage(index)}
                            onDoubleClick={() => showPage(index)}
                          >
                            <PDFPage
                              pdf={pdf}
                              pageNumber={index + 1}
                              scale={180 / info.width}
                              thumbnail
                            />
                          </button>
                          <div className="page-card-footer">
                            <span>Page {index + 1}</span>
                            <div>
                              <IconButton
                                label={`Move page ${index + 1} left`}
                                disabled={!canEdit || index === 0}
                                onClick={() => movePage(index, index - 1)}
                              >
                                <ArrowLeft size={13} />
                              </IconButton>
                              <IconButton
                                label={`Move page ${index + 1} right`}
                                disabled={!canEdit || index === count - 1}
                                onClick={() => movePage(index, index + 1)}
                              >
                                <ArrowRight size={13} />
                              </IconButton>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="page-stage">
                  {pdf ? (
                    <PDFPage
                      key={page}
                      pdf={pdf}
                      pageNumber={page + 1}
                      scale={scale}
                      revisionId={revision.id}
                      sourceRevisionId={pdfRevisionId}
                      disabled={!!busy}
                      tool={busy ? "select" : tool}
                      color={color}
                      stroke={stroke}
                      search={search}
                      annotations={pageInfo?.annotations || []}
                      selectedAnnotationId={selectedAnnotationId}
                      onSelectAnnotation={setSelectedAnnotationId}
                      onUpdateAnnotationRect={handleUpdateAnnotationRect}
                      onEditAnnotation={handleEditAnnotation}
                      onAnnotate={addAnnotation}
                      onText={handleText}
                      onStamp={handleStamp}
                      onError={reportError}
                    />
                  ) : (
                    <div className="loading-document">
                      <span className="spinner" />
                      <span>Preparing document…</span>
                    </div>
                  )}
                  <div className="page-caption">
                    {page + 1} <span>/</span> {count}
                  </div>
                </div>
              )}
            </main>
          </div>
          <footer className="statusbar">
            <div className="status-left">
              <span className={`status-dot ${dirty ? "unsaved" : ""}`} />
              <span>
                {busy || (dirty ? "Unsaved changes" : "All changes saved")}
              </span>
              <span className="status-size">
                {(revision.bytes.length / 1024).toFixed(0)} KB
              </span>
            </div>
            <div className="page-navigation">
              <IconButton
                label="Previous page"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} />
              </IconButton>
              <span>
                Page{" "}
                <input
                  aria-label="Page number"
                  type="number"
                  min={1}
                  max={count}
                  value={page + 1}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (next >= 1 && next <= count) setPage(next - 1);
                  }}
                />{" "}
                of {count}
              </span>
              <IconButton
                label="Next page"
                disabled={page >= count - 1}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={16} />
              </IconButton>
            </div>
            <div className="zoom-controls">
              <IconButton
                label="Zoom out"
                onClick={() => commands.current("zoom-out")}
              >
                <Minus size={15} />
              </IconButton>
              <button
                className="zoom-value"
                onClick={() => {
                  setScaleMode("manual");
                  setZoom(1);
                }}
              >
                {Math.round(scale * 100)}%
              </button>
              <IconButton
                label="Zoom in"
                onClick={() => commands.current("zoom-in")}
              >
                <Plus size={15} />
              </IconButton>
              <span className="divider" />
              <select
                aria-label="Page fit"
                value={scaleMode}
                onChange={(event) => {
                  setScaleMode(event.target.value as typeof scaleMode);
                  setZoom(scale);
                }}
              >
                <option value="page">Fit page</option>
                <option value="width">Fit width</option>
                <option value="manual">Custom</option>
              </select>
              <IconButton
                label="Full screen"
                onClick={() =>
                  window.desktop
                    ? window.desktop.fullscreen()
                    : document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen()
                }
              >
                <Maximize size={15} />
              </IconButton>
            </div>
          </footer>
        </>
      ) : (
        <main className="welcome">
          <div className="welcome-content">
            <div className="welcome-copy">
              <div className="welcome-identity">
                <BrandIcon size={62} />
                <span>
                  OPENPDF STUDIO<small>A little more room to work.</small>
                </span>
              </div>
              <h1>
                Your PDFs.
                <br />
                <em>On your terms.</em>
              </h1>
              <p>
                A thoughtful space to read, annotate, and bring your documents
                together. No accounts. No uploads. Just you and the page.
              </p>
              <button
                className="primary open-large"
                disabled={!!busy}
                onClick={() => chooseFile()}
              >
                <FolderOpen size={19} /> Open a PDF <kbd>⌘ O</kbd>
              </button>
              <span className="drop-hint">or drop a document anywhere</span>
              <div className="welcome-converters" aria-label="Convert to PDF">
                <button disabled={!!busy} onClick={convertImages}>
                  <FilePlus2 size={17} />
                  <span>
                    <strong>Images to PDF</strong>
                    PNG or JPEG · original pixels
                  </span>
                </button>
                <button disabled={!!busy} onClick={convertPresentation}>
                  <FileText size={17} />
                  <span>
                    <strong>PowerPoint to PDF</strong>PPT or PPTX · local
                    conversion
                  </span>
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => openToolWithPDF("pptx")}
                >
                  <FileOutput size={17} />
                  <span>
                    <strong>PDF to PowerPoint</strong>One page image per slide
                  </span>
                </button>
                <button disabled={!!busy} onClick={convertWord}>
                  <FileText size={17} />
                  <span>
                    <strong>Word to PDF</strong>
                    DOC or DOCX · local conversion
                  </span>
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => openToolWithPDF("docx")}
                >
                  <FileOutput size={17} />
                  <span>
                    <strong>PDF to Word</strong>
                    Exact layout or editable text
                  </span>
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => setMarkupConverter("markdown")}
                >
                  <BookOpen size={17} />
                  <span>
                    <strong>Markdown to PDF</strong>
                    Polished A4 publishing
                  </span>
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => setMarkupConverter("latex")}
                >
                  <Braces size={17} />
                  <span>
                    <strong>LaTeX to PDF</strong>
                    Native TeX with offline fallback
                  </span>
                </button>
                <button disabled={!!busy} onClick={chooseProtectedPDF}>
                  <LockKeyhole size={17} />
                  <span>
                    <strong>Unlock PDF</strong>
                    Save a password-free copy
                  </span>
                </button>
              </div>
              <button
                className="sample-button"
                disabled={!!busy}
                onClick={() =>
                  void perform("Creating sample PDF…", async () => {
                    const result = await pdfEngine.sample();
                    openDocument(
                      result.bytes,
                      result.info,
                      "Field Notes.pdf",
                      null,
                    );
                  })
                }
              >
                Take a look around <ArrowUpRight size={15} />
                <span>Open a sample document</span>
              </button>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="paper-back" />
              <div className="paper-front">
                <div className="paper-top">
                  <span>FIELD NOTES</span>
                  <span>01 / 04</span>
                </div>
                <div className="paper-title">
                  A little less
                  <br />
                  friction.
                  <br />
                  <em>
                    A little more
                    <br />
                    focus.
                  </em>
                </div>
                <div className="paper-rule" />
                <div className="fake-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="paper-annotation">
                  good things
                  <br />
                  start here <ArrowUpRight size={25} />
                </div>
                <div className="paper-foot">A FRESH PERSPECTIVE</div>
              </div>
              <div className="art-label">
                <ShieldCheck size={16} />
                <span>Stays on your Mac.</span>
              </div>
            </div>
          </div>
          <div className="welcome-bottom">
            {recents.length ? (
              <div className="recent-section">
                <div className="recent-header">
                  <h2>Pick up where you left off</h2>
                  <span>Recent documents</span>
                </div>
                <div className="recent-list">
                  {recents.slice(0, 3).map((file) => (
                    <button
                      key={file.id}
                      disabled={!!busy}
                      onClick={() =>
                        void perform("Opening recent PDF…", async () =>
                          loadFile(await window.desktop!.openRecent(file.id)),
                        )
                      }
                    >
                      <div className="recent-file-icon">
                        <FileText size={20} />
                      </div>
                      <div>
                        <strong>{file.name}</strong>
                        <span>
                          {new Date(file.date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="feature-strip">
                <div>
                  <FileText size={19} />
                  <span>
                    <strong>Read without distractions</strong>
                    <small>Search, select, and find your focus.</small>
                  </span>
                </div>
                <div>
                  <PenLine size={19} />
                  <span>
                    <strong>Make your mark</strong>
                    <small>Highlights, drawings, and little notes.</small>
                  </span>
                </div>
                <div>
                  <Grid2X2 size={19} />
                  <span>
                    <strong>Bring it all together</strong>
                    <small>Arrange, merge, and split your pages.</small>
                  </span>
                </div>
              </div>
            )}
            <div className="welcome-footer">
              <span>OPEN SOURCE. OPEN POSSIBILITIES.</span>
              <span>
                Made for your Mac <span className="footer-dot">·</span> Version{" "}
                {APP_VERSION}
              </span>
            </div>
          </div>
        </main>
      )}
      {editor && (
        <AnnotationEditor
          key={`${editor.revisionId}:${editor.page}:${editor.annotation.id}`}
          annotation={editor.annotation}
          page={editor.page}
          onClose={() => setEditor(null)}
          onSave={saveAnnotation}
        />
      )}
      {details && revision && (
        <DocumentDetails
          info={revision.info}
          name={state.name}
          bytes={revision.bytes.length}
          dirty={dirty}
          page={page}
          onClose={() => setDetails(false)}
        />
      )}
      {analysis && revision && (
        <DocumentAnalysis
          bytes={revision.bytes}
          name={state.name}
          onClose={() => setAnalysis(false)}
        />
      )}
      {settings && (
        <Settings
          key={settings}
          initialSection={settings}
          onClose={() => setSettings(null)}
          recentCount={recents.length}
          clearRecents={async () => {
            await window.desktop?.clearRecents();
            setRecents([]);
          }}
        />
      )}
      {toolsOpen && revision && (
        <PDFTools
          bytes={revision.bytes}
          name={state.name}
          info={revision.info}
          initialTool={toolsOpen}
          onClose={() => setToolsOpen(null)}
          onReplace={(result, label) => {
            state.commit(result.bytes, result.info, label);
            setPage(0);
          }}
          notify={notify}
        />
      )}
      {markupConverter && (
        <MarkupConverter
          initialFormat={markupConverter}
          onClose={() => setMarkupConverter(null)}
          onConverted={loadFile}
        />
      )}
      {unlockFile && (
        <UnlockPDF
          file={unlockFile}
          onClose={() => setUnlockFile(null)}
          onUnlocked={loadFile}
        />
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <Info size={18} />
          <span>{error}</span>
          <IconButton label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {signatureModalOpen && (
        <SignatureModal
          onSelect={(sig) => {
            setSignatureModalOpen(false);
            handleSignatureSelect(sig);
          }}
          onClose={() => {
            setSignatureModalOpen(false);
            setPendingStampRect(null);
          }}
        />
      )}
      {imageEditor && (
        <ImagePDFEditor
          initialImages={imageEditor}
          onAdd={chooseImagesForPDF}
          onCancel={() => setImageEditor(null)}
          onConvert={finishImageConversion}
        />
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={38} />
          <h2>Drop your PDF here.</h2>
          <p>Your document stays on this device.</p>
        </div>
      )}
      <dialog
        ref={dialog}
        className="modal"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
      >
        <form onSubmit={submitModal}>
          <div className="modal-heading">
            <div className="modal-icon">
              {modal?.kind === "text" ? (
                <MessageSquare size={23} />
              ) : modal?.kind === "delete" ? (
                <Trash2 size={23} />
              ) : modal?.kind === "about" ? (
                <FileText size={23} />
              ) : (
                <Scissors size={23} />
              )}
            </div>
            <IconButton label="Close dialog" onClick={() => setModal(null)}>
              <X size={18} />
            </IconButton>
          </div>
          <h2>
            {modal?.kind === "text"
              ? modal.type === "Text"
                ? "Leave a little note."
                : "Put it into words."
              : modal?.kind === "delete"
                ? `Delete page ${page + 1}?`
                : modal?.kind === "extract"
                  ? "Take the pages you need."
                  : modal?.kind === "split"
                    ? "A PDF for every page."
                    : "OpenPDF Studio"}
          </h2>
          {modal?.kind === "text" ? (
            <>
              <p>
                {modal.type === "Text"
                  ? "Your note will travel with the PDF."
                  : "This text will be placed onto the page. The original document stays unchanged."}
              </p>
              <textarea
                ref={textInput}
                aria-label="Annotation text"
                autoFocus
                rows={4}
                defaultValue=""
                placeholder={
                  modal.type === "Text"
                    ? "A thought worth keeping…"
                    : "Type your text here…"
                }
                maxLength={5000}
              />
              {modal.type === "FreeText" && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginTop: "12px",
                    alignItems: "center",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    Size:
                    <select
                      value={textModalFontSize}
                      onChange={(e) => setTextModalFontSize(e.target.value)}
                      aria-label="Font size"
                    >
                      {[10, 12, 14, 16, 18, 24, 32].map((sz) => (
                        <option key={sz} value={String(sz)}>
                          {sz} pt{sz === 14 ? " (Default)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    Font:
                    <select
                      value={textModalFont}
                      onChange={(e) => setTextModalFont(e.target.value)}
                      aria-label="Font family"
                    >
                      <option value="Helv">Helvetica / Sans</option>
                      <option value="Cour">Courier / Mono</option>
                      <option value="Times">Times / Serif</option>
                    </select>
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginLeft: "auto",
                    }}
                  >
                    <span style={{ fontSize: "13px" }}>Color:</span>
                    <div className="swatches">
                      {TEXT_COLORS.map((swatch, i) => (
                        <button
                          key={swatch}
                          type="button"
                          className={`swatch ${textModalColor === swatch ? "selected" : ""}`}
                          style={{ background: swatch }}
                          title={TEXT_COLOR_NAMES[i]}
                          aria-label={TEXT_COLOR_NAMES[i]}
                          onClick={() => setTextModalColor(swatch)}
                        >
                          {textModalColor === swatch && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-modal-background">
                    <span>Background:</span>
                    <div className="background-colors">
                      {TEXT_BACKGROUND_COLORS.map((swatch, index) => (
                        <button
                          key={swatch}
                          type="button"
                          className={swatch === "none" ? "no-fill" : ""}
                          aria-label={`${TEXT_BACKGROUND_NAMES[index]} background`}
                          aria-pressed={textModalFill === swatch}
                          style={
                            swatch === "none"
                              ? undefined
                              : { background: swatch }
                          }
                          onClick={() => setTextModalFill(swatch)}
                        >
                          {swatch === "none" ? (
                            <X size={12} />
                          ) : (
                            textModalFill === swatch && <Check size={12} />
                          )}
                        </button>
                      ))}
                      <input
                        type="color"
                        aria-label="Custom text box background"
                        value={
                          textModalFill === "none" ? "#ffffff" : textModalFill
                        }
                        onChange={(event) =>
                          setTextModalFill(event.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : modal?.kind === "delete" ? (
            <p>
              This removes the page from your document. You can undo it before
              closing.
            </p>
          ) : modal?.kind === "extract" ? (
            <>
              <p>
                Enter page numbers or ranges. Your original document stays
                unchanged.
              </p>
              <label>
                Pages
                <input
                  aria-label="Pages to extract"
                  autoFocus
                  placeholder="1, 3-5"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              </label>
              <small>{count} pages in this document</small>
            </>
          ) : modal?.kind === "split" ? (
            <p>
              Export {count} separate PDFs into a new folder. Your original
              document stays unchanged.
            </p>
          ) : (
            <>
              <p>
                A local PDF workspace for Mac. Read, annotate, organize, and
                save without uploading your documents.
              </p>
              <div className="about-details">
                <span>Version {APP_VERSION} · Early release</span>
                <span>React · PDF.js · MuPDF · Electron</span>
                <span>AGPL-3.0-only · No telemetry</span>
              </div>
              <p className="subtle">
                Local Apple Vision OCR supports up to 100 selected pages per
                run. This release fills existing forms and unlocks protected
                copies, but does not edit existing page text or create
                cryptographic signatures. Saves can invalidate existing
                signatures. Documents: up to 50 MB / 500 pages.
              </p>
            </>
          )}
          {modalError && (
            <p className="modal-error" role="alert">
              {modalError}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setModal(null)}
            >
              {modal?.kind === "about" ? "Back to work" : "Cancel"}
            </button>
            {modal?.kind !== "about" && (
              <button
                type="submit"
                className={`primary ${modal?.kind === "delete" ? "danger" : ""}`}
              >
                {modal?.kind === "text"
                  ? "Add to document"
                  : modal?.kind === "delete"
                    ? "Delete page"
                    : "Export PDFs"}
              </button>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}
