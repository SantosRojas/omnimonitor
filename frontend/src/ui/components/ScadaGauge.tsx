interface ScadaGaugeProps {
  /** Human-readable label for this signal (e.g. "Filter Pressure"). */
  label: string;
  /** The current numeric value, or `null` when unavailable. */
  value: number | null;
  /** Unit of measurement (e.g. "mmHg", "mL/min"). */
  unit: string;
  /** Optional trend direction compared to the previous reading. */
  trend?: "up" | "down" | "stable";
}

/**
 * Trend arrow helper — returns a small SVG arrow or dash for stable.
 */
function TrendIndicator({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") {
    return (
      <span className="inline-block text-green-500" title="Increasing">
        &#8593;
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-block text-red-500" title="Decreasing">
        &#8595;
      </span>
    );
  }
  return (
    <span className="inline-block text-gray-400" title="Stable">
      &#8596;
    </span>
  );
}

/**
 * Presentational SCADA gauge.
 *
 * Renders a single signal value as a compact card with a label, large value,
 * unit, and optional trend indicator. No data dependencies — all behaviour is
 * provided via props.
 */
export function ScadaGauge({ label, value, unit, trend }: ScadaGaugeProps) {
  const displayValue =
    value != null && Number.isFinite(value) ? value.toFixed(1) : "—";

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Label */}
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>

      {/* Value + Unit row */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`text-3xl font-bold tracking-tight ${
            value == null ? "text-gray-300" : "text-gray-900"
          }`}
        >
          {displayValue}
        </span>
        <span className="text-sm text-gray-400">{unit}</span>
      </div>

      {/* Trend indicator */}
      {trend && (
        <div className="mt-1">
          <TrendIndicator trend={trend} />
        </div>
      )}
    </div>
  );
}
