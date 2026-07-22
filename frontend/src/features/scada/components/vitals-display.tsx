import type { FC, ReactNode } from "react";
import { cn } from "../../../ui/primitives";

export interface Vital {
  label: string;
  value: string;
  unit?: string;
  trend?: "up" | "down" | "stable";
  status?: "normal" | "warning" | "critical";
  icon?: ReactNode;
}

interface VitalsDisplayProps {
  vitals: Vital[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const statusColors = {
  normal: "text-green-600 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  critical: "text-red-600 dark:text-red-400",
};

const trendIcons = {
  up: "↑",
  down: "↓",
  stable: "→",
};

const VitalsDisplay: FC<VitalsDisplayProps> = ({
  vitals,
  columns = 3,
  className,
}) => {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  return (
    <div className={cn("grid gap-3", gridCols[columns], className)}>
      {vitals.map((v, i) => (
        <div
          key={i}
          className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="flex items-center gap-1.5">
            {v.icon}
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {v.label}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={cn(
                "text-xl font-semibold",
                statusColors[v.status ?? "normal"],
              )}
            >
              {v.value}
            </span>
            {v.unit && (
              <span className="text-xs text-neutral-400">{v.unit}</span>
            )}
            {v.trend && (
              <span className="text-sm text-neutral-400">{trendIcons[v.trend]}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
VitalsDisplay.displayName = "VitalsDisplay";

export { VitalsDisplay };
