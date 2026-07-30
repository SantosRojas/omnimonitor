import type { ReactNode } from "react";

interface ChartTooltipPayloadEntry {
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<ChartTooltipPayloadEntry>;
  label?: string;
  unitMap?: Record<string, string>;
  contentStyle?: React.CSSProperties;
  labelClassName?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  unitMap = {},
  labelClassName = "",
}: ChartTooltipProps): ReactNode {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <p className={`mb-1 text-sm font-medium ${labelClassName}`}>{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry) => {
          const unit = entry.dataKey ? unitMap[String(entry.dataKey)] ?? "" : "";
          return (
            <div key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-neutral-600 dark:text-neutral-400">
                {entry.name}:
              </span>
              <span className="font-medium text-neutral-900 dark:text-white">
                {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}{" "}
                {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
