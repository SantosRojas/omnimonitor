import type { WsMessage } from "../core/types";

type MessageCallback = (msg: WsMessage) => void;

/**
 * Singleton WebSocket manager that maintains a single connection and routes
 * incoming messages to per-machine subscribers.
 *
 * Reconnection strategy — exponential backoff:
 *   1s → 2s → 4s → … capped at 30s, reset on successful reconnect.
 */
export class WsManager {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<MessageCallback>>();
  private globalSubscribers = new Set<MessageCallback>();
  private retryDelay = 1_000;
  private readonly maxRetryDelay = 30_000;
  private url = "";
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // ── Connection lifecycle ────────────────────────────────────────

  /**
   * Opens a WebSocket connection to `url`. If already connected, disconnects
   * first.
   */
  connect(url: string): void {
    if (this.ws) {
      this.disconnect();
    }

    this.url = url;
    this.shouldReconnect = true;
    this.intentionalClose = false;
    this.createConnection();
  }

  /**
   * Gracefully closes the WebSocket and cancels any pending reconnect.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    this.retryDelay = 1_000;
  }

  // ── Subscription management ─────────────────────────────────────

  /**
   * Subscribes a callback to messages for a given `machineId`. Returns an
   * unsubscribe function.
   */
  subscribe(
    machineId: string,
    callback: MessageCallback,
  ): () => void {
    const existing = this.subscribers.get(machineId);
    if (existing) {
      existing.add(callback);
    } else {
      this.subscribers.set(machineId, new Set([callback]));
    }

    return () => this.unsubscribe(machineId, callback);
  }

  /**
   * Removes a specific callback for the given `machineId`.
   */
  unsubscribe(machineId: string, callback: MessageCallback): void {
    const set = this.subscribers.get(machineId);
    if (!set) return;

    set.delete(callback);
    if (set.size === 0) {
      this.subscribers.delete(machineId);
    }
  }

  /**
   * Subscribes a callback to ALL messages (including non-machine messages
   * like SerialStatus). Returns an unsubscribe function.
   */
  subscribeGlobal(callback: MessageCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  // ── Internal helpers ────────────────────────────────────────────

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      // URL was invalid or something else prevented the constructor
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retryDelay = 1_000; // reset backoff on successful connect
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        this.dispatch(msg);
      } catch {
        // Malformed JSON — silently drop
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect && !this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so reconnect logic lives there
    };
  }

  private dispatch(msg: WsMessage): void {
    // Route non-machine messages to global subscribers
    const machineId =
      (msg as Extract<WsMessage, { machine_id: string }>).machine_id;

    // Always route to global subscribers (SerialStatus, RESTFallback, etc.)
    for (const cb of this.globalSubscribers) {
      try {
        cb(msg);
      } catch {
        // Never let a misbehaving callback break the dispatch loop
      }
    }

    // Also route machine-specific messages to per-machine subscribers
    if (!machineId) return;

    const cbs = this.subscribers.get(machineId);
    if (!cbs) return;

    for (const cb of cbs) {
      try {
        cb(msg);
      } catch {
        // Never let a misbehaving callback break the dispatch loop
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.createConnection();
      }
    }, this.retryDelay);

    this.retryDelay = Math.min(
      this.retryDelay * 2,
      this.maxRetryDelay,
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Application-wide singleton WebSocket manager. */
export const wsManager = new WsManager();
