import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { relativeTime, formatDuration } from "../time";
import { changeLanguage, initI18n } from "../../../i18n";

beforeAll(() => {
  // relativeTime now resolves the en catalog ("just now", "5m ago", ...).
  // test-setup.ts also inits i18n globally; this call is idempotent.
  initI18n({ lng: "en" });
});

const NOW = new Date("2026-01-01T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function isoAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe("relativeTime", () => {
  it("returns em dash for null/undefined/empty", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(undefined)).toBe("—");
    expect(relativeTime("")).toBe("—");
  });

  it("returns em dash for invalid dates", () => {
    expect(relativeTime("not-a-date")).toBe("—");
  });

  it("returns 'just now' for under a minute", () => {
    expect(relativeTime(isoAgo(0))).toBe("just now");
    expect(relativeTime(isoAgo(59))).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(relativeTime(isoAgo(5 * 60))).toBe("5m ago");
    expect(relativeTime(isoAgo(59 * 60))).toBe("59m ago");
  });

  it("returns hours ago", () => {
    expect(relativeTime(isoAgo(2 * 3600))).toBe("2h ago");
    expect(relativeTime(isoAgo(23 * 3600))).toBe("23h ago");
  });

  it("returns days ago", () => {
    expect(relativeTime(isoAgo(3 * 86400))).toBe("3d ago");
    expect(relativeTime(isoAgo(10 * 86400))).toBe("10d ago");
  });
});

describe("relativeTime es plurals", () => {
  afterEach(async () => {
    await changeLanguage("en");
  });

  it("uses Spanish singular and plural forms", async () => {
    await changeLanguage("es");

    expect(relativeTime(isoAgo(60))).toBe("hace 1 minuto");
    expect(relativeTime(isoAgo(3 * 60))).toBe("hace 3 minutos");
    expect(relativeTime(isoAgo(2 * 3600))).toBe("hace 2 horas");
  });
});

describe("formatDuration", () => {
  it("returns em dash when no start", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration("")).toBe("—");
  });

  it("returns em dash for invalid start/end", () => {
    expect(formatDuration("not-a-date")).toBe("—");
    expect(formatDuration(isoAgo(600), "also-not-a-date")).toBe("—");
  });

  it("formats minutes-only durations", () => {
    expect(formatDuration(isoAgo(0), isoAgo(0))).toBe("0m");
    expect(formatDuration(isoAgo(42 * 60), NOW.toISOString())).toBe("42m");
  });

  it("formats hours and minutes", () => {
    const start = new Date(NOW.getTime() - 1 * 3600_000 - 23 * 60_000).toISOString();
    expect(formatDuration(start, NOW.toISOString())).toBe("1h 23m");
  });

  it("computes duration from now when end is omitted", () => {
    expect(formatDuration(isoAgo(10 * 60))).toBe("10m");
    expect(formatDuration(isoAgo(2 * 3600 + 5 * 60))).toBe("2h 5m");
  });

  it("clamps to zero for negative durations", () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(formatDuration(future, NOW.toISOString())).toBe("0m");
  });
});
