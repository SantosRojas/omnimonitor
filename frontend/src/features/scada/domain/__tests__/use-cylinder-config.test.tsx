import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useCylinderConfigs } from "../use-cylinder-config";
import {
  CYLINDER_PRESSURE_TYPES,
  DEFAULT_CYLINDER_CONFIGS,
} from "../cylinder-config";
import type { CylinderConfig as WireCylinderConfig } from "../../../../core/types";

/* ── Mock HttpCylinderConfigRepo ─────────────────────────────────── */

const { listMock, updateMock, resetMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock("../../../../data/repos/http-cylinder-config-repo", () => ({
  HttpCylinderConfigRepo: class {
    list = listMock;
    update = updateMock;
    reset = resetMock;
  },
}));

/* ── Fixtures ────────────────────────────────────────────────────── */

const DEFAULT_WIRE: WireCylinderConfig[] = [
  { pressure_type: "arterial", min_value: -400, max_value: 500, step_value: 100 },
  { pressure_type: "venous", min_value: -400, max_value: 300, step_value: 100 },
  { pressure_type: "tmp", min_value: 0, max_value: 80, step_value: 20 },
  { pressure_type: "filter", min_value: 0, max_value: 500, step_value: 100 },
  { pressure_type: "effluent", min_value: 0, max_value: 500, step_value: 100 },
];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/* ── Tests ──────────────────────────────────────────────────────── */

describe("useCylinderConfigs", () => {
  beforeEach(() => {
    listMock.mockReset();
    updateMock.mockReset();
    resetMock.mockReset();
  });

  it("loads server configs into the render shape", async () => {
    listMock.mockResolvedValue([
      ...DEFAULT_WIRE.map((c) =>
        c.pressure_type === "arterial" ? { ...c, max_value: 666 } : c,
      ),
    ]);

    const { result } = renderHook(() => useCylinderConfigs(), { wrapper });

    await waitFor(() => {
      expect(result.current.configs.arterial.max).toBe(666);
    });

    expect(result.current.configs.arterial.min).toBe(-400);
    expect(result.current.configs.arterial.step).toBe(100);
    expect(result.current.configs.venous.max).toBe(300);
  });

  it("falls back to defaults for any type missing from the server", async () => {
    listMock.mockResolvedValue([
      { pressure_type: "arterial", min_value: -100, max_value: 999, step_value: 50 },
    ]);

    const { result } = renderHook(() => useCylinderConfigs(), { wrapper });

    await waitFor(() => {
      expect(result.current.configs.arterial.max).toBe(999);
    });

    expect(CYLINDER_PRESSURE_TYPES).toHaveLength(5);
    for (const type of CYLINDER_PRESSURE_TYPES) {
      if (type === "arterial") continue;
      expect(result.current.configs[type]).toEqual(DEFAULT_CYLINDER_CONFIGS[type]);
    }
  });

  it("updateConfig calls repo.update with the full snake_case config and updates state", async () => {
    listMock.mockResolvedValue(DEFAULT_WIRE);
    updateMock.mockImplementation(async (type: string, data: unknown) => ({
      pressure_type: type,
      min_value: (data as { min_value: number }).min_value,
      max_value: (data as { max_value: number }).max_value,
      step_value: (data as { step_value: number }).step_value,
      updated_at: "2026-08-03T00:00:00Z",
    }));

    const { result } = renderHook(() => useCylinderConfigs(), { wrapper });

    await waitFor(() => {
      expect(result.current.configs.arterial.max).toBe(500);
    });

    result.current.updateConfig("arterial", "max", 600);

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("arterial", {
        min_value: -400,
        max_value: 600,
        step_value: 100,
      });
      expect(result.current.configs.arterial.max).toBe(600);
    });
  });

  it("resetConfigs calls repo.reset and restores the defaults", async () => {
    listMock
      .mockResolvedValueOnce([
        ...DEFAULT_WIRE.map((c) =>
          c.pressure_type === "arterial" ? { ...c, max_value: 777 } : c,
        ),
      ])
      .mockResolvedValue(DEFAULT_WIRE);
    resetMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCylinderConfigs(), { wrapper });

    await waitFor(() => {
      expect(result.current.configs.arterial.max).toBe(777);
    });

    result.current.resetConfigs();

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1);
      expect(result.current.configs.arterial).toEqual(
        DEFAULT_CYLINDER_CONFIGS.arterial,
      );
    });
  });
});
