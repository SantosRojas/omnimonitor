import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from "vitest";
import { PrivateRoute } from "../PrivateRoute";
import { useAuthStore } from "../../../store/auth-store";
import type { User } from "../../../core/types";

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Creates a fake JWT string with the given payload. Uses base64url encoding
 * to match the decoding logic in `PrivateRoute`.
 */
function createJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const base64 = btoa(json);
  const base64url = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${base64url}.signature`;
}

/** Helper to set the auth store to a logged-in state. */
function setLoggedIn(options: {
  role: string;
  exp?: number;
  userId?: number;
}) {
  const userId = options.userId ?? 1;
  const username = options.role === "admin" ? "admin" : "operator";
  const exp =
    options.exp ?? Math.floor(Date.now() / 1000) + 3600; // default: 1h in future

  const token = createJwt({
    exp,
    role: options.role,
    sub: String(userId),
    username,
  });

  const user: User = {
    id: userId,
    username,
    email: null,
    role: options.role as "admin" | "operator" | "viewer",
    created_at: "2024-01-01T00:00:00Z",
  };

  useAuthStore.setState({
    token,
    user,
    isAuthenticated: true,
  });
}

function renderWithRouter(initialRoute = "/protected") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        {/* Wrapper: default guard — any authenticated role */}
        <Route element={<PrivateRoute />}>
          <Route
            path="protected"
            element={<p data-testid="protected-content">Protected Content</p>}
          />
          {/* Admin-only route */}
          <Route element={<PrivateRoute requiredRole="admin" />}>
            <Route
              path="admin-only"
              element={<p data-testid="admin-content">Admin Content</p>}
            />
          </Route>
          {/* Operator-only route */}
          <Route element={<PrivateRoute requiredRole="operator" />}>
            <Route
              path="operator-only"
              element={<p data-testid="operator-content">Operator Content</p>}
            />
          </Route>
        </Route>
        <Route
          path="/login"
          element={<p data-testid="login-page">Login Page</p>}
        />
        <Route
          path="/dashboard"
          element={<p data-testid="dashboard-page">Dashboard Page</p>}
        />
        <Route
          path="/admin"
          element={<p data-testid="admin-page">Admin Page</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/* ── Tests ────────────────────────────────────────────────────── */

describe("PrivateRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("renders protected content when a valid token exists", async () => {
    setLoggedIn({ role: "operator" });

    renderWithRouter("/protected");

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(
      screen.queryByTestId("login-page"),
    ).not.toBeInTheDocument();
  });

  it("redirects to /login when there is no token", async () => {
    // Store is already cleared in beforeEach
    renderWithRouter("/protected");

    expect(
      await screen.findByTestId("login-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("protected-content"),
    ).not.toBeInTheDocument();
  });

  it("redirects to /login when the token is expired", async () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 3600; // 1h in the past
    setLoggedIn({ role: "operator", exp: expiredExp });

    renderWithRouter("/protected");

    expect(
      await screen.findByTestId("login-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("protected-content"),
    ).not.toBeInTheDocument();
  });

  it("redirects operator to /dashboard when accessing an admin-only route", async () => {
    setLoggedIn({ role: "operator" });

    renderWithRouter("/admin-only");

    await screen.findByTestId("dashboard-page");

    expect(
      screen.getByTestId("dashboard-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("admin-content"),
    ).not.toBeInTheDocument();
  });

  it("redirects admin to /admin when accessing an operator-only route", async () => {
    setLoggedIn({ role: "admin" });

    renderWithRouter("/operator-only");

    await screen.findByTestId("admin-page");

    expect(
      screen.getByTestId("admin-page"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("operator-content"),
    ).not.toBeInTheDocument();
  });

  it("allows admin through an admin-required route", async () => {
    setLoggedIn({ role: "admin" });

    renderWithRouter("/admin-only");

    expect(
      await screen.findByTestId("admin-content"),
    ).toBeInTheDocument();
  });

  it("allows operator through an operator-only route", async () => {
    setLoggedIn({ role: "operator" });

    renderWithRouter("/operator-only");

    expect(
      await screen.findByTestId("operator-content"),
    ).toBeInTheDocument();
  });
});
