import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../format";
import { changeLanguage, initI18n } from "../../../i18n";

// Local-time ISO (no Z): the calendar date stays 7/21 in every timezone.
const ISO_LOCAL = "2026-07-21T12:00:00";
const ISO_UTC = "2026-07-21T10:30:00Z";

beforeAll(() => {
  // Ensure the en catalog is loaded so locale-aware output is deterministic.
  // test-setup.ts also inits i18n globally; this call is idempotent.
  initI18n({ lng: "en" });
});

afterEach(async () => {
  await changeLanguage("en");
});

describe("formatDateTime", () => {
  it("returns em dash for null/undefined/empty/invalid", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("produces differing locale output for es vs en", async () => {
    await changeLanguage("en");
    const en = formatDateTime(ISO_UTC);
    await changeLanguage("es");
    const es = formatDateTime(ISO_UTC);
    expect(en).not.toBe(es);
    expect(en).toMatch(/\d/);
    expect(es).toMatch(/\d/);
  });
});

describe("formatDate", () => {
  it("returns em dash for null/empty/invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("nope")).toBe("—");
  });

  it("orders month before day in en and day before month in es", async () => {
    await changeLanguage("en");
    const en = formatDate(ISO_LOCAL);
    await changeLanguage("es");
    const es = formatDate(ISO_LOCAL);
    expect(en.startsWith("7/")).toBe(true);
    expect(es.startsWith("21/")).toBe(true);
  });
});

describe("formatTime", () => {
  it("returns em dash for null/empty/invalid", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("")).toBe("—");
    expect(formatTime("nope")).toBe("—");
  });

  it("produces differing locale output for es vs en", async () => {
    await changeLanguage("en");
    const en = formatTime(ISO_UTC);
    await changeLanguage("es");
    const es = formatTime(ISO_UTC);
    expect(en).not.toBe(es);
  });
});
