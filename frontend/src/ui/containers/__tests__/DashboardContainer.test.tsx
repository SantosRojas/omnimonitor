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
import DashboardContainer from "../DashboardContainer";
import { useLiveDataStore } from "../../../store/live-data-store";
import { wsManager } from "../../../data/ws-manager";
import type { ReactNode } from "react";

/* ── Mock useNavigate ─────────────────────────────────────────── */

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

/* ── Test data ────────────────────────────────────────────────── */

const mockTherapies = [
  {
    therapy_id: 1,
    patient_id: 101,
    patient_external_id: "PAT-001",
    machine_id: 1001,
    machine_serial: "SN-001",
    machine_label: "Machine A",
    status: "active" as const,
    started_at: "2026-07-21T10:00:00Z",
    elapsed_seconds: 3600,
    pressures: {
      filter_pressure: 120,
      tmp_pressure: 80,
      effluent_pressure: 60,
    },
    flows: { net_rem_flow: 200, fs_mid_flow: 150 },
  },
  {
    therapy_id: 2,
    patient_id: 102,
    patient_external_id: "PAT-002",
    machine_id: 1002,
    machine_serial: "SN-002",
    machine_label: "Machine B",
    status: "active" as const,
    started_at: "2026-07-21T09:00:00Z",
    elapsed_seconds: 7200,
    pressures: {
      filter_pressure: 110,
      tmp_pressure: 70,
      effluent_pressure: 50,
    },
    flows: { net_rem_flow: 180, fs_mid_flow: 130 },
  },
];

/* ── MSW server ───────────────────────────────────────────────── */

const server = setupServer(
  http.get("/api/therapies", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    if (status === "active") {
      return HttpResponse.json(mockTherapies);
    }

    return HttpResponse.json([]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/* ── Helpers ──────────────────────────────────────────────────── */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
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

/* ── Tests ────────────────────────────────────────────────────── */

describe("DashboardContainer", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    useLiveDataStore.setState({ readings: {} });

    // Mock WebSocket so wsManager.connect() doesn't fail
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => ({
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close: vi.fn(),
        readyState: 1,
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    wsManager.disconnect();
  });

  it("renders the page header", () => {
    render(<DashboardContainer />, { wrapper: createWrapper() });

    expect(screen.getByText("Active Therapies")).toBeInTheDocument();
    expect(
      screen.getByText(/live view of all currently active therapies/i),
    ).toBeInTheDocument();
  });

  it("renders therapy rows after data loads", async () => {
    render(<DashboardContainer />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("PAT-001")).toBeInTheDocument();
    });

    expect(screen.getByText("PAT-002")).toBeInTheDocument();
    expect(screen.getByText("Machine A")).toBeInTheDocument();
    expect(screen.getByText("Machine B")).toBeInTheDocument();

    const scadaButtons = screen.getAllByRole("button", { name: /view scada/i });
    expect(scadaButtons).toHaveLength(2);
  });

  it("shows empty state when no therapies are returned", async () => {
    server.use(
      http.get("/api/therapies", () => HttpResponse.json([])),
    );

    render(<DashboardContainer />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByText("No active therapies"),
      ).toBeInTheDocument();
    });
  });

  it("shows error state on fetch failure", async () => {
    server.use(
      http.get("/api/therapies", () =>
        HttpResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        ),
      ),
    );

    render(<DashboardContainer />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load therapies"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("navigates to /dashboard/{machineId}/scada when SCADA button is clicked", async () => {
    render(<DashboardContainer />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("PAT-001")).toBeInTheDocument();
    });

    const scadaButtons = screen.getAllByRole("button", { name: /view scada/i });
    await user.click(scadaButtons[0]!);

    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1001/scada");
  });
});
