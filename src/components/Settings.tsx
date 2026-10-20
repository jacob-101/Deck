import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleHelp,
  HardDrive,
  Monitor,
  Moon,
  Palette,
  PenLine,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  ANNOTATION_COLORS,
  COLOR_NAMES,
  TEXT_COLORS,
  TEXT_COLOR_NAMES,
  usePreferences,
} from "../core/preferences";
import { APP_VERSION, BrandIcon } from "./Brand";
import { IconButton } from "./Button";

const sections = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "editing", label: "Annotations", icon: PenLine },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  { id: "about", label: "About", icon: CircleHelp },
] as const;
export type SettingsSection = (typeof sections)[number]["id"];

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {children}
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      className="setting-toggle"
      role="switch"
      aria-label={label}
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}

export function Settings({
  initialSection = "general",
  onClose,
  clearRecents,
  recentCount,
}: {
  initialSection?: SettingsSection;
  onClose: () => void;
  clearRecents: () => Promise<void>;
  recentCount: number;
}) {
  const { values, update, reset, storageError } = usePreferences();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [message, setMessage] = useState("");
  const [clearing, setClearing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const titles = {
    general: ["General", "Document view and keyboard shortcuts."],
    appearance: ["Appearance", "Theme, palette, and motion."],
    editing: ["Annotations", "Default annotation styles."],
    privacy: ["Privacy", "Storage and network access."],
    about: ["About", "Version and licenses."],
  };
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-label="Settings"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-brand">
            <BrandIcon size={32} />
            <div>
              <strong>Deck</strong>
            </div>
          </div>
          <nav aria-label="Settings sections">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-current={id === section ? "page" : undefined}
                className={id === section ? "active" : ""}
                onClick={() => {
                  setSection(id);
                  setMessage("");
                  setConfirmReset(false);
                  requestAnimationFrame(() => heading.current?.focus());
                }}
              >
                <Icon size={17} />
                {label}
                {id === section && <ChevronRight size={13} />}
              </button>
            ))}
          </nav>
        </aside>
        <section className="settings-main">
          <header className="settings-titlebar">
            <span>Settings</span>
            <IconButton label="Close settings" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          <div className="settings-scroll">
            <div className="settings-heading">
              <h2 ref={heading} tabIndex={-1}>
                {titles[section][0]}
              </h2>
              <p>{titles[section][1]}</p>
            </div>
            {section === "general" && (
              <>
                <h3 className="setting-group-title">Documents</h3>
                <div className="setting-group">
                  <Row
                    title="Default page view"
                    detail="Applied each time you open a document."
                  >
                    <select
                      aria-label="Default page view"
                      value={values.defaultFit}
                      onChange={(e) =>
                        update({
                          defaultFit: e.target.value as "page" | "width",
                        })
                      }
                    >
                      <option value="page">Fit page</option>
                      <option value="width">Fit width</option>
                    </select>
                  </Row>
                  <Row
                    title="Show the page sidebar"
                    detail="Start with thumbnails alongside your PDF."
                  >
                    <Toggle
                      label="Show the page sidebar"
                      value={values.showSidebar}
                      onChange={(showSidebar) => update({ showSidebar })}
                    />
                  </Row>
                </div>
                <h3 className="setting-group-title">Keyboard shortcuts</h3>
                <div className="shortcut-grid">
                  {[
                    ["Open a PDF", "⌘ O"],
                    ["Save document", "⌘ S"],
                    ["Save a copy", "⇧ ⌘ S"],
                    ["Find in document", "⌘ F"],
                    ["Fit to page", "⌘ 0"],
                    ["Open settings", "⌘ ,"],
                  ].map(([label, key]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
              </>
            )}
            {section === "appearance" && (
              <>
                <h3 className="setting-group-title">Theme</h3>
                <div className="appearance-options">
                  {(
                    [
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "system", label: "System", icon: Monitor },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      className={values.appearance === id ? "selected" : ""}
                      aria-pressed={values.appearance === id}
                      aria-label={`${label} appearance`}
                      onClick={() => update({ appearance: id })}
                    >
                      <div className={`appearance-preview preview-${id}`}>
                        <div className="mini-top">
                          <i />
                          <i />
                          <i />
                        </div>
                        <div className="mini-body">
                          <div className="mini-sidebar">
                            <i />
                            <i />
                            <i />
                          </div>
                          <div className="mini-sheet">
                            <i />
                            <i />
                            <i />
                          </div>
                        </div>
                      </div>
                      <span>
                        <Icon size={14} />
                        {label}
                        {values.appearance === id && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="setting-group">
                  <Row
                    title="Reduce motion"
                    detail="Limit decorative movement. System preferences are always respected."
                  >
                    <Toggle
                      label="Reduce motion"
                      value={values.reducedMotion}
                      onChange={(reducedMotion) => update({ reducedMotion })}
                    />
                  </Row>
                </div>
              </>
            )}
            {section === "editing" && (
              <>
                <div className="annotation-preview">
                  <span className="preview-label">Preview</span>
                  <div>
                    Sample{" "}
                    <span
                      style={{
                        backgroundColor: `${values.annotationColor}55`,
                        textDecorationColor: values.annotationColor,
                        textDecorationThickness: values.strokeWidth,
                      }}
                    >
                      highlighted text
                    </span>
                  </div>
                  <svg
                    width="72"
                    height="20"
                    viewBox="0 0 165 28"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 14 H159"
                      fill="none"
                      stroke={values.annotationColor}
                      strokeWidth={values.strokeWidth}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3 className="setting-group-title">Defaults</h3>
                <div className="setting-group">
                  <Row
                    title="Starting color"
                    detail="Used by highlights, shapes, notes, and drawings."
                  >
                    <div className="settings-color-options">
                      {ANNOTATION_COLORS.map((color, i) => (
                        <button
                          key={color}
                          aria-label={`${COLOR_NAMES[i]} annotation color`}
                          aria-pressed={values.annotationColor === color}
                          style={{ background: color }}
                          onClick={() => update({ annotationColor: color })}
                        >
                          {values.annotationColor === color && (
                            <Check size={13} />
                          )}
                        </button>
                      ))}
                    </div>
                  </Row>
                  <Row
                    title="Line weight"
                    detail="The default thickness for drawings and shapes."
                  >
                    <select
                      aria-label="Default line weight"
                      value={values.strokeWidth}
                      onChange={(e) =>
                        update({ strokeWidth: Number(e.target.value) })
                      }
                    >
                      {[1, 2, 3, 5].map((width) => (
                        <option key={width} value={width}>
                          {width} pt
                          {width === 2
                            ? " · Regular"
                            : width === 1
                              ? " · Fine"
                              : width === 3
                                ? " · Medium"
                                : " · Bold"}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row
                    title="Default text color"
                    detail="Starting color when adding new text boxes."
                  >
                    <div className="settings-color-options">
                      {TEXT_COLORS.map((color, i) => (
                        <button
                          key={color}
                          aria-label={`${TEXT_COLOR_NAMES[i]} text color`}
                          aria-pressed={values.defaultTextColor === color}
                          style={{ background: color }}
                          onClick={() => update({ defaultTextColor: color })}
                        >
                          {values.defaultTextColor === color && (
                            <Check size={13} />
                          )}
                        </button>
                      ))}
                    </div>
                  </Row>
                  <Row
                    title="Default text size"
                    detail="Starting font size for new text boxes."
                  >
                    <select
                      aria-label="Default text size"
                      value={values.defaultFontSize}
                      onChange={(e) =>
                        update({ defaultFontSize: Number(e.target.value) })
                      }
                    >
                      {[10, 12, 14, 16, 18, 24, 32].map((sz) => (
                        <option key={sz} value={sz}>
                          {sz} pt{sz === 14 ? " · Default" : ""}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row
                    title="Text box outline"
                    detail="Draw a subtle border box around added text (off by default for clean text)."
                  >
                    <Toggle
                      label="Draw a subtle border box around added text"
                      value={values.textBackground}
                      onChange={(textBackground) => update({ textBackground })}
                    />
                  </Row>
                </div>
                <div className="settings-callout">
                  <PenLine size={18} />
                  <p>
                    Applies to new annotations. Existing annotations keep their
                    styles.
                  </p>
                </div>
              </>
            )}
            {section === "privacy" && (
              <>
                <div className="privacy-hero">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Network access</strong>
                    <p>
                      Your PDFs are processed on your Mac. The packaged app
                      blocks outgoing web requests.
                    </p>
                  </div>
                </div>
                <div className="privacy-facts">
                  {[
                    ["No uploads", "Documents never go to a server."],
                    ["No account", "No email, sign-in, or subscription."],
                    ["No analytics", "No usage tracking or telemetry."],
                  ].map(([title, text]) => (
                    <div key={title}>
                      <Check size={15} />
                      <div>
                        <strong>{title}</strong>
                        <p>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <h3 className="setting-group-title">History</h3>
                <div className="setting-group">
                  <Row
                    title="Recent documents"
                    detail={`${recentCount} ${recentCount === 1 ? "document" : "documents"} in your recent list. Clearing it never deletes files.`}
                  >
                    <button
                      className="secondary"
                      disabled={clearing || !recentCount}
                      onClick={async () => {
                        setClearing(true);
                        try {
                          await clearRecents();
                          setMessage(
                            "Recent history cleared. Your PDF files are unchanged.",
                          );
                        } catch {
                          setMessage(
                            "Could not clear recent history. Please try again.",
                          );
                        } finally {
                          setClearing(false);
                        }
                      }}
                    >
                      {clearing ? "Clearing…" : "Clear history"}
                    </button>
                  </Row>
                </div>
                <div className="settings-callout">
                  <HardDrive size={18} />
                  <p>
                    Preferences and recent file locations are stored in your
                    macOS application data. Unsaved edits are held in memory
                    until you save or close the document.
                  </p>
                </div>
              </>
            )}
            {section === "about" && (
              <>
                <div className="about-product">
                  <BrandIcon size={48} />
                  <div>
                    <h3>Deck</h3>
                    <p>
                      Version {APP_VERSION}{" "}
                      <span className="release-tag">EARLY ACCESS</span>
                    </p>
                    <span>Local PDF editor for macOS.</span>
                  </div>
                </div>
                <div className="setting-group">
                  <Row
                    title="Built on open foundations"
                    detail="PDF.js for reading. MuPDF for editing. React and Electron for the workspace."
                  >
                    <span className="license-label">AGPL-3.0</span>
                  </Row>
                </div>
                <p className="about-limits">
                  PDFs up to 50 MB / 500 pages. Apple Vision OCR supports up to
                  100 selected pages per run. Saving changes may invalidate
                  existing digital signatures.
                </p>
                <div className="reset-settings">
                  <div>
                    <strong>Reset preferences</strong>
                    <p>
                      Restore preferences. Your documents are never touched.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (confirmReset) {
                        reset();
                        setConfirmReset(false);
                        setMessage("Default preferences restored.");
                      } else setConfirmReset(true);
                    }}
                  >
                    <RotateCcw size={14} />
                    {confirmReset ? "Confirm reset" : "Reset settings"}
                  </button>
                </div>
              </>
            )}
            {(message || storageError) && (
              <p
                className={`settings-message ${storageError ? "warning" : ""}`}
                role="status"
              >
                {storageError
                  ? "These settings apply now, but could not be saved for next time."
                  : message}
              </p>
            )}
          </div>
          <footer className="settings-footer">
            <span>
              <Check size={13} />
              {storageError
                ? "Preferences not saved"
                : "Changes saved automatically"}
            </span>
            <button className="primary small" onClick={onClose}>
              Done
            </button>
          </footer>
        </section>
      </div>
    </dialog>
  );
}
