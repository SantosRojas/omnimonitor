import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../ui/primitives";
import { Card } from "../../../ui/primitives/card";

interface TherapyStateMachineTimelineProps {
  currentState: string;
  therapyActive: boolean;
  /** Extra actions rendered inside the card below the timeline steps. */
  footer?: ReactNode;
}

const states = [
  { key: "preparation", labelKey: "scada.timeline.preparation" },
  { key: "connect", labelKey: "scada.timeline.connect" },
  { key: "therapy", labelKey: "scada.timeline.therapy" },
  { key: "end", labelKey: "scada.timeline.finish" },
];

/**
 * Maps a therapy-state value to its timeline step index.
 *
 * Two contracts are supported:
 * 1. Machine-level state names (the bridge's `c_trmt_main_state` vocabulary,
 *    same substring mapping as pdms-omni): "prepara" → 0, "conectar" → 1,
 *    "terapia" → 2, "fin"/"final" → 3.
 * 2. Database-level therapy statuses (what the server currently sends as
 *    `therapy_state_name` on ReadingsBroadcast): "planned" → 0 (setup done,
 *    first telemetry not yet seen), "active"/"paused" → 2 (session running),
 *    "completed"/"cancelled" → 3 (session over).
 *
 * Anything else → -1 (no active step).
 */
export function getTherapyStepIndex(currentState: string): number {
  const stateLower = currentState.toLowerCase();
  if (stateLower.includes("terapia")) return 2;
  if (stateLower.includes("prepara")) return 0;
  if (stateLower.includes("conectar")) return 1;
  if (stateLower.includes("fin") || stateLower.includes("final")) return 3;
  if (stateLower === "planned") return 0;
  if (stateLower === "active" || stateLower === "paused") return 2;
  if (stateLower === "completed" || stateLower === "cancelled") return 3;
  return -1;
}

/**
 * 4-step therapy timeline (preparation → connect → therapy → finish).
 * Ported from pdms-omni `presentation/components/scada/therapy-state-machine.tsx`.
 */
export function TherapyStateMachineTimeline({
  currentState,
  therapyActive,
  footer,
}: TherapyStateMachineTimelineProps) {
  const { t } = useTranslation();
  const activeIdx = getTherapyStepIndex(currentState);

  return (
    <Card className="flex-1 rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-scada-muted">
        {t("scada.timeline.title")}
      </h3>

      <div className="relative">
        <div className="absolute left-3 top-0 h-full w-0.5 bg-scada-border" />

        <div className="space-y-4">
          {states.map((s, i) => {
            const isActive = i === activeIdx;
            const isPast = i < activeIdx;

            return (
              <div key={s.key} className="relative flex items-center gap-3 pl-8">
                <div
                  className={cn(
                    "absolute left-2.25 h-3 w-3 -translate-x-1/2 rounded-full border-2",
                    isActive
                      ? "border-scada-accent bg-scada-accent shadow-[0_0_8px] shadow-scada-accent"
                      : isPast
                        ? "border-scada-success bg-scada-success"
                        : "border-scada-border bg-scada-surface",
                  )}
                />
                <span
                  className={cn(
                    "text-sm",
                    isActive
                      ? "font-semibold text-scada-accent"
                      : isPast
                        ? "text-scada-success"
                        : "text-scada-muted",
                  )}
                >
                  {t(s.labelKey)}
                  {isActive && therapyActive && (
                    <span className="ml-2 text-[10px] text-scada-accent">
                      {t("scada.timeline.inProgress")}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {footer && <div className="mt-3 flex gap-2">{footer}</div>}
    </Card>
  );
}
