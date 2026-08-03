import { memo, useMemo } from "react";
import { cn } from "../../../ui/primitives";
import type { CylinderConfig } from "../domain/cylinder-config";

interface PressureCylinderProps {
  label: string;
  value: number;
  unit: string;
  config: CylinderConfig;
  color: string;
  size?: "sm" | "md" | "lg";
  hasData?: boolean;
}

/**
 * Vertical pressure cylinder with fill level and tick labels.
 * Ported from pdms-omni `presentation/components/scada/pressure-cylinder.tsx`.
 */
export const PressureCylinder = memo(function PressureCylinder({
  label,
  value,
  unit,
  config,
  color,
  size = "md",
  hasData = true,
}: PressureCylinderProps) {
  const { min, max, step } = config;
  const range = max - min;
  const clamped = Math.max(min, Math.min(max, typeof value === "number" ? value : 0));
  const heightPct = range > 0 ? ((clamped - min) / range) * 100 : 0;
  const zeroPct = min < 0 && max > 0 ? ((0 - min) / range) * 100 : null;

  const ticks = useMemo(() => {
    const result: { value: number; pct: number }[] = [];
    for (let v = min; v <= max; v += step) {
      result.push({ value: v, pct: ((v - min) / range) * 100 });
    }
    return result;
  }, [min, max, step, range]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-baseline gap-0.5">
        {hasData ? (
          <>
            <span
              className={cn(
                "font-mono font-bold tabular-nums",
                size === "sm" ? "text-sm" : "text-base",
              )}
              style={{ color }}
            >
              {clamped.toFixed(0)}
            </span>
            <span
              className={cn(
                "text-scada-muted",
                size === "sm" ? "text-[10px]" : size === "lg" ? "text-[14px]" : "text-[12px]",
              )}
            >
              {unit}
            </span>
          </>
        ) : (
          <span
            className={cn(
              "font-mono font-bold tabular-nums text-scada-muted",
              size === "sm" ? "text-sm" : "text-base",
            )}
          >
            --
          </span>
        )}
      </div>

      <div className={cn("flex items-stretch gap-0.5", !hasData && "opacity-40")}>
        <div
          className={cn(
            "relative shrink-0",
            size === "sm" ? "h-28 w-8" : size === "lg" ? "h-44 w-12" : "h-36 w-10",
          )}
        >
          <div className="absolute inset-0 flex flex-col justify-end overflow-hidden rounded-md border border-white/10 bg-black/30 shadow-inner dark:bg-black/40">
            {zeroPct !== null && (
              <div
                className="absolute left-0 right-0 z-10 h-0.5 bg-white/40"
                style={{ bottom: `${zeroPct}%` }}
              />
            )}

            {hasData && (
              <div
                className="w-full transition-[height] duration-500 ease-out"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}60`,
                }}
              />
            )}

            <div className="pointer-events-none absolute inset-0">
              {ticks
                .filter((_, i) => i % 2 === 0)
                .map((tick) => (
                  <div
                    key={tick.value}
                    className="absolute left-0 right-0 h-px bg-white/10"
                    style={{ bottom: `${tick.pct}%` }}
                  />
                ))}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "relative shrink-0",
            size === "sm" ? "h-28 w-5" : size === "lg" ? "h-44 w-7" : "h-36 w-6",
          )}
        >
          {ticks
            .filter((_, i) => i % 2 === 0)
            .map((tick) => (
              <span
                key={tick.value}
                className={cn(
                  "absolute left-0 leading-none text-scada-muted tabular-nums",
                  size === "sm" ? "text-[8px]" : size === "lg" ? "text-[10px]" : "text-[9px]",
                )}
                style={{ bottom: `${tick.pct}%`, transform: "translateY(50%)" }}
              >
                {tick.value}
              </span>
            ))}
        </div>
      </div>

      <span
        className={cn(
          "font-mono font-medium uppercase tracking-wider text-scada-muted",
          size === "sm" ? "text-[9px]" : "text-xs",
        )}
      >
        {label}
      </span>
    </div>
  );
});
