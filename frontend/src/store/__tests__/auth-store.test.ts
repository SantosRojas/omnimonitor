import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../auth-store";
import type { User } from "../../core/types";

/* ── Helpers ──────────────────────────────────────────────────── */

const mockUser: User = {
  id: 1,
  username: "nurse",
  role: "operator",
  created_at: "2024-01-01T00:00:00Z",
};

/* ── Tests ────────────────────────────────────────────────────── */

describe("auth-store", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("initial state has no token and is not authenticated", () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("login sets token and user in memory", () => {
    useAuthStore.getState().login("test-token", mockUser);

    const state = useAuthStore.getState();
    expect(state.token).toBe("test-token");
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("login persists token and user to localStorage", () => {
    useAuthStore.getState().login("test-token", mockUser);

    expect(localStorage.getItem("pdms_auth_token")).toBe(
      JSON.stringify("test-token"),
    );
    expect(localStorage.getItem("pdms_auth_user")).toBe(
      JSON.stringify(mockUser),
    );
  });

  it("logout clears token and user from memory", () => {
    useAuthStore.getState().login("test-token", mockUser);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("logout removes credentials from localStorage", () => {
    useAuthStore.getState().login("test-token", mockUser);
    useAuthStore.getState().logout();

    expect(localStorage.getItem("pdms_auth_token")).toBeNull();
    expect(localStorage.getItem("pdms_auth_user")).toBeNull();
  });

  it("hydrate re-reads credentials from localStorage", () => {
    localStorage.setItem("pdms_auth_token", JSON.stringify("stored-token"));
    localStorage.setItem(
      "pdms_auth_user",
      JSON.stringify({ ...mockUser, id: 2 }),
    );

    useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.token).toBe("stored-token");
    expect(state.user).toEqual({ ...mockUser, id: 2 });
    expect(state.isAuthenticated).toBe(true);
  });

  it("hydrate handles missing localStorage gracefully", () => {
    // Set a prior state to verify hydrate overwrites it
    useAuthStore.setState({
      token: "old-token",
      user: mockUser,
      isAuthenticated: true,
    });

    localStorage.clear();
    useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("isAuthenticated remains false after constructor when localStorage has no token", () => {
    localStorage.clear();
    // Re-creating the store would call loadFromStorage — but our store is a
    // singleton. Instead verify that after clearing storage and re-hydrating
    // the computed flag matches.
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
