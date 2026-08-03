/**
 * Per-pressure-gauge cylinder configuration (value object).
 *
 * Ported from pdms-omni `domain/value-objects/cylinder-config.ts`.
 * Structurally compatible with the `CylinderConfig` type used by
 * `infrastructure/preferences.ts` (storage side).
 */

export interface CylinderConfig {
  min: number;
  max: number;
  step: number;
}

/** Pressure gauge variants available on the SCADA cylinder view. */
export type CylinderPressureType =
  | "arterial"
  | "venous"
  | "tmp"
  | "filter"
  | "effluent";

export const DEFAULT_CYLINDER_CONFIGS: Record<CylinderPressureType, CylinderConfig> = {
  arterial: { min: -400, max: 500, step: 100 },
  venous: { min: -400, max: 300, step: 100 },
  tmp: { min: 0, max: 80, step: 20 },
  filter: { min: 0, max: 500, step: 100 },
  effluent: { min: 0, max: 500, step: 100 },
};

/** All cylinder pressure types, in the order of the defaults record. */
export const CYLINDER_PRESSURE_TYPES = Object.keys(
  DEFAULT_CYLINDER_CONFIGS,
) as CylinderPressureType[];
