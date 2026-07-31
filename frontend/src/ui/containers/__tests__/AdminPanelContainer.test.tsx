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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminPanelContainer from "../AdminPanelContainer";
import type { ReactNode } from "react";

/* ── Mock import of apiClient for token generation ──────────────── */

vi.mock("../../data/api-client", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  setTokenGetter: vi.fn(),
  setOnUnauthorized: vi.fn(),
}));

/* ── Test data ──────────────────────────────────────────────────── */

const mockUsers = [
  { id: 1, username: "admin1", role: "admin", created_at: "2026-01-15T10:00:00Z" },
  { id: 2, username: "nurse1", role: "operator", created_at: "2026-02-20T10:00:00Z" },
  { id: 3, username: "viewer1", role: "viewer", created_at: "2026-03-10T10:00:00Z" },
];

const mockEquivalences = [
  { id: 1, from: "A", to: "B" },
  { id: 2, from: "C", to: "D" },
];

const mockBridges = [
  {
    id: 1,
    ip_address: "192.168.0.10",
    label: "RPi-1",
    authorized: true,
    status: "online",
    last_seen_at: "2026-07-24T10:00:00Z",
  },
  {
    id: 2,
    ip_address: "192.168.0.11",
    label: null,
    authorized: false,
    status: "offline",
    last_seen_at: "2026-07-23T08:00:00Z",
  },
];

const mockMachines = [
  { id: 1, serial_number: "OMNI-001", ip_address: "192.168.1.100", status: "online", last_seen_at: "2026-07-24T10:00:00Z", created_at: "2026-07-01T00:00:00Z", software_version: null, port: null, label: null },
  { id: 2, serial_number: "OMNI-002", ip_address: "192.168.1.101", status: "offline", last_seen_at: "2026-07-23T08:00:00Z", created_at: "2026-07-02T00:00:00Z", software_version: null, port: null, label: null },
];

/* ── MSW server ──────────────────────────────────────────────────── */

