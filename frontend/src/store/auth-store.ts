import { create } from "zustand";
import type { User } from "../core/types";

/* ── Persistence helpers ─────────────────────────────────────── */

const TOKEN_KEY = "pdms_auth_token";
const USER_KEY = "pdms_auth_user";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or unavailable — silently ignore
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore
  }
}

/* ── Auth state ──────────────────────────────────────────────── */

export interface AuthState {
  /** The raw JWT string, or `null` if not authenticated. */
  token: string | null;
  /** The decoded/known user information. */
  user: User | null;
  /** Derived convenience flag — `true` when a non‑null token exists. */
  isAuthenticated: boolean;
}

export interface AuthActions {
  /**
   * Persists a newly issued token and user info, then marks the session
   * as authenticated.
   */
  login: (token: string, user: User) => void;
  /**
   * Replaces the stored user without invalidating the current token.
   * Used to keep the session in sync after a profile update.
   */
  setUser: (user: User) => void;
  /** Clears credentials from memory and localStorage, effectively logging out. */
  logout: () => void;
  /**
   * Re‑reads stored credentials from localStorage.
   * Called once during app bootstrap.
   */
  hydrate: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  // ── Initial state (hydrated from localStorage on first render) ─
  token: loadFromStorage<string | null>(TOKEN_KEY, null),
  user: loadFromStorage<User | null>(USER_KEY, null),
  get isAuthenticated(): boolean {
    // NB: this is a getter on the initial literal — it will be re‑evaluated
    //     by Zustand on every state read. We keep the computed field in sync
    //     via the reducer below.
    return loadFromStorage<string | null>(TOKEN_KEY, null) !== null;
  },

  // ── Actions ─────────────────────────────────────────────────────
  login: (token: string, user: User) => {
    saveToStorage(TOKEN_KEY, token);
    saveToStorage(USER_KEY, user);
    set({ token, user, isAuthenticated: true });
  },

  setUser: (user: User) => {
    saveToStorage(USER_KEY, user);
    set({ user });
  },

  logout: () => {
    removeFromStorage(TOKEN_KEY);
    removeFromStorage(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = loadFromStorage<string | null>(TOKEN_KEY, null);
    const user = loadFromStorage<User | null>(USER_KEY, null);
    set({ token, user, isAuthenticated: token !== null });
  },
}));
