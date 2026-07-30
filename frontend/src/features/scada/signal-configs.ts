/** Signal configuration for SCADA and history charts. */

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
  unit?: string;
}

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