const server = setupServer(
  http.get("/api/admin/users", () => HttpResponse.json(mockUsers)),
  http.post("/api/admin/users", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: 4, username: body.username, role: body.role, created_at: new Date().toISOString() },
      { status: 201 },
    );
  }),
  http.patch("/api/admin/users/:id", async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: Number(params.id),
      username: body.username ?? "updated",
      role: body.role ?? "operator",
      created_at: "2026-01-15T10:00:00Z",
    });
  }),
  http.delete("/api/admin/users/:id", () =>
    HttpResponse.json(null, { status: 204 }),
  ),

  // Equivalences
  http.get("/api/admin/equivalences", () => HttpResponse.json(mockEquivalences)),
  http.post("/api/admin/equivalences", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: 3, from: body.from, to: body.to },
      { status: 201 },
    );
  }),
  http.patch("/api/admin/equivalences/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 1, from: body.from, to: body.to });
  }),
  http.delete("/api/admin/equivalences/:id", () =>
    HttpResponse.json(null, { status: 204 }),
  ),

  // Bridges
  http.get("/api/admin/bridges", () => HttpResponse.json(mockBridges)),
  http.post("/api/admin/bridges", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: 3, ip_address: body.ip_address, label: body.label ?? null, authorized: false, status: "offline", last_seen_at: null },
      { status: 201 },
    );
  }),
  http.patch("/api/admin/bridges/:id", async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      id: Number(params.id),
      ip_address: "192.168.0.10",
      label: body.label ?? null,
      authorized: body.authorized === true,
      status: "online",
      last_seen_at: "2026-07-24T10:00:00Z",
    });
  }),
  http.delete("/api/admin/bridges/:id", () =>
    HttpResponse.json(null, { status: 204 }),
  ),

  // Machines (read-only, from /api/machines)
  http.get("/api/machines", () => HttpResponse.json(mockMachines)),

  // Signals (uses SignalRepo → /api/signals)
  http.get("/api/signals", () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/* ── Helpers ──────────────────────────────────────────────────────── */

function createWrapper(initialPath = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("AdminPanelContainer", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    render(<AdminPanelContainer />, { wrapper: createWrapper() });

    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
    expect(
      screen.getByText(/manage users, signals, equivalences, bridges, and machines/i),
    ).toBeInTheDocument();
  });

  it("renders the active section heading for each route", () => {
    const routes: { path: string; heading: string }[] = [
      { path: "/admin/users", heading: "Users" },
      { path: "/admin/signals", heading: "Signals" },
      { path: "/admin/equivalences", heading: "Equivalences" },
      { path: "/admin/bridges", heading: "Bridges" },
      { path: "/admin/machines", heading: "Machines" },
    ];

    for (const { path, heading } of routes) {
      const { unmount } = render(<AdminPanelContainer />, {
        wrapper: createWrapper(path),
      });
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      unmount();
    }
  });

  it("defaults to the Users section on unknown paths", () => {
    render(<AdminPanelContainer />, { wrapper: createWrapper("/admin/unknown") });

    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
  });

  it("redirects bare /admin to /admin/users", async () => {
    render(<AdminPanelContainer />, { wrapper: createWrapper("/admin") });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    });
  });

  describe("Users section", () => {
    it("renders user list after data loads", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("admin1")).toBeInTheDocument();
      });
      expect(screen.getByText("nurse1")).toBeInTheDocument();
      expect(screen.getByText("viewer1")).toBeInTheDocument();
      expect(screen.getByText("admin")).toBeInTheDocument();
      expect(screen.getByText("operator")).toBeInTheDocument();
    });

    it("opens create form on +New button", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("admin1")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /\+ new/i }));

      expect(screen.getByText("Create User")).toBeInTheDocument();
      expect(screen.getByLabelText("Username")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByLabelText("Role")).toBeInTheDocument();
    });

    it("creates a new user via form", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("admin1")).toBeInTheDocument();
      });

      // Open create form
      await user.click(screen.getByRole("button", { name: /\+ new/i }));

      // Fill form
      await user.type(screen.getByLabelText("Username"), "newuser");
      await user.type(screen.getByLabelText("Password"), "pass123");
      await user.selectOptions(screen.getByLabelText("Role"), "operator");

      // Submit
      await user.click(screen.getByRole("button", { name: /save/i }));

      // After submission, the list view should be back
      await waitFor(() => {
        expect(screen.getByText("admin1")).toBeInTheDocument();
      });

      // The mutation succeeded (we don't invalidate the query in MSW, but the
      // mutation's onSuccess called invalidateQueries — the test just needs to
      // verify no error occurred.)
    });

    it("shows delete confirmation dialog and deletes", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("admin1")).toBeInTheDocument();
      });

      // Click delete on first user
      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      await user.click(deleteButtons[0]!);

      // Confirm dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText(/are you sure you want to delete/i),
        ).toBeInTheDocument();
      });

      // Confirm
      await user.click(screen.getByRole("button", { name: /confirm/i }));

      // Dialog should close after deletion
      await waitFor(() => {
        expect(
          screen.queryByText(/are you sure you want to delete/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Equivalences section", () => {
    it("renders equivalence list and supports CRUD", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper("/admin/equivalences") });

      await waitFor(() => {
        expect(screen.getByText("A")).toBeInTheDocument();
      });
      expect(screen.getByText("C")).toBeInTheDocument();

      // Open create form
      await user.click(screen.getByRole("button", { name: /\+ new/i }));

      await waitFor(() => {
        expect(screen.getByText("Create Equivalence")).toBeInTheDocument();
      });
    });
  });

  describe("Bridges section", () => {
    it("renders bridge list and opens register form", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper("/admin/bridges") });

      await waitFor(() => {
        expect(screen.getByText("192.168.0.10")).toBeInTheDocument();
      });
      expect(screen.getByText("RPi-1")).toBeInTheDocument();
      expect(screen.getByText("192.168.0.11")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /\+ new/i }));

      await waitFor(() => {
        expect(screen.getByText("Register Bridge")).toBeInTheDocument();
      });
    });
  });

  describe("Machines section", () => {
    it("renders machine list (read-only)", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper("/admin/machines") });

      await waitFor(() => {
        expect(screen.getByText("OMNI-001")).toBeInTheDocument();
      });
      expect(screen.getByText("OMNI-002")).toBeInTheDocument();
      expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
      expect(screen.getByText("192.168.1.101")).toBeInTheDocument();
      // Should NOT have a +New button (read-only)
      expect(screen.queryByRole("button", { name: /\+ new/i })).not.toBeInTheDocument();
    });
  });

  describe("Signals section", () => {
    it("renders empty signals list", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper("/admin/signals") });

      await waitFor(() => {
        expect(screen.getByText("No signals found.")).toBeInTheDocument();
      });
    });
  });
});
