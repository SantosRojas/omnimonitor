import { memo } from "react";

interface FlowIndicatorProps {
  value: number;
  max: number;
  unit: string;
  label: string;
  color?: string;
  animated?: boolean;
  decimals?: number;
  hasData?: boolean;
}

/**
 * Horizontal flow bar with animated shimmer.
 * Ported from pdms-omni `presentation/components/scada/flow-indicator.tsx`.
 */
export const FlowIndicator = memo(function FlowIndicator({
  value,
  max,
  unit,
  label,
  color = "#a78bfa",
  animated = true,
  decimals = 0,
  hasData = true,
}: FlowIndicatorProps) {
  const safeValue = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const clamped = Math.max(0, Math.min(max, safeValue));
  const pct = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-scada-muted">{label}</span>
        {hasData ? (
          <span className="font-mono text-sm font-semibold text-scada-text">
            {safeValue.toFixed(decimals)}{" "}
            <span className="text-xs text-scada-muted">{unit}</span>
          </span>
        ) : (
          <span className="font-mono text-sm font-semibold text-scada-muted">--</span>
        )}
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-scada-border">
        {hasData ? (
          <>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}60`,
              }}
            />
            {animated && (
              <div
                className="absolute inset-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-flow"
                style={{ filter: "blur(4px)" }}
              />
            )}
          </>
        ) : (
          <div className="h-full w-0 rounded-full" />
        )}
      </div>
    </div>
  );
});
