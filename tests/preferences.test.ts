import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  SAVED_SIGNATURES_KEY,
  clearSavedSignatures,
  deleteSavedSignature,
  getSavedSignatures,
  normalizePreferences,
  readPreferences,
  saveSignature,
} from "../src/core/preferences";

describe("workspace preferences", () => {
  it("accepts supported values and discards unknown or malformed values", () => {
    expect(
      normalizePreferences({
        appearance: "dark",
        theme: "cobalt",
        defaultFit: "width",
        showSidebar: false,
        annotationColor: "#719cd6",
        strokeWidth: 5,
        defaultTextColor: "#1d3557",
        defaultFontSize: 18,
        textBackground: true,
        reducedMotion: true,
        remoteURL: "https://invalid.test",
      }),
    ).toEqual({
      appearance: "dark",
      theme: "cobalt",
      defaultFit: "width",
      showSidebar: false,
      annotationColor: "#719cd6",
      strokeWidth: 5,
      defaultTextColor: "#1d3557",
      defaultFontSize: 18,
      textBackground: true,
      reducedMotion: true,
    });
    expect(
      normalizePreferences({
        appearance: "surprise",
        theme: "bad",
        defaultFit: "manual",
        showSidebar: "false",
        annotationColor: "not-a-color",
        strokeWidth: -1,
        defaultFontSize: 999,
        reducedMotion: 1,
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });
  it("uses defaults for corrupted storage, missing storage and non-object data", () => {
    for (const raw of [null, "{broken", "null", "42", "[]"]) {
      expect(
        readPreferences({
          getItem: (key) => (key === PREFERENCES_KEY ? raw : null),
        }),
      ).toEqual(DEFAULT_PREFERENCES);
    }
    expect(
      readPreferences({
        getItem() {
          throw new Error("Storage unavailable");
        },
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });
  it("migrates existing appearance without overriding a new preference record", () => {
    expect(
      readPreferences({
        getItem: (key) => (key === "openpdf:theme" ? "dark" : null),
      }).appearance,
    ).toBe("dark");
    expect(
      readPreferences({
        getItem: (key) =>
          key === PREFERENCES_KEY ? '{"appearance":"system"}' : "dark",
      }).appearance,
    ).toBe("system");
  });
});

describe("saved signatures storage", () => {
  let store: Record<string, string> = {};
  beforeEach(() => {
    store = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  });

  it("stores, retrieves, deletes and clears saved signatures", () => {
    expect(getSavedSignatures()).toEqual([]);
    const saved = saveSignature({
      name: "Test Signer",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      kind: "draw",
    });
    expect(saved.id).toBeDefined();
    expect(saved.name).toBe("Test Signer");

    const list = getSavedSignatures();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
    expect(list[0].name).toBe("Test Signer");

    deleteSavedSignature(saved.id);
    expect(getSavedSignatures()).toEqual([]);

    saveSignature({
      name: "Signer 2",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      kind: "type",
    });
    expect(getSavedSignatures()).toHaveLength(1);
    clearSavedSignatures();
    expect(getSavedSignatures()).toEqual([]);
  });

  it("reports storage failures instead of silently swallowing errors", () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() =>
        saveSignature({
          name: "Test Signer",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          kind: "draw",
        }),
      ).toThrow("Could not save signature to local storage");
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });
});
