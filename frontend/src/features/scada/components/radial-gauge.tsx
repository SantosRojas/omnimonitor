import { memo, useMemo } from "react";
import { cn } from "../../../ui/primitives";

interface RadialGaugeProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  decimals?: number;
  warning?: number;
  critical?: number;
  tickCount?: number;
  hasData?: boolean;
}

/**
 * SVG 270° radial gauge. Ported from pdms-omni
 * `presentation/components/scada/radial-gauge.tsx`.
 */
export const RadialGauge = memo(function RadialGauge({
  value,
  min,
  max,
  unit,
  label,
  color = "#00d4ff",
  size = "md",
  decimals = 0,
  warning,
  critical,
  tickCount = 6,
  hasData = true,
}: RadialGaugeProps) {
  const clamped = Math.max(
    min,
    Math.min(max, typeof value === "number" && !Number.isNaN(value) ? value : 0),
  );
  const range = max - min;
  const fraction = range > 0 ? (clamped - min) / range : 0;

  const radius = size === "sm" ? 50 : size === "lg" ? 80 : 65;
  const strokeWidth = size === "sm" ? 6 : 8;
  const center = radius + strokeWidth + 4;
  const viewBox = center * 2;

  const startAngle = -135;
  const endAngle = 135;
  const sweepAngle = 270;

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
    const s = polarToCartesian(cx, cy, r, start);
    const e = polarToCartesian(cx, cy, r, end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const bgArc = describeArc(center, center, radius, startAngle, endAngle);
  const arcEnd = startAngle + fraction * sweepAngle;
  const clampedEnd = Math.min(arcEnd, endAngle);
  const valueArc = fraction > 0 ? describeArc(center, center, radius, startAngle, clampedEnd) : "";

  const dotAngle = Math.max(startAngle, Math.min(arcEnd, endAngle));
  const dotPos = polarToCartesian(center, center, radius, dotAngle);

  const ticks = useMemo(() => {
    const steps = tickCount - 1;
    const angleStep = sweepAngle / steps;
    const tickLen = size === "sm" ? 5 : 7;
    const labelR = radius + tickLen + 10;
    const tickOuterR = radius + tickLen;
    const result: {
      angle: number;
      label: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lx: number;
      ly: number;
    }[] = [];

    for (let i = 0; i < tickCount; i++) {
      const angle = startAngle + i * angleStep;
      const val = min + (range * i) / steps;
      const inner = polarToCartesian(center, center, radius - 2, angle);
      const outer = polarToCartesian(center, center, tickOuterR, angle);
      const lblPos = polarToCartesian(center, center, labelR, angle);
      result.push({
        angle,
        label: val.toFixed(0),
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        lx: lblPos.x,
        ly: lblPos.y,
      });
    }
    return result;
  }, [center, radius, startAngle, sweepAngle, tickCount, min, range, size]);

  let indicatorColor = color;
  if (hasData) {
    if (critical !== undefined && clamped >= critical) indicatorColor = "#ef4444";
    else if (warning !== undefined && clamped >= warning) indicatorColor = "#f59e0b";
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        viewBox={`0 0 ${viewBox} ${viewBox + 10}`}
        className={cn(
          size === "sm" ? "h-28 w-28" : size === "lg" ? "h-44 w-44" : "h-36 w-36",
          !hasData && "opacity-40",
        )}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="currentColor"
              className={i === 0 || i === tickCount - 1 ? "text-white/40" : "text-white/15"}
              strokeWidth={i === 0 || i === tickCount - 1 ? 1.5 : 1}
              strokeLinecap="round"
            />
            {(i === 0 || i === Math.floor(tickCount / 2) || i === tickCount - 1) && (
              <text
                x={t.lx}
                y={t.ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                className={cn(
                  "text-scada-muted",
                  size === "sm" ? "text-[8px]" : size === "lg" ? "text-[10px]" : "text-[9px]",
                )}
              >
                {t.label}
              </text>
            )}
          </g>
        ))}

        <path
          d={bgArc}
          fill="none"
          stroke="currentColor"
          className="text-scada-border"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {hasData && fraction > 0 && (
          <path
            d={valueArc}
            fill="none"
            stroke={indicatorColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${indicatorColor}40)` }}
          />
        )}
        <text
          x={center}
          y={center - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          className={cn("font-mono font-bold", size === "sm" ? "text-sm" : "text-base")}
        >
          {hasData ? value.toFixed(decimals) : "--"}
        </text>
        <text
          x={center}
          y={center + 14}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          className={cn(
            "text-scada-muted",
            size === "sm" ? "text-[10px]" : size === "lg" ? "text-[14px]" : "text-[12px]",
          )}
        >
          {unit}
        </text>
        {hasData && <circle cx={dotPos.x} cy={dotPos.y} r={3} fill={indicatorColor} />}
      </svg>
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
