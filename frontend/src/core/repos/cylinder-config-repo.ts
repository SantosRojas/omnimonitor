import type { CylinderConfig } from "../types";

export interface CylinderConfigRepo {
  list(): Promise<CylinderConfig[]>;
  update(
    pressureType: string,
    data: { min_value: number; max_value: number; step_value: number },
  ): Promise<CylinderConfig>;
  reset(): Promise<void>;
}
