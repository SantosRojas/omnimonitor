import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { useWsMachine } from "../../data/ws-hook";
import { ScadaGauge } from "../components/ScadaGauge";
import type {
  Machine,
  MachineStatus,
  Reading,
  WsMessage,
} from "../../core/types";

const machineRepo = new HttpMachineRepo();

/* ── Signal grouping helper ────────────────────────────────────── */

interface GaugeDatum {
  label: string;
  value: number | null;
  unit: string;
  trend: "up" | "down" | "stable";
}

/**
 * Converts a `Reading[]` array into a stable list of `GaugeDatum` for
 * the SCADA grid, computing trend from the previous reading set.
 */
function readingsToGaugeData(
  readings: Reading[],
  previous: Map<string, number | null>,
): GaugeDatum[] {
  return readings.map((r) => {
    const key = r.display_label ?? `Signal #${r.signal_id ?? r.id}`;
    const prev = previous.get(key);
    const value = r.value;
    let trend: "up" | "down" | "stable" = "stable";
    if (prev != null && value != null) {
      trend = value > prev ? "up" : value < prev ? "down" : "stable";
    }
    return {
      label: key,
      value,
      unit: r.unit ?? "—",
      trend,
    };
  });
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Smart SCADA detail container.
 *
 * Reads `machine_id` from the URL, fetches machine info, subscribes to
 * real-time WS data for that machine, and renders a grid of `ScadaGauge`
 * components for all pressure / flow signals.
 *
 * States: loading, error, connected (live data), disconnected.
 */
export default function ScadaDetailContainer() {
  const { id: machineIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const machineId = machineIdParam ?? "";

  /* ── Machine info (REST) ─────────────────────────────────────── */
  const {
    data: machine,
    isLoading: machineLoading,
    error: machineError,
  } = useQuery<Machine>({
    queryKey: ["machine", machineId],
    queryFn: () => machineRepo.get(Number(machineId)),
    enabled: machineId.length > 0,
  });

  /* ── WebSocket subscription ──────────────────────────────────── */
  const wsMessage = useWsMachine(machineId);

  /* ── Machine status from WS ──────────────────────────────────── */
  const [machineStatus, setMachineStatus] = useState<MachineStatus | null>(
    null,
  );

  useEffect(() => {
    if (
      wsMessage?.type === "MachineStatus" &&
      wsMessage.machine_id === machineId
    ) {
      setMachineStatus(wsMessage.status.status);
    }
  }, [wsMessage, machineId]);

  /* ── Previous readings for trend computing ────────────────────── */
  const prevReadingsRef = useRef<Map<string, number | null>>(new Map());

  /* ── Extract readings from WS message ────────────────────────── */
  const gaugeData = useMemo<GaugeDatum[]>(() => {
    if (
      !wsMessage ||
      (wsMessage.type !== "ReadingsBroadcast" &&
        wsMessage.type !== "ReadingsReplay") ||
      wsMessage.machine_id !== machineId
    ) {
      return [];
    }

    const readings =
      "readings" in wsMessage
        ? (wsMessage as Extract<WsMessage, { readings: Reading[] }>).readings
        : [];

    const prev = new Map(prevReadingsRef.current);
    const data = readingsToGaugeData(readings, prev);

    // Store current values as previous for next WS message
    const current = new Map<string, number | null>();
    data.forEach((d) => current.set(d.label, d.value));
    prevReadingsRef.current = current;

    return data;
  }, [wsMessage, machineId]);

  /* ── Resolve display status ──────────────────────────────────── */
  const displayStatus: MachineStatus =
    machineStatus ?? machine?.status ?? "unknown";

  const isOnline = displayStatus === "online";
  const hasLiveData = gaugeData.length > 0;

  /* ── Loading state ──────────────────────────────────────────── */
  if (machineLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────── */
  if (machineError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-red-600">
        <p className="text-lg font-semibold">Failed to load machine</p>
        <p className="mt-1 text-sm text-red-400">
          Machine "{machineId}" could not be found or is unreachable.
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {machine?.label ?? machine?.serial_number ?? `Machine #${machineId}`}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Serial: {machine?.serial_number ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Machine status pill */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            {isOnline ? "Online" : displayStatus}
          </span>

          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            &larr; Back to Dashboard
          </button>
        </div>
      </div>

      {/* ── Disconnected / no data ──────────────────────────────── */}
      {!hasLiveData && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-gray-400">
          <svg
            className="mb-3 h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
            />
          </svg>
          <p className="text-sm font-medium">
            {isOnline
              ? "Waiting for live data…"
              : "Machine is offline"}
          </p>
          <p className="mt-1 text-xs">
            {isOnline
              ? "Connect to the machine to see real-time SCADA readings."
              : "No live data available while the machine is disconnected."}
          </p>
        </div>
      )}

      {/* ── SCADA gauge grid ────────────────────────────────────── */}
      {hasLiveData && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {gaugeData.map((g) => (
            <ScadaGauge
              key={g.label}
              label={g.label}
              value={g.value}
              unit={g.unit}
              trend={g.trend}
            />
          ))}
        </div>
      )}
    </div>
  );
}
