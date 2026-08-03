import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore, MAX_HISTORY } from "../scada-store";
import type { TelemetryReading } from "../scada-store";
import { SIGNAL_NAMES } from "../signal-classifier";

/* ── Fixtures ────────────────────────────────────────────────────── */

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
    phase: null,
    created_at: "2026-07-31T10:00:00Z",
    ...overrides,
  };
}

function broadcast(overrides: Partial<TelemetryReading> = {}) {
  return [reading(overrides)];
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("scada-store", () => {
  beforeEach(() => {
    useScadaStore.setState({ machines: {} });
  });

  it("initial state has empty machines map", () => {
    expect(useScadaStore.getState().machines).toEqual({});
  });

  it("classifies readings into pressures, flows, and info buckets", () => {
    const readings = [
      reading({ id: 1, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 120 }),
      reading({ id: 2, internal_name: SIGNAL_NAMES.FLOWS[0], value: 250 }),
      reading({ id: 3, internal_name: SIGNAL_NAMES.INFO[0], value: 42 }),
    ];

    useScadaStore.getState().updateReadings("m1", readings, 1, true, "Running", null);

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(Object.keys(machine.pressures)).toEqual([SIGNAL_NAMES.PRESSURES[0]]);
    expect(Object.keys(machine.flows)).toEqual([SIGNAL_NAMES.FLOWS[0]]);
    expect(Object.keys(machine.info)).toEqual([SIGNAL_NAMES.INFO[0]]);
    expect(machine.pressures[SIGNAL_NAMES.PRESSURES[0]]!.value).toBe(120);
    expect(machine.flows[SIGNAL_NAMES.FLOWS[0]]!.value).toBe(250);
  });

  it("stores therapy state, cycle, and preserves the connected flag", () => {
    useScadaStore.getState().setConnected("m1", true);

    useScadaStore.getState().updateReadings(
      "m1",
      broadcast(),
      7,
      true,
      "Running",
      "2026-07-31T10:00:00Z",
    );

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(machine.therapyActive).toBe(true);
    expect(machine.therapyStateName).toBe("Running");
    expect(machine.therapyStart).toBe("2026-07-31T10:00:00Z");
    expect(machine.cycle).toBe(7);
    expect(machine.connected).toBe(true);
  });

  it("persists info readings across broadcasts when omitted", () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({ id: 1, internal_name: SIGNAL_NAMES.INFO[0], value: 42 }),
        reading({ id: 2, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 100 }),
      ],
      1,
      false,
      "",
      null,
    );

    // Second broadcast omits the info signal but carries a new pressure.
    useScadaStore.getState().updateReadings(
      "m1",
      [reading({ id: 3, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 120 })],
      2,
      false,
      "",
      null,
    );

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(machine.info[SIGNAL_NAMES.INFO[0]]!.value).toBe(42);
    expect(machine.pressures[SIGNAL_NAMES.PRESSURES[0]]!.value).toBe(120);
  });

  it("rebuilds pressures and flows from the latest broadcast only", () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({ id: 1, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 100 }),
        reading({ id: 2, internal_name: SIGNAL_NAMES.PRESSURES[1], value: 90 }),
      ],
      1,
      false,
      "",
      null,
    );

    // Latest broadcast only carries the first pressure: the second must drop.
    useScadaStore.getState().updateReadings(
      "m1",
      [reading({ id: 3, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 130 })],
      2,
      false,
      "",
      null,
    );

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(Object.keys(machine.pressures)).toEqual([SIGNAL_NAMES.PRESSURES[0]]);
    expect(machine.pressures[SIGNAL_NAMES.PRESSURES[0]]!.value).toBe(130);
  });

  it("appends one history point per broadcast with numeric values", () => {
    useScadaStore.getState().updateReadings(
      "m1",
      [
        reading({ id: 1, internal_name: SIGNAL_NAMES.PRESSURES[0], value: 100 }),
        reading({ id: 2, internal_name: SIGNAL_NAMES.FLOWS[0], value: 250 }),
        reading({ id: 3, internal_name: SIGNAL_NAMES.INFO[0], value: 42 }),
      ],
      1,
      false,
      "",
      null,
    );

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(machine.history).toHaveLength(1);
    const point = machine.history[0]!;
    expect(typeof point.timestamp).toBe("string");
    expect(point[SIGNAL_NAMES.PRESSURES[0]]).toBe(100);
    expect(point[SIGNAL_NAMES.FLOWS[0]]).toBe(250);
    // Info readings must not leak into the numeric history point.
    expect(point[SIGNAL_NAMES.INFO[0]]).toBeUndefined();
  });

  it("caps history at MAX_HISTORY points", () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      useScadaStore.getState().updateReadings(
        "m1",
        [reading({ id: i, internal_name: SIGNAL_NAMES.PRESSURES[0], value: i })],
        i,
        false,
        "",
        null,
      );
    }

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(machine.history).toHaveLength(MAX_HISTORY);
    // The first broadcast's point must have been dropped (0 was its value).
    expect(machine.history[0]![SIGNAL_NAMES.PRESSURES[0]]).toBe(5);
    expect(machine.history[MAX_HISTORY - 1]![SIGNAL_NAMES.PRESSURES[0]]).toBe(
      MAX_HISTORY + 4,
    );
  });

  it("setConnected only toggles connectivity and keeps telemetry", () => {
    useScadaStore.getState().updateReadings("m1", broadcast(), 1, false, "", null);
    useScadaStore.getState().setConnected("m1", true);

    const machine = useScadaStore.getState().machines["m1"]!;
    expect(machine.connected).toBe(true);
    expect(machine.pressures[SIGNAL_NAMES.PRESSURES[0]]).toBeDefined();
    expect(machine.cycle).toBe(1);
  });

  it("reset removes only the target machine", () => {
    useScadaStore.getState().updateReadings("m1", broadcast(), 1, false, "", null);
    useScadaStore.getState().updateReadings("m2", broadcast(), 1, false, "", null);

    useScadaStore.getState().reset("m1");

    const state = useScadaStore.getState();
    expect(state.machines["m1"]).toBeUndefined();
    expect(state.machines["m2"]).toBeDefined();
  });
});
