import { useState, type FC } from "react";
import { Badge } from "../../../ui/primitives/badge";
import { Button } from "../../../ui/primitives/button";
import { cn } from "../../../ui/primitives";

export interface ScadaAlarm {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;
  acknowledged: boolean;
  source?: string;
}

interface AlarmPanelProps {
  alarms: ScadaAlarm[];
  onAcknowledge?: (alarmId: string) => void;
  maxVisible?: number;
  className?: string;
}

const severityConfig = {
  critical: { label: "CRITICAL", variant: "danger" as const },
  warning: { label: "WARNING", variant: "warning" as const },
  info: { label: "INFO", variant: "secondary" as const },
};

const AlarmPanel: FC<AlarmPanelProps> = ({
  alarms,
  onAcknowledge,
  maxVisible = 5,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...alarms].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const visible = expanded ? sorted : sorted.slice(0, maxVisible);
  const unackedCount = alarms.filter((a) => !a.acknowledged).length;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Alarms
          {unackedCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-100">
              {unackedCount}
            </span>
          )}
        </h3>
      </div>

      {alarms.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-400">No active alarms</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((alarm) => {
            const cfg = severityConfig[alarm.severity];
            return (
              <li
                key={alarm.id}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm",
                  alarm.acknowledged
                    ? "border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50"
                    : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {!alarm.acknowledged && (
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                  <p className="mt-1 text-neutral-700 dark:text-neutral-300 break-words">
                    {alarm.message}
                  </p>
                  <div className="mt-1 flex gap-3 text-xs text-neutral-400">
                    <span>{new Date(alarm.timestamp).toLocaleString()}</span>
                    {alarm.source && <span>Source: {alarm.source}</span>}
                  </div>
                </div>
                {!alarm.acknowledged && onAcknowledge && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAcknowledge(alarm.id)}
                    className="shrink-0"
                  >
                    Acknowledge
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {alarms.length > maxVisible && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show all (${alarms.length})`}
        </Button>
      )}
    </div>
  );
};
AlarmPanel.displayName = "AlarmPanel";

export { AlarmPanel };
