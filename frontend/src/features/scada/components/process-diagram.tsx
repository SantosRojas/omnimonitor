import { useTranslation } from "react-i18next";
import { Card } from "../../../ui/primitives/card";

interface ProcessDiagramProps {
  pressures: Record<string, { value: number | null; unit?: string | null }>;
  flows: Record<string, { value: number | null; unit?: string | null }>;
}

/**
 * Dialysis circuit schematic (patient → arterial → dialyzer → venous,
 * with effluent line and the three flow totals).
 * Ported from pdms-omni `presentation/components/scada/process-diagram.tsx`,
 * adapted to omni's `Reading` shape.
 */
export function ProcessDiagram({ pressures, flows }: ProcessDiagramProps) {
  const { t } = useTranslation();
  const fmt = (r: { value: number | null; unit?: string | null } | undefined, unit?: string) => {
    if (!r || r.value === null || r.value === undefined) return "---";
    return `${r.value} ${r.unit ?? unit ?? ""}`.trim();
  };

  return (
    <Card className="relative w-full overflow-hidden rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-scada-muted">
        {t("scada.processDiagram.title")}
      </h3>

      <div className="flex items-center justify-center gap-8">
        {/* Patient */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-scada-border bg-scada-card">
            <svg viewBox="0 0 48 48" className="h-10 w-10 text-scada-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="24" cy="12" r="6" />
              <path d="M10 44c0-8 6-16 14-16s14 8 14 16" />
            </svg>
          </div>
          <span className="text-[10px] text-scada-muted">{t("scada.processDiagram.patient")}</span>
        </div>

        {/* Arterial Line */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-12 bg-linear-to-r from-scada-press-ap/50 to-scada-press-ap" />
            <div className="h-2 w-2 rotate-45 border-b-2 border-r-2 border-scada-press-ap" />
          </div>
          <span className="font-mono text-xs text-scada-press-ap">
            {fmt(pressures["c_press_ap_act"], "mmHg")}
          </span>
          <span className="text-[10px] text-scada-muted">{t("scada.processDiagram.arterial")}</span>
        </div>

        {/* Dialyzer */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-scada-border bg-scada-card">
            <svg viewBox="0 0 40 60" className="h-14 w-10 text-scada-muted" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="5" y="2" width="30" height="56" rx="3" />
              <line x1="5" y1="12" x2="35" y2="12" strokeDasharray="2 2" />
              <line x1="5" y1="22" x2="35" y2="22" strokeDasharray="2 2" />
              <line x1="5" y1="32" x2="35" y2="32" strokeDasharray="2 2" />
              <line x1="5" y1="42" x2="35" y2="42" strokeDasharray="2 2" />
              <line x1="5" y1="52" x2="35" y2="52" strokeDasharray="2 2" />
            </svg>
          </div>
          <span className="text-[10px] text-scada-muted">{t("scada.processDiagram.dialyzer")}</span>
          <div className="flex gap-3 text-[10px] text-scada-muted">
            <span>
              FP:{" "}
              <span className="text-scada-press-fp">
                {fmt(pressures["c_press_fp_act"], "mmHg")}
              </span>
            </span>
            <span>
              TMP:{" "}
              <span className="text-scada-press-tmp">
                {fmt(pressures["c_press_tmp_act"], "mmHg")}
              </span>
            </span>
          </div>

          {/* Effluent line */}
          <div className="mt-1 flex flex-col items-center gap-0.5">
            <div className="h-3 w-0.5 bg-scada-press-ep" />
            <div className="flex items-center gap-1">
              <div className="h-0.5 w-10 bg-linear-to-r from-scada-press-ep/50 to-scada-press-ep" />
              <div className="h-2 w-2 rotate-45 border-b-2 border-r-2 border-scada-press-ep" />
              <span className="font-mono text-[10px] text-scada-press-ep">
                {fmt(pressures["c_press_ep_act"], "mmHg")}
              </span>
            </div>
            <div className="h-3 w-0.5 bg-scada-press-ep" />
            <svg viewBox="0 0 24 28" className="h-6 w-5 text-scada-press-ep" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="22" rx="2" />
              <path d="M12 4V1" />
              <line x1="7" y1="9" x2="17" y2="9" strokeDasharray="2 1" />
              <line x1="7" y1="14" x2="17" y2="14" strokeDasharray="2 1" />
              <line x1="7" y1="19" x2="14" y2="19" strokeDasharray="2 1" />
            </svg>
            <span className="text-[10px] text-scada-muted">{t("scada.processDiagram.effluent")}</span>
          </div>
        </div>

        {/* Venous Line */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-12 bg-linear-to-l from-scada-press-vp/50 to-scada-press-vp" />
            <div className="h-2 w-2 rotate-45 border-t-2 border-l-2 border-scada-press-vp" />
          </div>
          <span className="font-mono text-xs text-scada-press-vp">
            {fmt(pressures["c_press_vp_act"], "mmHg")}
          </span>
          <span className="text-[10px] text-scada-muted">{t("scada.processDiagram.venous")}</span>
        </div>
      </div>

      {/* Flows */}
      <div className="mt-3 flex justify-between gap-4 border-t border-scada-border pt-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-scada-flow-bf" />
          <div className="flex-1">
            <div className="flex justify-start gap-1 text-[10px]">
              <span className="text-scada-muted">{t("scada.processDiagram.bloodFlow")}</span>
              <span className="font-mono text-scada-flow-bf">
                {fmt(flows["c_pump_bs_bl_flow_act"], "ml/min")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-scada-flow-df" />
          <div className="flex-1">
            <div className="flex justify-start gap-1 text-[10px]">
              <span className="text-scada-muted">{t("scada.processDiagram.dialysisFlow")}</span>
              <span className="font-mono text-scada-flow-df">
                {fmt(flows["c_pump_fs_mid_flow_act"], "ml/min")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-scada-flow-nr" />
          <div className="flex-1">
            <div className="flex justify-start gap-1 text-[10px]">
              <span className="text-scada-muted">{t("scada.processDiagram.netRemoval")}</span>
              <span className="font-mono text-scada-flow-nr">
                {fmt(flows["c_net_rem_flow_act"], "ml/min")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
