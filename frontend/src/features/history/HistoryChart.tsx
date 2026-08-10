import { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { Maximize, Minimize, ZoomOut, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { ChartTooltip } from "../scada/components/chart-tooltip";
import type { SeriesConfig } from "../scada/signal-configs";

interface HistoryChartProps {
  title: string;
  data: Record<string, unknown>[];
  series: SeriesConfig[];
  displayNameMap?: Record<string, string>;
  unitMap?: Record<string, string>;
  xAxisKey?: string;
}

const brushRange = (len: number) => ({ start: 0, end: Math.max(0, len - 1) });

export function HistoryChart({
  title,
  data,
  series,
  displayNameMap,
  unitMap,
  xAxisKey = "timeOnly",
}: HistoryChartProps) {
  const { t } = useTranslation();
  const [brushIdx, setBrushIdx] = useState(() => brushRange(data.length));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    setBrushIdx(brushRange(data.length));
  }, [data.length]);

  const handleBrushChange = (range: { startIndex?: number; endIndex?: number } | undefined) => {
    if (range && range.startIndex !== undefined && range.endIndex !== undefined) {
      setBrushIdx({ start: range.startIndex, end: range.endIndex });
    }
  };

  const resetZoom = () => setBrushIdx(brushRange(data.length));

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const toggleSeries = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const resolvedUnitMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of series) {
      if (s.key && s.unit) m[s.key] = s.unit;
    }
    for (const [key, unit] of Object.entries(unitMap ?? {})) {
      if (key && unit) m[key] = unit;
    }
    return m;
  }, [series, unitMap]);

  const hasData = data.length > 0 && series.length > 0;
  const isZoomed = hasData && brushIdx.end - brushIdx.start < data.length - 1;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-neutral-400">
          <BarChart3 className="mb-2 h-8 w-8" />
          <p className="text-sm">{t("history.noData", { title: title.toLowerCase() })}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={containerRef} className="flex flex-col">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            <BarChart3 className="h-4 w-4 text-primary" />
            {title}
          </h3>
          <div className="flex items-center gap-1.5">
            {isZoomed && (
              <Button variant="ghost" size="sm" onClick={resetZoom}>
                <ZoomOut className="mr-1 h-3.5 w-3.5" />
                {t("history.resetZoom")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              title={isFullscreen ? t("history.exitFullscreen") : t("history.enterFullscreen")}
            >
              {isFullscreen ? (
                <Minimize className="h-3.5 w-3.5" />
              ) : (
                <Maximize className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div style={{ width: "100%", height: isFullscreen ? "100%" : 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
              <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTooltip unitMap={resolvedUnitMap} labelClassName="font-bold" />} />
              <Legend
                verticalAlign="bottom"
                onClick={(entry: { dataKey?: unknown }) => toggleSeries(String(entry.dataKey))}
                wrapperStyle={{ cursor: "pointer", fontSize: 11 }}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  name={t(`scada.signal.${s.key}`, { defaultValue: displayNameMap?.[s.key] ?? s.name })}
                  dot={false}
                  strokeWidth={2}
                  hide={hiddenKeys.has(s.key)}
                />
              ))}
              <Brush
                dataKey={xAxisKey}
                height={30}
                stroke="var(--color-primary)"
                fill="var(--color-muted)"
                travellerWidth={12}
                startIndex={brushIdx.start}
                endIndex={brushIdx.end}
                onChange={handleBrushChange}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default HistoryChart;
