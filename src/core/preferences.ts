import { create } from "zustand";

export const PREFERENCES_KEY = "openpdf:preferences:v2";
const LEGACY_PREFERENCES_KEY = "openpdf:preferences:v1";
export const SAVED_SIGNATURES_KEY = "openpdf:signatures:v1";

export const ANNOTATION_COLORS = [
  "#ddb542",
  "#759783",
  "#719cd6",
  "#d17774",
  "#997eb8",
  "#252c2b",
];
export const COLOR_NAMES = [
  "Honey",
  "Sage",
  "Blue",
  "Coral",
  "Lavender",
  "Ink",
];

export const TEXT_COLORS = [
  "#1f2421",
  "#2b4c3f",
  "#1d3557",
  "#8b263e",
  "#4a306d",
  "#5c5c5c",
];
export const TEXT_COLOR_NAMES = [
  "Charcoal",
  "Deep Forest",
  "Navy",
  "Wine",
  "Plum",
  "Slate",
];
export const TEXT_BACKGROUND_COLORS = [
  "none",
  "#ffffff",
  "#fff1bd",
  "#dceee3",
  "#dce9f7",
  "#f5dce1",
];
export const TEXT_BACKGROUND_NAMES = [
  "None",
  "White",
  "Cream",
  "Mint",
  "Sky",
  "Blush",
];

export const THEMES = [
  {
    id: "azure",
    name: "Azure",
    description: "Confident blue, built for focus.",
    color: "#1560e8",
  },
  {
    id: "forest",
    name: "Forest & Paper",
    description: "A calmer kind of workspace.",
    color: "#365a47",
  },
  {
    id: "slate",
    name: "Slate",
    description: "Quiet, precise, and focused.",
    color: "#4e6275",
  },
  {
    id: "cobalt",
    name: "Cobalt",
    description: "A little clarity. A little color.",
    color: "#365db1",
  },
  {
    id: "clay",
    name: "Clay",
    description: "Warm tones, fresh perspective.",
    color: "#9b563f",
  },
] as const;

export type SavedSignature = {
  id: string;
  name: string;
  dataUrl: string;
  date: number;
  kind: "draw" | "type" | "import";
};

export function getSavedSignatures(): SavedSignature[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_SIGNATURES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.dataUrl === "string" &&
          typeof s.name === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

export function saveSignature(
  sig: Omit<SavedSignature, "id" | "date">,
): SavedSignature {
  if (typeof localStorage === "undefined") {
    throw new Error("Local storage is not available in this environment.");
  }
  const all = getSavedSignatures();
  const entry: SavedSignature = {
    ...sig,
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: Date.now(),
  };
  const updated = [entry, ...all].slice(0, 10);
  try {
    localStorage.setItem(SAVED_SIGNATURES_KEY, JSON.stringify(updated));
  } catch (cause) {
    throw new Error(
      "Could not save signature to local storage. Storage quota may be full.",
    );
  }
  return entry;
}

export function deleteSavedSignature(id: string): void {
  if (typeof localStorage === "undefined") {
    throw new Error("Local storage is not available in this environment.");
  }
  const all = getSavedSignatures();
  const updated = all.filter((s) => s.id !== id);
  try {
    localStorage.setItem(SAVED_SIGNATURES_KEY, JSON.stringify(updated));
  } catch (cause) {
    throw new Error("Could not remove signature from local storage.");
  }
}

export function clearSavedSignatures(): void {
  if (typeof localStorage === "undefined") {
    throw new Error("Local storage is not available in this environment.");
  }
  try {
    localStorage.removeItem(SAVED_SIGNATURES_KEY);
  } catch (cause) {
    throw new Error("Could not clear saved signatures from local storage.");
  }
}

export type Preferences = {
  appearance: "system" | "light" | "dark";
  theme: (typeof THEMES)[number]["id"];
  defaultFit: "page" | "width";
  showSidebar: boolean;
  annotationColor: string;
  strokeWidth: number;
  defaultTextColor: string;
  defaultFontSize: number;
  textBackground: boolean;
  reducedMotion: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: "light",
  theme: "azure",
  defaultFit: "page",
  showSidebar: true,
  annotationColor: ANNOTATION_COLORS[0],
  strokeWidth: 2,
  defaultTextColor: TEXT_COLORS[0],
  defaultFontSize: 14,
  textBackground: false,
  reducedMotion: false,
};

/** Only accept known values; preferences may outlive any one app version. */
export function normalizePreferences(raw: unknown): Preferences {
  const result = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== "object") return result;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.appearance === "string" &&
    ["system", "light", "dark"].includes(value.appearance)
  )
    result.appearance = value.appearance as Preferences["appearance"];
  if (THEMES.some((t) => t.id === value.theme))
    result.theme = value.theme as Preferences["theme"];
  if (value.defaultFit === "width" || value.defaultFit === "page")
    result.defaultFit = value.defaultFit;
  if (typeof value.showSidebar === "boolean")
    result.showSidebar = value.showSidebar;
  if (
    typeof value.annotationColor === "string" &&
    ANNOTATION_COLORS.includes(value.annotationColor)
  )
    result.annotationColor = value.annotationColor;
  if (typeof value.defaultTextColor === "string")
    result.defaultTextColor = value.defaultTextColor;
  if (
    typeof value.defaultFontSize === "number" &&
    value.defaultFontSize >= 6 &&
    value.defaultFontSize <= 144
  )
    result.defaultFontSize = value.defaultFontSize;
  if (typeof value.textBackground === "boolean")
    result.textBackground = value.textBackground;
  if ([1, 2, 3, 5].includes(value.strokeWidth as number))
    result.strokeWidth = value.strokeWidth as number;
  if (typeof value.reducedMotion === "boolean")
    result.reducedMotion = value.reducedMotion;
  return result;
}

export function readPreferences(
  storage: Pick<Storage, "getItem">,
): Preferences {
  try {
    const saved = storage.getItem(PREFERENCES_KEY);
    if (saved) return normalizePreferences(JSON.parse(saved));
    const legacy = storage.getItem(LEGACY_PREFERENCES_KEY);
    if (legacy) {
      const prefs = normalizePreferences(JSON.parse(legacy));
      // "forest" was the 0.1–0.4 default; "azure" is the new default.
      if (prefs.theme === "forest") prefs.theme = "azure";
      return prefs;
    }
    const old = storage.getItem("openpdf:theme");
    return normalizePreferences(
      old === "light" || old === "dark" ? { appearance: old } : {},
    );
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

type Store = {
  values: Preferences;
  storageError: boolean;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
};

export const usePreferences = create<Store>((set, get) => {
  const persist = (values: Preferences) => {
    let storageError = false;
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(values));
    } catch {
      storageError = true;
    }
    set({ values, storageError });
  };
  return {
    values:
      typeof localStorage === "undefined"
        ? { ...DEFAULT_PREFERENCES }
        : readPreferences(localStorage),
    storageError: false,
    update: (patch) =>
      persist(normalizePreferences({ ...get().values, ...patch })),
    reset: () => persist({ ...DEFAULT_PREFERENCES }),
  };
});
