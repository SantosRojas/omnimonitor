import { describe, it, expect, beforeEach } from "vitest";
import { useBridgeStatusStore } from "../bridge-status-store";

/* ── Tests ────────────────────────────────────────────────────── */

describe("bridge-status-store", () => {
  beforeEach(() => {
    useBridgeStatusStore.setState({ bridges: {} });
  });

  it("initial state has empty bridges map", () => {
    const state = useBridgeStatusStore.getState();
    expect(state.bridges).toEqual({});
  });

  it("updateBridgeStatus adds a new bridge entry", () => {
    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "Running", 0, "connected", "2026-07-27T10:00:00Z");

    const state = useBridgeStatusStore.getState();
    expect(state.bridges[1]).toBeDefined();
    expect(state.bridges[1]!.state).toBe("Running");
    expect(state.bridges[1]!.failure_count).toBe(0);
    expect(state.bridges[1]!.ws_state).toBe("connected");
    expect(state.bridges[1]!.updated_at).toBe("2026-07-27T10:00:00Z");
    expect(typeof state.bridges[1]!.lastUpdated).toBe("number");
  });

  it("updateBridgeStatus replaces existing bridge entry", () => {
    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "Running", 0, "connected", "2026-07-27T10:00:00Z");

    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "FailedLimit", 5, "disconnected", "2026-07-27T10:01:00Z");

    const state = useBridgeStatusStore.getState();
    expect(state.bridges[1]!.state).toBe("FailedLimit");
    expect(state.bridges[1]!.failure_count).toBe(5);
    expect(state.bridges[1]!.ws_state).toBe("disconnected");
  });

  it("updateBridgeStatus handles multiple bridges", () => {
    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "Running", 0, "connected", "2026-07-27T10:00:00Z");

    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(2, "Initializing", 1, "reconnecting", "2026-07-27T10:00:05Z");

    const state = useBridgeStatusStore.getState();
    expect(state.bridges[1]!.state).toBe("Running");
    expect(state.bridges[2]!.state).toBe("Initializing");
    expect(Object.keys(state.bridges)).toHaveLength(2);
  });

  it("removeBridge deletes a bridge entry", () => {
    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "Running", 0, "connected", "2026-07-27T10:00:00Z");

    useBridgeStatusStore.getState().removeBridge(1);

    const state = useBridgeStatusStore.getState();
    expect(state.bridges[1]).toBeUndefined();
  });

  it("clearAll resets all bridge entries", () => {
    useBridgeStatusStore
      .getState()
      .updateBridgeStatus(1, "Running", 0, "connected", "2026-07-27T10:00:00Z");

    useBridgeStatusStore.getState().clearAll();

    const state = useBridgeStatusStore.getState();
    expect(state.bridges).toEqual({});
  });
});
