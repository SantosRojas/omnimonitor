/**
 * SCADA user preferences persisted in localStorage.
 */

/** Keys of signals the user chose to show (internal names). */
export type VisibleSignals = string[];

/** Per-pressure-gauge configuration for the cylinder view. */
export interface CylinderConfig {
  min: number;
  max: number;
  step: number;
}

/** Pressure gauge variants used by the cylinder view toggle. */
export type CylinderPressureType = "arterial" | "venous" | "tmp" | "filter" | "effluent";

const PREFIX = "omni-scada-";

export const preferencesStorage = {
  getVisibleSignals(): VisibleSignals | null {
    try {
      const raw = localStorage.getItem(`${PREFIX}visible-signals`);
      return raw ? (JSON.parse(raw) as VisibleSignals) : null;
    } catch {
      return null;
    }
  },

  setVisibleSignals(keys: VisibleSignals): void {
    localStorage.setItem(`${PREFIX}visible-signals`, JSON.stringify(keys));
  },

  getCylinderConfig(type: CylinderPressureType): CylinderConfig | null {
    try {
      const raw = localStorage.getItem(`${PREFIX}cylinder-${type}`);
      return raw ? (JSON.parse(raw) as CylinderConfig) : null;
    } catch {
      return null;
    }
  },

  setCylinderConfig(type: CylinderPressureType, config: CylinderConfig): void {
    localStorage.setItem(`${PREFIX}cylinder-${type}`, JSON.stringify(config));
  },
};
