/** Per-pressure-gauge scale configuration, shared via the server. */
export interface CylinderConfig {
  pressure_type: CylinderPressureType;
  min_value: number;
  max_value: number;
  step_value: number;
}

export type CylinderPressureType =
  | "arterial"
  | "venous"
  | "tmp"
  | "filter"
  | "effluent";
