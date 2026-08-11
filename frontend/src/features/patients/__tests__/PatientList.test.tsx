import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PatientList from "../PatientList";
import { useAuthStore } from "../../../store/auth-store";
import type { ReactNode } from "react";
import type { Patient } from "../../../core/types";

/* ── Mocks ─────────────────────────────────────────────────────── */

const { exportToExcel } = vi.hoisted(() => ({ exportToExcel: vi.fn() }));

vi.mock("../../../core/utils/exportExcel", () => ({ exportToExcel }));

const { mockPatients } = vi.hoisted(() => ({
  mockPatients: [
    {
      id: 1,
      external_id: "DNI-001",
      name: "Ana Alba",
      age: 42,
      email: "ana@example.com",
      address: "Calle 1",
      created_at: "2026-07-20T10:00:00Z",
      updated_at: null,
    },
    {
      id: 2,
      external_id: "DNI-002",
      name: "Bruno Bravo",
      age: 55,
      email: null,
      address: null,
      created_at: "2026-07-21T09:30:00Z",
      updated_at: null,
    },
  ],
}));

vi.mock("../../../data/repos/http-patient-repo", () => ({
  HttpPatientRepo: class {
    async list({ search }: { search?: string } = {}) {
      if (!search) return mockPatients;
      const q = search.toLowerCase();
      return mockPatients.filter(
        (p: { external_id: string; name: string | null }) =>
          p.external_id.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q),
      );
    }
    async update() {}
  },
}));

/* ── Helpers ─────────────────────────────────────────────────────── */

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

describe("PatientList", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      token: "test-token",
      user: {
        id: 1,
        username: "admin",
        email: null,
        role: "admin",
        created_at: "2026-01-01T00:00:00Z",
      },
      isAuthenticated: true,
    });
  });

  it("exports the full patient list via exportToExcel", async () => {
    render(<PatientList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("DNI-001")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /export excel/i }));

    expect(exportToExcel).toHaveBeenCalledTimes(1);
    expect(exportToExcel).toHaveBeenCalledWith(
      mockPatients,
      expect.any(Array),
      "patients.xlsx",
    );
  });

  it("exports only the currently filtered list", async () => {
    render(<PatientList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("DNI-001")).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText(/search by dni or name/i),
      "alba",
    );

    await waitFor(() => {
      expect(screen.queryByText("DNI-002")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /export excel/i }));

    expect(exportToExcel).toHaveBeenCalledTimes(1);
    const rows = exportToExcel.mock.calls[0]![0] as Patient[];
    expect(rows).toEqual([mockPatients[0]]);
  });
});
