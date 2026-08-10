import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { cn, Badge } from "../../../ui/primitives";
import { formatDateTime } from "../../../core/utils/format";

export type TherapyState =
  | "idle"
  | "priming"
  | "running"
  | "paused"
  | "alarm"
  | "complete"
  | "error";

interface TherapyStateMachineProps {
  state: TherapyState;
  patientName?: string;
  therapyType?: string;
  startedAt?: string;
  className?: string;
}

const stateConfig: Record<
  TherapyState,
  { variant: "default" | "secondary" | "success" | "warning" | "danger" | "outline"; color: string; anim: boolean }
> = {
  idle:      { variant: "outline",   color: "bg-neutral-200 dark:bg-neutral-700",     anim: false },
  priming:   { variant: "secondary", color: "bg-blue-200 dark:bg-blue-800",           anim: true  },
  running:   { variant: "success",   color: "bg-green-200 dark:bg-green-800",         anim: false },
  paused:    { variant: "warning",   color: "bg-yellow-200 dark:bg-yellow-800",       anim: false },
  alarm:     { variant: "danger",    color: "bg-red-200 dark:bg-red-800",             anim: true  },
  complete:  { variant: "default",   color: "bg-neutral-300 dark:bg-neutral-600",     anim: false },
  error:     { variant: "danger",    color: "bg-red-300 dark:bg-red-900",             anim: true  },
};

const TherapyStateMachine: FC<TherapyStateMachineProps> = ({
  state,
  patientName,
  therapyType,
  startedAt,
  className,
}) => {
  const { t } = useTranslation();
  const cfg = stateConfig[state];

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full",
              cfg.color,
              cfg.anim && "animate-pulse",
            )}
          >
            <span
              className={cn(
                "h-3 w-3 rounded-full",
                state === "idle" && "bg-neutral-400",
                state === "priming" && "bg-blue-500",
                state === "running" && "bg-green-500",
                state === "paused" && "bg-yellow-500",
                state === "alarm" && "bg-red-500",
                state === "complete" && "bg-neutral-500",
                state === "error" && "bg-red-600",
              )}
            />
          </div>
          <div>
            <Badge variant={cfg.variant}>
              {t(`state.${state}`)}
            </Badge>
            {therapyType && (
              <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                {therapyType}
              </span>
            )}
          </div>
        </div>
      </div>

      {(patientName || startedAt) && (
        <div className="mt-3 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          {patientName && <span>{t("scada.stateMachine.patient", { name: patientName })}</span>}
          {startedAt && <span>{t("scada.stateMachine.started", { time: formatDateTime(startedAt) })}</span>}
        </div>
      )}
    </div>
  );
};
TherapyStateMachine.displayName = "TherapyStateMachine";

export { TherapyStateMachine };
