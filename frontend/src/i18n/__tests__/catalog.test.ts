import { describe, expect, it } from "vitest";
import en from "../locales/en/translation.json";
import es from "../locales/es/translation.json";

/**
 * Mandated top-level group prefixes for the i18n catalogs.
 *
 * Extended groups (admin, scada, history, patients, settings) are added in a
 * later work unit; the check below still enforces that no key ever escapes
 * this allow-list, so the catalogs stay reviewable and scoped.
 */
const MANDATED_PREFIXES = [
  "nav",
  "login",
  "common",
  "errors",
  "status",
  "state",
  "alarm",
  "relative",
  "dashboard",
  "admin",
  "scada",
  "history",
  "patients",
  "settings",
];

type TranslationTree = Record<string, unknown>;

function flattenKeys(tree: TranslationTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      return flattenKeys(value as TranslationTree, path);
    }
    return [path];
  });
}

describe("translation catalogs", () => {
  it("es and en expose the same flattened key set", () => {
    const esKeys = flattenKeys(es).sort();
    const enKeys = flattenKeys(en).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("every key belongs to a mandated group prefix", () => {
    const esKeys = flattenKeys(es);
    for (const key of esKeys) {
      const prefix = key.split(".")[0]!;
      expect(
        MANDATED_PREFIXES,
        `key "${key}" is not under a mandated group prefix`,
      ).toContain(prefix);
    }
  });
});
