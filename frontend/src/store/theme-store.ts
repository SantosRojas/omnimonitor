import { create } from "zustand";

type Theme = "light" | "dark";

export const ACCENT_OPTIONS = [
  { key: "cyan", value: "#00d4ff" },
  { key: "blue", value: "#3b82f6" },
  { key: "green", value: "#10b981" },
  { key: "amber", value: "#f59e0b" },
  { key: "red", value: "#ef4444" },
  { key: "pink", value: "#ec4899" },
  { key: "purple", value: "#6c63ff" },
] as const;

export const DEFAULT_ACCENTS = { light: "#0891b2", dark: "#00d4ff" } as const;

const ACCENT_STORAGE_KEY = "omni-accent";
const ACCENT_REGEX = /^#[0-9a-fA-F]{6}$/;

interface ThemeState {
  theme: Theme;
  accent: string | null;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setAccent: (c: string) => void;
  resetAccent: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}

function getInitialAccent(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  return stored && ACCENT_REGEX.test(stored) ? stored : null;
}

function applyAccent(accent: string | null) {
  const root = document.documentElement;
  if (accent && ACCENT_REGEX.test(accent)) {
    root.style.setProperty("--color-accent", accent);
  } else {
    root.style.removeProperty("--color-accent");
  }
}

// Apply on load
applyTheme(getInitialTheme());
applyAccent(getInitialAccent());

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  accent: getInitialAccent(),
  toggle: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (theme: Theme) => {
    applyTheme(theme);
    set({ theme });
  },
  setAccent: (c: string) => {
    if (!ACCENT_REGEX.test(c)) return;
    applyAccent(c);
    localStorage.setItem(ACCENT_STORAGE_KEY, c);
    set({ accent: c });
  },
  resetAccent: () => {
    applyAccent(null);
    localStorage.removeItem(ACCENT_STORAGE_KEY);
    set({ accent: null });
  },
}));
