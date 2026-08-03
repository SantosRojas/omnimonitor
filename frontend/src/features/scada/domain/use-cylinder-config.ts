import { useCallback, useState } from "react";
import { preferencesStorage } from "../infrastructure/preferences";
import {
  CYLINDER_PRESSURE_TYPES,
  DEFAULT_CYLINDER_CONFIGS,
  type CylinderConfig,
  type CylinderPressureType,
} from "./cylinder-config";

/**
 * Loads every cylinder config from preferences, falling back to the
 * defaults for any type the user has not customized.
 */
function loadAllConfigs(): Record<CylinderPressureType, CylinderConfig> {
  const result = { ...DEFAULT_CYLINDER_CONFIGS };
  for (const type of CYLINDER_PRESSURE_TYPES) {
    const stored = preferencesStorage.getCylinderConfig(type);
    if (stored) result[type] = stored;
  }
  return result;
}

/** Per-gauge min/max/step config for the SCADA cylinder view, persisted. */
export function useCylinderConfigs() {
  const [configs, setConfigsState] = useState<
    Record<CylinderPressureType, CylinderConfig>
  >(loadAllConfigs);

  const updateConfig = useCallback(
    (type: CylinderPressureType, field: keyof CylinderConfig, value: number) => {
      const current = configs[type] ?? DEFAULT_CYLINDER_CONFIGS[type];
      const updated = { ...current, [field]: value };
      preferencesStorage.setCylinderConfig(type, updated);
      setConfigsState((prev) => ({ ...prev, [type]: updated }));
    },
    [configs],
  );

  const resetConfigs = useCallback(() => {
    for (const type of CYLINDER_PRESSURE_TYPES) {
      preferencesStorage.setCylinderConfig(type, DEFAULT_CYLINDER_CONFIGS[type]);
    }
    setConfigsState({ ...DEFAULT_CYLINDER_CONFIGS });
  }, []);

  return { configs, updateConfig, resetConfigs };
}
