import { useMemo, useRef } from "react";
import { useLiveDataStore } from "../store/live-data-store";
import type { TrendDataPoint } from "../features/scada/components";

const MAX_TREND_POINTS = 120;

/**
 * Accumulates readings over time into a trend data array.
 * Maintains an internal buffer of `MAX_TREND_POINTS` entries per machine.
 */
export function useTrendData(machineId: string): TrendDataPoint[] {
  const readings = useLiveDataStore((s) => s.readings[machineId]);
  const bufferRef = useRef<Map<string, TrendDataPoint[]>>(new Map());

  return useMemo(() => {
    const buffer = bufferRef.current;
    let points = buffer.get(machineId) ?? [];

    if (!readings || readings.readings.length === 0) {
      return points;
    }

    const now = new Date().toISOString();
    const pressureReading = readings.readings.find((r) =>
      r.display_label?.toLowerCase().includes("pressure"),
    );

    if (pressureReading && pressureReading.value !== null) {
      points = [
        ...points,
        {
          timestamp: now,
          pressure: pressureReading.value,
        },
      ];

      // Cap buffer size
      if (points.length > MAX_TREND_POINTS) {
        points = points.slice(points.length - MAX_TREND_POINTS);
      }

      buffer.set(machineId, points);
    }

    return points;
  }, [readings, machineId]);
}
