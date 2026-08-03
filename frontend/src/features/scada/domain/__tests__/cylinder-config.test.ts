import { describe, expect, it } from "vitest";
import {
  CYLINDER_PRESSURE_TYPES,
  DEFAULT_CYLINDER_CONFIGS,
} from "../cylinder-config";

describe("DEFAULT_CYLINDER_CONFIGS", () => {
  it("covers every cylinder pressure type", () => {
    expect(CYLINDER_PRESSURE_TYPES).toEqual([
      "arterial",
      "venous",
      "tmp",
      "filter",
      "effluent",
    ]);
  });

  it("has a valid min/max/step for every gauge", () => {
    for (const type of CYLINDER_PRESSURE_TYPES) {
      const cfg = DEFAULT_CYLINDER_CONFIGS[type];
      expect(cfg, `missing config for ${type}`).toBeDefined();
      expect(cfg!.min).toBeLessThan(cfg!.max);
      expect(cfg!.step).toBeGreaterThan(0);
    }
  });

  it("spans negative-to-positive ranges for arterial and venous", () => {
    expect(DEFAULT_CYLINDER_CONFIGS.arterial.min).toBeLessThan(0);
    expect(DEFAULT_CYLINDER_CONFIGS.venous.min).toBeLessThan(0);
    expect(DEFAULT_CYLINDER_CONFIGS.arterial.max).toBeGreaterThan(0);
    expect(DEFAULT_CYLINDER_CONFIGS.venous.max).toBeGreaterThan(0);
  });
});
