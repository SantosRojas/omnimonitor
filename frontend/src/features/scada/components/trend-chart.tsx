import type { FC } from "react";
import { cn } from "../../../ui/primitives";

export interface TrendDataPoint {
  timestamp: string;
  pressure: number;
  flowRate?: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  width?: number;
  height?: number;
  className?: string;
}

function formatTime(ts: string | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

const TrendChart: FC<TrendChartProps> = ({
  data,
  width = 300,
  height = 120,
  className,
}) => {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900",
          className,
        )}
        style={{ width, height }}
      >
        No trend data
      </div>
    );
  }

  const padding = { top: 8, right: 8, bottom: 20, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const pressures = data.map((d) => d.pressure);
  const maxP = pressures.length > 0 ? Math.max(...pressures, 1) : 1;
  const minP = pressures.length > 0 ? Math.min(...pressures, 0) : 0;
  const range = maxP - minP || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartW;
    const y = padding.top + chartH - ((d.pressure - minP) / range) * chartH;
    return `${x},${y}`;
  });

  return (
    <div className={cn("", className)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + chartH - frac * chartH;
          const val = minP + frac * range;
          return (
            <g key={frac}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-neutral-200 dark:text-neutral-800"
                strokeWidth={1}
              />
              <text
                x={width - padding.right + 4}
                y={y + 3}
                className="fill-neutral-400 text-[10px]"
              >
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Data line */}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="currentColor"
            className="text-blue-500"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(" ")}
          />
        )}

        {/* Time labels */}
        {data.length > 1 && (
          <>
            <text
              x={padding.left}
              y={height - 4}
              className="fill-neutral-400 text-[9px]"
            >
              {formatTime(data[0]?.timestamp)}
            </text>
            <text
              x={width - padding.right}
              y={height - 4}
              textAnchor="end"
              className="fill-neutral-400 text-[9px]"
            >
              {formatTime(data[data.length - 1]?.timestamp)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
};
TrendChart.displayName = "TrendChart";

export { TrendChart };
