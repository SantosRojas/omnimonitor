import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WsManager } from "../ws-manager";

/* ── Mock helpers ─────────────────────────────────────────────── */

interface MockWebSocket {
  onopen: ((() => void) | null);
  onmessage: (((event: { data: string }) => void) | null);
  onclose: ((() => void) | null);
  onerror: ((() => void) | null);
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

/* ── Tests ────────────────────────────────────────────────────── */

describe("WsManager", () => {
  let manager: WsManager;
  let mockWebSockets: MockWebSocket[];

  beforeEach(() => {
    manager = new WsManager();
    mockWebSockets = [];

    vi.stubGlobal(
      "WebSocket",
      vi.fn(function MockWebSocketConstructor() {
        const ws: MockWebSocket = {
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          close: vi.fn(),
          readyState: 1,
        };
        mockWebSockets.push(ws);
        return ws;
      }),
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    manager.disconnect();
  });

  /* ── Subscribe / Unsubscribe ──────────────────────────────── */

  describe("subscribe / unsubscribe", () => {
    it("returns an unsubscribe function", () => {
      const unsub = manager.subscribe("m1", vi.fn());
      expect(typeof unsub).toBe("function");
    });

    it("calls the callback when a matching message arrives", () => {
      const callback = vi.fn();
      manager.subscribe("m1", callback);
      manager.connect("ws://test");

      const msg = {
        type: "ReadingsBroadcast",
        machine_id: "m1",
        readings: [],
      };
      mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });

      expect(callback).toHaveBeenCalledWith(msg);
    });

    it("does NOT call callback for a different machine_id", () => {
      const callback = vi.fn();
      manager.subscribe("m2", callback);
      manager.connect("ws://test");

      mockWebSockets[0]!.onmessage!({
        data: JSON.stringify({
          type: "ReadingsBroadcast",
          machine_id: "m1",
          readings: [],
        }),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("unsubscribe removes the callback permanently", () => {
      const callback = vi.fn();
      const unsub = manager.subscribe("m1", callback);
      unsub();
      manager.connect("ws://test");

      mockWebSockets[0]!.onmessage!({
        data: JSON.stringify({
          type: "ReadingsBroadcast",
          machine_id: "m1",
          readings: [],
        }),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("direct unsubscribe removes the callback permanently", () => {
      const callback = vi.fn();
      manager.subscribe("m1", callback);
      manager.unsubscribe("m1", callback);
      manager.connect("ws://test");

      mockWebSockets[0]!.onmessage!({
        data: JSON.stringify({
          type: "ReadingsBroadcast",
          machine_id: "m1",
          readings: [],
        }),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("supports multiple callbacks for the same machine", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.subscribe("m1", cb1);
      manager.subscribe("m1", cb2);
      manager.connect("ws://test");

      const msg = {
        type: "ReadingsBroadcast",
        machine_id: "m1",
        readings: [],
      };
      mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  /* ── Exponential backoff ──────────────────────────────────── */

  describe("exponential backoff", () => {
    it("reconnects after 1 second on connection loss", () => {
      manager.connect("ws://test");

      mockWebSockets[0]!.onclose!();

      vi.advanceTimersByTime(999);
      expect(mockWebSockets).toHaveLength(1); // not yet

      vi.advanceTimersByTime(1);
      expect(mockWebSockets).toHaveLength(2); // reconnect
    });

    it("doubles the retry delay on successive failures", () => {
      manager.connect("ws://test");

      // 1st failure → 1s
      mockWebSockets[0]!.onclose!();
      vi.advanceTimersByTime(1000);
      expect(mockWebSockets).toHaveLength(2);

      // 2nd failure → 2s
      mockWebSockets[1]!.onclose!();
      vi.advanceTimersByTime(2000);
      expect(mockWebSockets).toHaveLength(3);

      // 3rd failure → 4s
      mockWebSockets[2]!.onclose!();
      vi.advanceTimersByTime(4000);
      expect(mockWebSockets).toHaveLength(4);
    });

    it("caps retry delay at 30 seconds", () => {
      manager.connect("ws://test");

      // Fail 5 times: delays 1→2→4→8→16 s (32 > 30, so cap at 30)
      for (let i = 0; i < 5; i++) {
        mockWebSockets[i]!.onclose!();
        vi.advanceTimersByTime((1 << i) * 1000); // 1, 2, 4, 8, 16
      }
      expect(mockWebSockets).toHaveLength(6);

      // 6th failure — should use the 30 s cap
      mockWebSockets[5]!.onclose!();

      vi.advanceTimersByTime(29_999);
      expect(mockWebSockets).toHaveLength(6); // still waiting

      vi.advanceTimersByTime(1);
      expect(mockWebSockets).toHaveLength(7); // reconnected at 30 s
    });

    it("resets retry delay to 1 s on successful reconnect", () => {
      manager.connect("ws://test");

      // First failure — retry at 1 s
      mockWebSockets[0]!.onclose!();
      vi.advanceTimersByTime(1000);
      expect(mockWebSockets).toHaveLength(2);

      // Successful reconnect: onopen fires → reset retryDelay to 1 000
      mockWebSockets[1]!.onopen!();

      // Fail again — should use 1 s (not 2 s)
      mockWebSockets[1]!.onclose!();
      vi.advanceTimersByTime(1000);
      expect(mockWebSockets).toHaveLength(3);
    });
  });

  /* ── Message handling ─────────────────────────────────────── */

  describe("message handling", () => {
    it("silently ignores messages without a machine_id (RESTFallback)", () => {
      const callback = vi.fn();
      manager.subscribe("m1", callback);
      manager.connect("ws://test");

      mockWebSockets[0]!.onmessage!({
        data: JSON.stringify({ type: "RESTFallback", reason: "overloaded" }),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("silently ignores malformed JSON (non-fatal)", () => {
      const callback = vi.fn();
      manager.subscribe("m1", callback);
      manager.connect("ws://test");

      // Should not throw
      mockWebSockets[0]!.onmessage!({ data: "not valid json {{{" });

      expect(callback).not.toHaveBeenCalled();
    });

    it("handles a misbehaving callback gracefully (does not break dispatch)", () => {
      const badCb = vi.fn(() => {
        throw new Error("callback error");
      });
      const goodCb = vi.fn();
      manager.subscribe("m1", badCb);
      manager.subscribe("m1", goodCb);
      manager.connect("ws://test");

      const msg = {
        type: "ReadingsBroadcast",
        machine_id: "m1",
        readings: [],
      };

      expect(() => {
        mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });
      }).not.toThrow();

      // Both callbacks should have been invoked (the error was caught internally)
      expect(badCb).toHaveBeenCalled();
      expect(goodCb).toHaveBeenCalled();
    });
  });

  /* ── Global subscribers ──────────────────────────────────── */

  describe("global subscribers", () => {
    it("subscribeGlobal returns an unsubscribe function", () => {
      const unsub = manager.subscribeGlobal(vi.fn());
      expect(typeof unsub).toBe("function");
    });

    it("calls global callback for non-machine messages (SerialStatus)", () => {
      const globalCb = vi.fn();
      manager.subscribeGlobal(globalCb);
      manager.connect("ws://test");

      const msg = {
        type: "SerialStatus",
        bridge_id: 1,
        state: "Running",
        failure_count: 0,
        ws_state: "connected",
        updated_at: "2026-07-27T10:00:00Z",
      };
      mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });

      expect(globalCb).toHaveBeenCalledWith(msg);
    });

    it("calls global callback for machine messages too", () => {
      const globalCb = vi.fn();
      manager.subscribeGlobal(globalCb);
      manager.connect("ws://test");

      const msg = {
        type: "ReadingsBroadcast",
        machine_id: "m1",
        readings: [],
      };
      mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });

      expect(globalCb).toHaveBeenCalledWith(msg);
    });

    it("unsubscribeGlobal removes the callback permanently", () => {
      const callback = vi.fn();
      const unsub = manager.subscribeGlobal(callback);
      unsub();
      manager.connect("ws://test");

      mockWebSockets[0]!.onmessage!({
        data: JSON.stringify({
          type: "SerialStatus",
          bridge_id: 1,
          state: "Running",
          failure_count: 0,
          ws_state: "connected",
          updated_at: "2026-07-27T10:00:00Z",
        }),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("supports multiple global callbacks", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.subscribeGlobal(cb1);
      manager.subscribeGlobal(cb2);
      manager.connect("ws://test");

      const msg = {
        type: "SerialStatus",
        bridge_id: 1,
        state: "Running",
        failure_count: 0,
        ws_state: "connected",
        updated_at: "2026-07-27T10:00:00Z",
      };
      mockWebSockets[0]!.onmessage!({ data: JSON.stringify(msg) });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });
});
