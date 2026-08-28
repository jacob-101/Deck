import { create } from "zustand";

export const PREFERENCES_KEY = "openpdf:preferences:v1";
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
export const THEMES = [
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
export type Preferences = {
  appearance: "system" | "light" | "dark";
  theme: (typeof THEMES)[number]["id"];
  defaultFit: "page" | "width";
  showSidebar: boolean;
  annotationColor: string;
  strokeWidth: number;
  reducedMotion: boolean;
};
export const DEFAULT_PREFERENCES: Preferences = {
  appearance: "system",
  theme: "forest",
  defaultFit: "page",
  showSidebar: true,
  annotationColor: ANNOTATION_COLORS[0],
  strokeWidth: 2,
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
