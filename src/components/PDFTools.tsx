import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Braces,
  Crop,
  FileImage,
  FileOutput,
  FileLock2,
  Files,
  FlipHorizontal2,
  FormInput,
  Hash,
  ImageDown,
  KeyRound,
  LayoutGrid,
  Layers3,
  Scissors,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { pdfEngine, type PDFResult } from "../core/client";
import type {
  DocumentInfo,
  FormField,
  MetadataInput,
  PrivacyReport,
} from "../types";
import { IconButton } from "./Button";

type ToolId =
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
  | "compress"
  | "page-images"
  | "encrypt"
  | "flatten"
  | "crop"
  | "privacy";

const tools: {
  id: ToolId;
  title: string;
  detail: string;
  icon: typeof Files;
}[] = [
  {
    id: "compress",
    title: "Compress PDF",
    detail: "Clean and optimize document structure",
    icon: Archive,
  },
  {
    id: "page-images",
    title: "PDF to Images",
    detail: "PNG or JPEG up to 600 DPI",
    icon: ImageDown,
  },
  {
    id: "encrypt",
    title: "Protect PDF",
    detail: "AES-256 password encryption",
    icon: FileLock2,
  },
  {
    id: "flatten",
    title: "Flatten PDF",
    detail: "Bake forms and annotations into pages",
    icon: Layers3,
  },
  {
    id: "crop",
    title: "Crop & Resize",
    detail: "Trim margins or standardize page size",
    icon: Crop,
  },
  {
    id: "privacy",
    title: "Privacy Scanner",
    detail: "Find hidden metadata and active content",
    icon: ShieldCheck,
  },
  {
    id: "split",
    title: "Split",
    detail: "Pages, size, halves, chapters or text",
    icon: Scissors,
  },
  {
    id: "mix",
    title: "Alternate & Mix",
    detail: "Interleave two PDFs in either order",
    icon: Files,
  },
  {
    id: "sheet",
    title: "Pages per sheet",
    detail: "2, 4, 6 or 9 pages on one sheet",
    icon: LayoutGrid,
  },
  {
    id: "mirror",
    title: "Flip & Mirror",
    detail: "Horizontal, vertical or both",
    icon: FlipHorizontal2,
  },
  {
    id: "form",
    title: "Fill PDF Form",
    detail: "Complete text, choice and button fields",
    icon: FormInput,
  },
  {
    id: "metadata",
    title: "Edit Metadata",
    detail: "Title, author, subject and keywords",
    icon: Settings2,
  },
  {
    id: "bates",
    title: "Bates Numbering",
    detail: "Case-ready page identifiers",
    icon: Hash,
  },
  {
    id: "images",
    title: "Extract Images",
    detail: "Save original embedded artwork as PNG",
    icon: FileImage,
  },
  {
    id: "unlock",
    title: "Unlock PDF",
    detail: "Remove password encryption from a copy",
    icon: KeyRound,
  },
  {
    id: "docx",
    title: "PDF to DOCX",
    detail: "Exact layout or editable text",
    icon: FileOutput,
  },
];

type Props = {
  bytes: Uint8Array;
  name: string;
  info: DocumentInfo;
  initialTool?: ToolId;
  onClose(): void;
  onReplace(result: PDFResult, label: string): void;
  notify(message: string): void;
};

