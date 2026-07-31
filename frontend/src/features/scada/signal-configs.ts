/** Signal configuration for SCADA and history charts. */

import type { CylinderPressureType } from "./infrastructure/preferences";

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
  unit?: string;
}

export interface GaugeConfig {
  key: string;
  label: string;
  color: string;
  type: CylinderPressureType;
}

export interface FlowConfig {
  key: string;
  label: string;
  color: string;
  max: number;
}

/** Pressure gauges rendered on the SCADA page (AP, VP, TMP, FP, EP). */
export const PRESSURE_GAUGES: GaugeConfig[] = [
  { key: "c_press_ap_act", label: "Arterial", color: "#ef4444", type: "arterial" },
  { key: "c_press_vp_act", label: "Venoso", color: "#3b82f6", type: "venous" },
  { key: "c_press_tmp_act", label: "TMP", color: "#22c55e", type: "tmp" },
  { key: "c_press_fp_act", label: "Filtro", color: "#f59e0b", type: "filter" },
  { key: "c_press_ep_act", label: "Efluente", color: "#a855f7", type: "effluent" },
];

/** Animated flow indicators on the SCADA page (BS, DF, NR). */
export const FLOW_INDICATORS: FlowConfig[] = [
  { key: "c_pump_bs_bl_flow_act", label: "Flujo Sangre", color: "#a78bfa", max: 600 },
  { key: "c_pump_fs_mid_flow_act", label: "Flujo Diálisis", color: "#06b6d4", max: 800 },
  { key: "c_net_rem_flow_act", label: "Remoción Neta", color: "#f97316", max: 2000 },
];

/** Pressure series for historical charts (AP, VP, TMP, FP, EP). */
export const PRESSURE_SERIES: SeriesConfig[] = [
  { key: "c_press_ap_act", name: "AP", color: "#ef4444", unit: "mmHg" },
  { key: "c_press_vp_act", name: "VP", color: "#3b82f6", unit: "mmHg" },
  { key: "c_press_tmp_act", name: "TMP", color: "#22c55e", unit: "mmHg" },
  { key: "c_press_fp_act", name: "FP", color: "#f59e0b", unit: "mmHg" },
  { key: "c_press_ep_act", name: "EP", color: "#a855f7", unit: "mmHg" },
];

/** Flow series for historical charts (BS, DF, NR). */
export const FLOW_SERIES: SeriesConfig[] = [
  { key: "c_pump_bs_bl_flow_act", name: "BS", color: "#a78bfa", unit: "ml/min" },
  { key: "c_pump_fs_mid_flow_act", name: "DF", color: "#06b6d4", unit: "ml/min" },
  { key: "c_net_rem_flow_act", name: "NR", color: "#f97316", unit: "ml/h" },
];

/** Elapsed therapy time from the info reading, or undefined when absent. */
export function getAccumTherapyTime(info: Record<string, unknown>): string | undefined {
  const r = info["c_acc_therapy_time_act"] as
    | { value?: number | null; unit?: string | null }
    | undefined;
  if (!r || r.value === null || r.value === undefined) return undefined;
  return `${r.value} ${r.unit ?? "min"}`;
}

/** Accumulated net fluid removal from the info reading, or undefined when absent. */
export function getAccumNetRemoval(info: Record<string, unknown>): string | undefined {
  const r = info["c_acc_net_rem_vol_act"] as
    | { value?: number | null; unit?: string | null }
    | undefined;
  if (!r || r.value === null || r.value === undefined) return undefined;
  return `${r.value} ${r.unit ?? "ml"}`;
}
