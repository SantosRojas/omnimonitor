import { create } from "zustand";

export interface BridgeStatusEntry {
  state: string;
  failure_count: number;
  ws_state: string;
  updated_at: string;
  lastUpdated: number;
}

export interface BridgeStatusState {
  bridges: Record<number, BridgeStatusEntry>;
}

export interface BridgeStatusActions {
  updateBridgeStatus: (
    bridgeId: number,
    state: string,
    failureCount: number,
    wsState: string,
    updatedAt: string,
  ) => void;
  removeBridge: (bridgeId: number) => void;
  clearAll: () => void;
}

export type BridgeStatusStore = BridgeStatusState & BridgeStatusActions;

export const useBridgeStatusStore = create<BridgeStatusStore>((set) => ({
  bridges: {},

  updateBridgeStatus: (bridgeId, state, failureCount, wsState, updatedAt) =>
    set((prev) => ({
      bridges: {
        ...prev.bridges,
        [bridgeId]: {
          state,
          failure_count: failureCount,
          ws_state: wsState,
          updated_at: updatedAt,
          lastUpdated: Date.now(),
        },
      },
    })),

  removeBridge: (bridgeId) =>
    set((prev) => {
      const next = { ...prev.bridges };
      delete next[bridgeId];
      return { bridges: next };
    }),

  clearAll: () => set({ bridges: {} }),
}));