export function PDFTools({
  bytes,
  name,
  info,
  initialTool,
  onClose,
  onReplace,
  notify,
}: Props) {
  const [active, setActive] = useState<ToolId | null>(initialTool ?? null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [splitMode, setSplitMode] = useState<
    "pages" | "size" | "half" | "chapter" | "text"
  >("pages");
  const [splitValue, setSplitValue] = useState("1");
  const [sheet, setSheet] = useState<2 | 4 | 6 | 9>(4);
  const [mirror, setMirror] = useState<"horizontal" | "vertical" | "both">(
    "horizontal",
  );
  const [firstOrder, setFirstOrder] = useState(true);
  const [metadata, setMetadata] = useState<MetadataInput>({
    title: info.title,
    author: info.author,
    subject: info.subject,
    keywords: "",
    creator: info.creator,
  });
  const [bates, setBates] = useState({
    prefix: "BATES-",
    suffix: "",
    start: 1,
    digits: 6,
    position: "bottom-right" as const,
  });
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [docxMode, setDocxMode] = useState<"layout" | "editable">("layout");
  const [imageFormat, setImageFormat] = useState<"png" | "jpg">("png");
  const [imageDpi, setImageDpi] = useState(300);
  const [imageQuality, setImageQuality] = useState(92);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [cropMargin, setCropMargin] = useState(0);
  const [pageSize, setPageSize] = useState<"keep" | "a4" | "letter">("keep");
  const [privacy, setPrivacy] = useState<PrivacyReport | null>(null);

  const selected = useMemo(
    () => tools.find((tool) => tool.id === active),
    [active],
  );
  useEffect(() => {
    setError("");
    if (active !== "form" || fields) return;
    setBusy("Reading form fields…");
    void pdfEngine
      .formFields(bytes)
      .then((result) => {
        setFields(result);
        setFormValues(
          Object.fromEntries(result.map((field) => [field.id, field.value])),
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not read the form.",
        ),
      )
      .finally(() => setBusy(""));
  }, [active, bytes, fields]);
  useEffect(() => {
    if (active !== "privacy" || privacy) return;
    setError("");
    setBusy("Scanning locally…");
    void pdfEngine
      .scanPrivacy(bytes)
      .then(setPrivacy)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not scan this PDF.",
        ),
      )
      .finally(() => setBusy(""));
  }, [active, bytes, privacy]);

  const run = async (label: string, operation: () => Promise<void>) => {
    if (busy) return;
    setError("");
    setBusy(label);
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The tool could not finish.",
      );
    } finally {
      setBusy("");
    }
  };
  const replace = (result: PDFResult, label: string) => {
    onReplace(result, label);
    notify(`${label} applied. Save the PDF to keep it.`);
    onClose();
  };

  const execute = () => {
    if (!active) return;
    void run(`Running ${selected?.title ?? "tool"}…`, async () => {
      if (active === "compress") {
        const result = await pdfEngine.optimize(bytes);
        const saved = Math.max(0, bytes.byteLength - result.bytes.byteLength);
        replace(result, "Compress PDF");
        if (saved > 0)
          notify(`Optimized PDF · ${(saved / 1024).toFixed(0)} KB removed.`);
      } else if (active === "page-images") {
        const files = await pdfEngine.renderImages(
          bytes,
          name,
          imageFormat,
          imageDpi,
          imageQuality,
        );
        if (!(await window.desktop?.exportFiles(files))) return;
        notify(`${files.length} high-quality page images exported.`);
        onClose();
      } else if (active === "encrypt") {
        if (password !== passwordConfirm)
          throw new Error("The passwords do not match.");
        if (!window.desktop)
          throw new Error("Encrypted export is available in the Mac app.");
        const encrypted = await pdfEngine.encrypt(bytes, password);
        const result = await window.desktop.save(
          encrypted,
          null,
          `${name.replace(/\.pdf$/i, "")} Protected.pdf`,
          true,
        );
        if (!result) return;
        notify("AES-256 encrypted copy saved.");
        onClose();
      } else if (active === "flatten") {
        replace(await pdfEngine.flatten(bytes), "Flatten PDF");
      } else if (active === "crop") {
        replace(
          await pdfEngine.cropResize(bytes, cropMargin, pageSize),
          "Crop and resize",
        );
      } else if (active === "privacy") {
        replace(await pdfEngine.cleanPrivacy(bytes), "Clean private data");
      } else if (active === "split") {
        const files = await pdfEngine.split(bytes, name, splitMode, splitValue);
        if (!(await window.desktop?.exportFiles(files))) return;
        notify(`${files.length} split PDFs exported.`);
        onClose();
      } else if (active === "mix") {
        const second = await window.desktop?.pickPDF();
        if (!second) return;
        replace(
          await pdfEngine.mix(bytes, second.bytes, firstOrder),
          "Alternate and mix",
        );
      } else if (active === "sheet") {
        replace(
          await pdfEngine.pagesPerSheet(bytes, sheet),
          `${sheet} pages per sheet`,
        );
      } else if (active === "mirror") {
        replace(await pdfEngine.mirror(bytes, mirror), `Mirror ${mirror}`);
      } else if (active === "form") {
        if (!fields?.length)
          throw new Error("This PDF has no fillable form fields.");
        replace(await pdfEngine.fillForm(bytes, formValues), "Fill PDF form");
      } else if (active === "metadata") {
        replace(await pdfEngine.metadata(bytes, metadata), "Edit metadata");
      } else if (active === "bates") {
        replace(await pdfEngine.bates(bytes, bates), "Add Bates numbering");
      } else if (active === "images") {
        const files = await pdfEngine.extractImages(bytes, name);
        if (!(await window.desktop?.exportFiles(files))) return;
        notify(
          `${files.length} embedded image${files.length === 1 ? "" : "s"} exported.`,
        );
        onClose();
      } else if (active === "unlock") {
        throw new Error(
          "This PDF is already open and unlocked. Use Unlock PDF on the home screen for a protected file.",
        );
      } else if (active === "docx") {
        if (!window.desktop)
          throw new Error("DOCX export is available in the Mac app.");
        const pages = await pdfEngine.docxPages(bytes, docxMode);
        if (await window.desktop.convertPDFToDocx(pages, name, docxMode)) {
          notify(
            docxMode === "layout"
              ? "Layout-accurate DOCX exported."
              : "Editable DOCX exported.",
          );
          onClose();
        }
      }
    });
  };

  const buttonLabel =
    active === "split" ||
    active === "images" ||
    active === "docx" ||
    active === "page-images" ||
    active === "encrypt"
      ? "Export"
      : active === "mix"
        ? "Choose second PDF"
        : active === "privacy"
          ? "Clean private data"
          : "Apply to PDF";

  return (
    <div className="overlay tools-overlay" role="presentation">
      <section
        className="tools-window"
        role="dialog"
        aria-modal="true"
        aria-label="PDF Tools"
      >
        <header className="tools-header">
          <div className="tools-brand">
            <Braces size={20} />
            <span>
              <small>LOCAL DOCUMENT LAB</small>
              <strong>PDF Tools</strong>
            </span>
          </div>
          <div className="tools-document">
            <BookOpen size={14} /> {name} · {info.pages.length} pages
          </div>
          <IconButton label="Close PDF Tools" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="tools-body">
          <aside className="tools-catalog" aria-label="Document tools">
            {tools.map(({ id, title, detail, icon: Icon }) => (
              <button
                key={id}
                className={active === id ? "active" : ""}
                onClick={() => setActive(id)}
              >
                <span className="tools-card-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
          </aside>
          <main className="tool-config">
            {!selected ? (
              <div className="tool-empty">
                <LayoutGrid size={34} />
                <h2>Everything your PDF needs.</h2>
                <p>Choose a local tool. Your document never leaves this Mac.</p>
              </div>
            ) : (
              <>
                <div className="tool-title">
                  <span className="tools-card-icon">
                    <selected.icon size={21} />
                  </span>
                  <div>
                    <small>PDF TOOL</small>
                    <h2>{selected.title}</h2>
                    <p>{selected.detail}</p>
                  </div>
                </div>
                <div className="tool-fields">
                  {active === "compress" && (
                    <p className="tool-note">
                      Rewrites the PDF with unused objects removed, fonts
                      subset, streams cleaned and lossless compression applied.
                      PDFs that are already optimized may stay near the same
                      size.
                    </p>
                  )}
                  {active === "page-images" && (
                    <>
                      <div className="tool-grid">
                        <label>
                          Image format
                          <select
                            value={imageFormat}
                            onChange={(e) =>
                              setImageFormat(e.target.value as "png" | "jpg")
                            }
                          >
                            <option value="png">PNG · lossless</option>
                            <option value="jpg">JPEG · smaller files</option>
                          </select>
                        </label>
                        <label>
                          Resolution
                          <select
                            value={imageDpi}
                            onChange={(e) =>
                              setImageDpi(Number(e.target.value))
                            }
                          >
                            {[144, 200, 300, 450, 600].map((dpi) => (
                              <option key={dpi} value={dpi}>
                                {dpi} DPI
                              </option>
                            ))}
                          </select>
                        </label>
                        {imageFormat === "jpg" && (
                          <label>
                            JPEG quality · {imageQuality}%
                            <input
                              type="range"
                              min="35"
                              max="100"
                              value={imageQuality}
                              onChange={(e) =>
                                setImageQuality(Number(e.target.value))
                              }
                            />
                          </label>
                        )}
                      </div>
                      <p className="tool-note">
                        Renders every visible page layer, form appearance and
                        annotation. PNG is best for text and diagrams; JPEG is
                        best for photo-heavy pages.
                      </p>
                    </>
                  )}
                  {active === "encrypt" && (
                    <>
                      <label>
                        Password
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </label>
                      <label>
                        Confirm password
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                        />
                      </label>
                      <p className="tool-note">
                        Saves a separate AES-256 encrypted copy. OpenPDF Studio
                        never stores or transmits the password.
                      </p>
                    </>
                  )}
                  {active === "flatten" && (
                    <p className="tool-note">
                      Permanently bakes annotations and form appearances into
                      each page. Flattened marks remain visible but can no
                      longer be selected or edited.
                    </p>
                  )}
                  {active === "crop" && (
                    <>
                      <label>
                        Trim from every edge · {cropMargin}%
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={cropMargin}
                          onChange={(e) =>
                            setCropMargin(Number(e.target.value))
                          }
                        />
                      </label>
                      <label>
                        Output page size
                        <select
                          value={pageSize}
                          onChange={(e) =>
                            setPageSize(e.target.value as typeof pageSize)
                          }
                        >
                          <option value="keep">Keep cropped dimensions</option>
                          <option value="a4">A4 · 210 × 297 mm</option>
                          <option value="letter">
                            US Letter · 8.5 × 11 in
                          </option>
                        </select>
                      </label>
                      <p className="tool-note">
                        Keeping dimensions preserves vectors and selectable
                        text. A4 and Letter create a high-resolution flattened
                        copy centered on the chosen paper size.
                      </p>
                    </>
                  )}
                  {active === "privacy" && privacy && (
                    <div className="privacy-report">
                      <div>
                        <strong>{privacy.metadata.length}</strong>
                        <span>metadata fields</span>
                      </div>
                      <div>
                        <strong>{privacy.embeddedFiles.length}</strong>
                        <span>embedded files</span>
                      </div>
                      <div>
                        <strong>{privacy.documentActions.length}</strong>
                        <span>document actions</span>
                      </div>
                      <div>
                        <strong>{privacy.externalLinks}</strong>
                        <span>external links</span>
                      </div>
                      <div>
                        <strong>{privacy.formFields}</strong>
                        <span>form fields</span>
                      </div>
                      <div>
                        <strong>{privacy.annotations}</strong>
                        <span>annotations</span>
                      </div>
                      <p className="tool-note">
                        Clean removes metadata, embedded files and
                        document-level actions. Links, annotations and forms are
                        reported but preserved so the document keeps working.
                      </p>
                    </div>
                  )}
                  {active === "split" && (
                    <>
                      <label>
                        Split method
                        <select
                          value={splitMode}
                          onChange={(e) =>
                            setSplitMode(e.target.value as typeof splitMode)
                          }
                        >
                          <option value="pages">Every N pages</option>
                          <option value="size">Maximum file size</option>
                          <option value="half">Two equal halves</option>
                          <option value="chapter">
                            PDF bookmarks / chapters
                          </option>
                          <option value="text">Before matching text</option>
                        </select>
                      </label>
                      {splitMode !== "half" && splitMode !== "chapter" && (
                        <label>
                          {splitMode === "pages"
                            ? "Pages per file"
                            : splitMode === "size"
                              ? "Maximum MB"
                              : "Text that starts a section"}
                          <input
                            value={splitValue}
                            onChange={(e) => setSplitValue(e.target.value)}
                          />
                        </label>
                      )}
                      <p className="tool-note">
                        Each result is named with its page range and exported
                        into one folder.
                      </p>
                    </>
                  )}
                  {active === "mix" && (
                    <>
                      <label>
                        First page comes from
                        <select
                          value={firstOrder ? "current" : "second"}
                          onChange={(e) =>
                            setFirstOrder(e.target.value === "current")
                          }
                        >
                          <option value="current">Current PDF</option>
                          <option value="second">Second PDF</option>
                        </select>
                      </label>
                      <p className="tool-note">
                        Pages alternate A1, B1, A2, B2. Extra pages are kept at
                        the end.
                      </p>
                    </>
                  )}
                  {active === "sheet" && (
                    <>
                      <label>
                        Pages on each sheet
                        <select
                          value={sheet}
                          onChange={(e) =>
                            setSheet(Number(e.target.value) as typeof sheet)
                          }
                        >
                          {[2, 4, 6, 9].map((n) => (
                            <option key={n} value={n}>
                              {n} pages
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="tool-note">
                        Creates print-ready A4 sheets at high resolution.
                        Annotations and form appearances are included.
                      </p>
                    </>
                  )}
                  {active === "mirror" && (
                    <>
                      <label>
                        Direction
                        <select
                          value={mirror}
                          onChange={(e) =>
                            setMirror(e.target.value as typeof mirror)
                          }
                        >
                          <option value="horizontal">Horizontal mirror</option>
                          <option value="vertical">Vertical flip</option>
                          <option value="both">Horizontal and vertical</option>
                        </select>
                      </label>
                      <p className="tool-note">
                        Produces a flattened visual copy so every layer,
                        annotation and form appearance flips together.
                      </p>
                    </>
                  )}
                  {active === "metadata" &&
                    (Object.keys(metadata) as (keyof MetadataInput)[]).map(
                      (key) => (
                        <label key={key}>
                          {key[0].toUpperCase() + key.slice(1)}
                          <input
                            value={metadata[key]}
                            onChange={(e) =>
                              setMetadata({
                                ...metadata,
                                [key]: e.target.value,
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                  {active === "bates" && (
                    <div className="tool-grid">
                      <label>
                        Prefix
                        <input
                          value={bates.prefix}
                          onChange={(e) =>
                            setBates({ ...bates, prefix: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Suffix
                        <input
                          value={bates.suffix}
                          onChange={(e) =>
                            setBates({ ...bates, suffix: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Starting number
                        <input
                          type="number"
                          min="0"
                          value={bates.start}
                          onChange={(e) =>
                            setBates({
                              ...bates,
                              start: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Digits
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={bates.digits}
                          onChange={(e) =>
                            setBates({
                              ...bates,
                              digits: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Position
                        <select
                          value={bates.position}
                          onChange={(e) =>
                            setBates({
                              ...bates,
                              position: e.target.value as typeof bates.position,
                            })
                          }
                        >
                          <option value="top-left">Top left</option>
                          <option value="top-right">Top right</option>
                          <option value="bottom-left">Bottom left</option>
                          <option value="bottom-right">Bottom right</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {active === "form" && (
                    <>
                      {fields?.length ? (
                        <div className="form-field-list">
                          {fields.map((field) => (
                            <label key={field.id}>
                              {field.label}
                              <small>
                                Page {field.page + 1} · {field.type}
                              </small>
                              {field.options.length ? (
                                <select
                                  disabled={field.readOnly}
                                  value={formValues[field.id] ?? ""}
                                  onChange={(e) =>
                                    setFormValues({
                                      ...formValues,
                                      [field.id]: e.target.value,
                                    })
                                  }
                                >
                                  {field.options.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                              ) : field.type === "button" ? (
                                <select
                                  disabled={field.readOnly}
                                  value={formValues[field.id] || "off"}
                                  onChange={(e) =>
                                    setFormValues({
                                      ...formValues,
                                      [field.id]: e.target.value,
                                    })
                                  }
                                >
                                  <option value="off">Unchecked</option>
                                  <option value="on">Checked</option>
                                </select>
                              ) : (
                                <input
                                  disabled={field.readOnly}
                                  type={
                                    field.type === "signature"
                                      ? "text"
                                      : undefined
                                  }
                                  value={formValues[field.id] ?? ""}
                                  onChange={(e) =>
                                    setFormValues({
                                      ...formValues,
                                      [field.id]: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      ) : (
                        !busy && (
                          <p className="tool-note">
                            No fillable fields were detected. You can still use
                            Add Text and Sign in the annotation workspace.
                          </p>
                        )
                      )}
                    </>
                  )}
                  {active === "images" && (
                    <p className="tool-note">
                      Embedded raster images are deduplicated and exported as
                      full-quality PNG files. Page screenshots are not
                      substituted.
                    </p>
                  )}
                  {active === "unlock" && (
                    <p className="tool-note">
                      This file is already unlocked. Close it and choose Unlock
                      PDF from the home screen to open a protected document with
                      its password and save an unencrypted copy.
                    </p>
                  )}
                  {active === "docx" && (
                    <>
                      <label>
                        Conversion mode
                        <select
                          value={docxMode}
                          onChange={(e) =>
                            setDocxMode(e.target.value as typeof docxMode)
                          }
                        >
                          <option value="layout">
                            Exact layout · page images
                          </option>
                          <option value="editable">
                            Editable text · flowing layout
                          </option>
                        </select>
                      </label>
                      <p className="tool-note">
                        Exact Layout preserves every pixel and page position.
                        Editable Text keeps selectable words and paragraph
                        breaks for rewriting.
                      </p>
                    </>
                  )}
                </div>
                {error && (
                  <p className="modal-error" role="alert">
                    {error}
                  </p>
                )}
                <footer className="tool-actions">
                  <button className="secondary" onClick={() => setActive(null)}>
                    All tools
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy || active === "unlock"}
                    onClick={execute}
                  >
                    {busy || buttonLabel}
                  </button>
                </footer>
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
