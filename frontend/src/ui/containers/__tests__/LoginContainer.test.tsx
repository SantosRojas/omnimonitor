import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from "vitest";
import { LoginContainer } from "../LoginContainer";
import { useAuthStore } from "../../../store/auth-store";

/* ── Mocks ────────────────────────────────────────────────────── */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/* ── MSW server ───────────────────────────────────────────────── */

const server = setupServer(
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    if (body.username === "nurse" && body.password === "pass") {
      return HttpResponse.json({
        token: "valid-jwt-token",
        user_id: 1,
        role: "operator",
      });
    }

    if (body.username === "admin" && body.password === "pass") {
      return HttpResponse.json({
        token: "admin-jwt-token",
        user_id: 2,
        role: "admin",
      });
    }

    return HttpResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/* ── Tests ────────────────────────────────────────────────────── */

describe("LoginContainer", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("renders the login form", () => {
    render(<LoginContainer />);

    expect(screen.getByText("OMNI PDMS")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("navigates to /dashboard on successful nurse login", async () => {
    render(<LoginContainer />);

    await user.type(screen.getByLabelText(/username/i), "nurse");
    await user.type(screen.getByLabelText(/password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", {
        replace: true,
      });
    });

    // Token should be persisted in the store
    const storeState = useAuthStore.getState();
    expect(storeState.token).toBe("valid-jwt-token");
    expect(storeState.isAuthenticated).toBe(true);
  });

  it("navigates to /admin on successful admin login", async () => {
    render(<LoginContainer />);

    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin", {
        replace: true,
      });
    });
  });

  it("displays error message on failed login and does not store token", async () => {
    render(<LoginContainer />);

    await user.type(screen.getByLabelText(/username/i), "nurse");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid credentials"),
      ).toBeInTheDocument();
    });

    // Token should NOT be stored
    const storeState = useAuthStore.getState();
    expect(storeState.token).toBeNull();
    expect(storeState.isAuthenticated).toBe(false);
  });

  it("shows loading indicator while the request is in flight", async () => {
    // Use a deferred response to keep loading state visible
    let resolveLogin!: (value: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });

    server.use(
      http.post("/api/auth/login", async () => deferred),
    );

    render(<LoginContainer />);

    await user.type(screen.getByLabelText(/username/i), "nurse");
    await user.type(screen.getByLabelText(/password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Loading state should replace the button text
    expect(
      screen.getByRole("button", { name: /signing in/i }),
    ).toBeDisabled();

    // Resolve the deferred response
    resolveLogin(
      HttpResponse.json({
        token: "valid-jwt-token",
        user_id: 1,
        role: "operator",
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
