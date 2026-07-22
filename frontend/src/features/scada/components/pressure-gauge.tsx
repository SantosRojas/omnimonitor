import type { FC } from "react";
import { cn } from "../../../ui/primitives";

interface PressureGaugeProps {
  /** Current pressure in cmH2O */
  pressure: number;
  /** Maximum scale value */
  maxPressure?: number;
  /** Warning threshold */
  warningThreshold?: number;
  /** Critical threshold */
  criticalThreshold?: number;
  unit?: string;
  label?: string;
  className?: string;
  /** Gauge diameter in px */
  size?: number;
}

const PressureGauge: FC<PressureGaugeProps> = ({
  pressure,
  maxPressure = 60,
  warningThreshold = 40,
  criticalThreshold = 50,
  unit = "cmH₂O",
  label,
  className,
  size = 160,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 20) / 2;
  const strokeWidth = 12;
  const normalizedAngle = Math.min(pressure / maxPressure, 1) * 270 - 135;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const start = polarToCartesian(-135);
  const end = polarToCartesian(normalizedAngle);

  const arcPath = (() => {
    if (pressure <= 0) return "";
    const largeArc = normalizedAngle - (-135) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  })();

  const severity =
    pressure >= criticalThreshold
      ? "stroke-red-500"
      : pressure >= warningThreshold
        ? "stroke-yellow-500"
        : "stroke-green-500";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={`M ${polarToCartesian(-135).x} ${polarToCartesian(-135).y} A ${radius} ${radius} 0 0 1 ${polarToCartesian(135).x} ${polarToCartesian(135).y}`}
          fill="none"
          stroke="currentColor"
          className="text-neutral-200 dark:text-neutral-800"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {pressure > 0 && (
          <path
            d={arcPath}
            fill="none"
            className={cn("transition-all duration-500", severity)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-neutral-900 text-2xl font-bold dark:fill-white"
        >
          {pressure.toFixed(1)}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-neutral-500 text-xs dark:fill-neutral-400"
        >
          {unit}
        </text>
      </svg>
      {label && (
        <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
    </div>
  );
};
PressureGauge.displayName = "PressureGauge";

export { PressureGauge };
