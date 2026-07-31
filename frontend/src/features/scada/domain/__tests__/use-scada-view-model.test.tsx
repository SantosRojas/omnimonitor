import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  beforeEach,
} from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useScadaViewModel } from "../use-scada-view-model";
import { useScadaStore } from "../scada-store";
import type { TelemetryReading } from "../scada-store";
import { SIGNAL_NAMES } from "../signal-classifier";
import type { Signal } from "../../../../core/types";

/* ── MSW server ──────────────────────────────────────────────────── */

const mockSignals: Signal[] = [
  { id: 1, internal_name: SIGNAL_NAMES.PRESSURES[0], display_name: "AP", unit: "mmHg" },
  { id: 2, internal_name: SIGNAL_NAMES.INFO[0], display_name: "Patient ID", unit: null },
];

const server = setupServer(
  http.get("/api/signals", () => HttpResponse.json(mockSignals)),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/* ── Helpers ──────────────────────────────────────────────────────── */

function reading(overrides: Partial<TelemetryReading> = {}): TelemetryReading {
  return {
    id: 1,
    machine_id: 1,
    therapy_id: null,
    signal_id: null,
    internal_name: "c_press_ap_act",
    recorded_at: "2026-07-31T10:00:00Z",
    raw_value: 100,
    value: 100,
    unit: "mmHg",
    display_label: null,
    phase: null,
    created_at: "2026-07-31T10:00:00Z",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("useScadaViewModel", () => {
  beforeEach(() => {
    useScadaStore.setState({ machines: {} });
  });

  it("returns empty defaults for an unknown machine", async () => {
    const { result } = renderHook(() => useScadaViewModel("unknown"), { wrapper });

    await waitFor(() => {
      expect(result.current.presentation.displayNameMap).toEqual({
        [SIGNAL_NAMES.PRESSURES[0]]: "AP",
        [SIGNAL_NAMES.INFO[0]]: "Patient ID",
      });
    });

    expect(result.current.telemetry.pressures).toEqual({});
    expect(result.current.telemetry.flows).toEqual({});
    expect(result.current.telemetry.info).toEqual({});
    expect(result.current.telemetry.history).toEqual([]);
    expect(result.current.therapy.active).toBe(false);
    expect(result.current.therapy.stateName).toBe("");
    expect(result.current.therapy.id).toBeUndefined();
    expect(result.current.presentation.therapyTimeDisplay).toBeUndefined();
    expect(result.current.presentation.netRemovalDisplay).toBeUndefined();
    expect(result.current.device.serialNumber).toBeUndefined();
  });

  it("mirrors the classified store state for the machine", async () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({ id: 1, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 120 }),
        reading({ id: 2, internal_name: SIGNAL_NAMES.FLOWS[0], value: 250 }),
      ],
      3,
      true,
      "Running",
      null,
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(Object.keys(result.current.presentation.displayNameMap)).toHaveLength(2);
    });

    expect(result.current.telemetry.pressures[SIGNAL_NAMES.PRESSURES[0]]!.value).toBe(120);
    expect(result.current.telemetry.flows[SIGNAL_NAMES.FLOWS[0]]!.value).toBe(250);
    expect(result.current.therapy.active).toBe(true);
    expect(result.current.therapy.stateName).toBe("Running");
  });

  it("finds the therapy id from a classified reading", async () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({
          id: 1,
          internal_name: SIGNAL_NAMES.PRESSURES[0],
          therapy_id: 77,
        }),
      ],
      1,
      true,
      "Running",
      null,
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(result.current.therapy.id).toBe(77);
    });
  });

  it("exposes the serial number from the info bucket", async () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({
          id: 1,
          internal_name: "d_serial_number_to_odi",
          // Info readings carry string payloads (serial numbers); the shared
          // Reading type types value as number|null, so cast at the boundary.
          value: "OMNI-999" as unknown as number,
        }),
      ],
      1,
      false,
      "",
      null,
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(result.current.device.serialNumber).toBe("OMNI-999");
    });
  });

  it("falls back to the accumulated therapy time info reading", async () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({
          id: 1,
          internal_name: "c_acc_therapy_time_act",
          value: 45,
          unit: "min",
        }),
      ],
      1,
      false,
      "",
      null,
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(result.current.presentation.therapyTimeDisplay).toBe("45 min");
    });
  });

  it("formats the net removal from the info reading", async () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({
          id: 1,
          internal_name: "c_acc_net_rem_vol_act",
          value: 1200,
          unit: "ml",
        }),
      ],
      1,
      false,
      "",
      null,
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(result.current.presentation.netRemovalDisplay).toBe("1200 ml");
    });
  });

  it("falls back to internal_name when a signal has no display name", async () => {
    server.use(
      http.get("/api/signals", () =>
        HttpResponse.json([{ id: 9, internal_name: "sig_x", display_name: null, unit: null }]),
      ),
    );

    const { result } = renderHook(() => useScadaViewModel("m1"), { wrapper });

    await waitFor(() => {
      expect(result.current.presentation.displayNameMap).toEqual({ sig_x: "sig_x" });
    });
  });
});
