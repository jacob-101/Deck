import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  normalizePreferences,
  readPreferences,
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
