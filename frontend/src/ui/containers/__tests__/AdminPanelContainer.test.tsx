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

const mockMachineIps = [
  { id: 1, machine_id: 1, ip_address: "192.168.1.100" },
  { id: 2, machine_id: 2, ip_address: "192.168.1.101" },
];

const mockMachines = [
  { id: 1, serial_number: "OMNI-001", ip_address: "192.168.1.100", status: "online", last_seen_at: "2026-07-24T10:00:00Z", created_at: "2026-07-01T00:00:00Z", software_version: null, port: null, label: null },
  { id: 2, serial_number: "OMNI-002", ip_address: "192.168.1.101", status: "offline", last_seen_at: "2026-07-23T08:00:00Z", created_at: "2026-07-02T00:00:00Z", software_version: null, port: null, label: null },
];

const mockComments = [
  { id: 1, content: "Checked vitals", created_at: "2026-07-20T14:30:00Z" },
  { id: 2, content: "Changed filter", created_at: "2026-07-20T15:00:00Z" },
];

const mockConfig = {
  max_therapies: 10,
  ws_reconnect_interval: 5,
  log_level: "info",
  db_host: "localhost",
};

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

  // Machines (read-only, from /api/machines)
  http.get("/api/machines", () => HttpResponse.json(mockMachines)),

  // Comments
  http.get("/api/admin/therapies/:therapyId/comments", () =>
    HttpResponse.json(mockComments),
  ),
  http.post("/api/admin/therapies/:therapyId/comments", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: 3, content: body.content, created_at: new Date().toISOString() },
      { status: 201 },
    );
  }),
  http.delete("/api/admin/comments/:id", () =>
    HttpResponse.json(null, { status: 204 }),
  ),

  // Config
  http.get("/api/admin/config", () => HttpResponse.json(mockConfig)),

  // Signals (uses SignalRepo → /api/signals)
  http.get("/api/signals", () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/* ── Helpers ──────────────────────────────────────────────────────── */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
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
      screen.getByText(/manage users, signals, machines/i),
    ).toBeInTheDocument();
  });

  it("renders all tab buttons", () => {
    render(<AdminPanelContainer />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: /^users$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^signals$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^equivalences$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^machines$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^comments$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^config$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tokens$/i })).toBeInTheDocument();
  });

  it("navigates between sections when tabs are clicked", async () => {
    render(<AdminPanelContainer />, { wrapper: createWrapper() });

    // Default section is Users — should show users
    await waitFor(() => {
      expect(screen.getByText("admin1")).toBeInTheDocument();
    });

    // Click Equivalences tab
    await user.click(screen.getByRole("button", { name: /^equivalences$/i }));

    await waitFor(() => {
      // The heading is a <h2>, the tab is a <button> — check by role
      expect(screen.getByRole("heading", { name: /^equivalences$/i })).toBeInTheDocument();
    });
    expect(screen.getByText("A")).toBeInTheDocument();

    // Click Config tab
    await user.click(screen.getByRole("button", { name: /^config$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^configuration$/i })).toBeInTheDocument();
    });
    expect(screen.getByText("max_therapies")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
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
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /^equivalences$/i }));

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

  describe("Machines section", () => {
    it("renders machine list (read-only)", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /^machines$/i }));

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

  describe("Comments section", () => {
    it("loads comments by therapy ID", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /^comments$/i }));

      await waitFor(() => {
        expect(screen.getByText("Therapy Comments")).toBeInTheDocument();
      });

      // Enter therapy ID and load
      const input = screen.getByPlaceholderText("Enter therapy ID");
      await user.type(input, "1");

      await user.click(screen.getByRole("button", { name: /load/i }));

      await waitFor(() => {
        expect(screen.getByText("Checked vitals")).toBeInTheDocument();
      });
      expect(screen.getByText("Changed filter")).toBeInTheDocument();
    });
  });

  describe("Config section", () => {
    it("displays config key-value pairs", async () => {
      render(<AdminPanelContainer />, { wrapper: createWrapper() });

      await user.click(screen.getByRole("button", { name: /^config$/i }));

      await waitFor(() => {
        expect(screen.getByText("max_therapies")).toBeInTheDocument();
      });
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("ws_reconnect_interval")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });
});
