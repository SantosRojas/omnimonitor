import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { TelemetryHistoryPoint } from "../domain/scada-store";
import type { SeriesConfig } from "../signal-configs";
import { ChartTooltip } from "./chart-tooltip";
import { formatTimeSeconds } from "../../../core/utils/format";

interface ScadaTrendChartProps {
  data: TelemetryHistoryPoint[];
  series: SeriesConfig[];
  height?: number | string;
  showGrid?: boolean;
  displayNameMap?: Record<string, string>;
}

/**
 * Formats an ISO timestamp into a local-time HH:MM:SS label for the chart.
 * The store keeps timestamps as UTC ISO (toISOString), so slicing the raw
 * string would show UTC — convert to the viewer's timezone instead.
 */
function formatChartTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatTimeSeconds(iso);
}

/**
 * Multi-series recharts line chart for SCADA trends.
 * Ported from pdms-omni `presentation/components/scada/trend-chart.tsx`
 * (omni timestamps are ISO UTC, so `_time` converts to local time).
 */
export function ScadaTrendChart({
  data,
  series,
  height = "170px",
  showGrid = false,
  displayNameMap,
}: ScadaTrendChartProps) {
  const { t } = useTranslation();
  const formattedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .filter((point) => point.timestamp)
      .map((point) => ({
        ...point,
        _time: point.timestamp ? formatChartTime(point.timestamp) : "",
      }));
  }, [data]);

  const unitMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of series) {
      if (s.unit !== undefined) map[s.key] = s.unit;
    }
    return map;
  }, [series]);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-scada-border)" opacity={0.3} />
          )}
          <XAxis
            dataKey="_time"
            tick={{ fontSize: 9, fill: "var(--color-scada-muted)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--color-scada-muted)" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            content={<ChartTooltip unitMap={unitMap} labelClassName="font-bold" />}
          />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 9, paddingTop: 4 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              name={t(`scada.signal.${s.key}`, { defaultValue: displayNameMap?.[s.key] ?? s.name })}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
