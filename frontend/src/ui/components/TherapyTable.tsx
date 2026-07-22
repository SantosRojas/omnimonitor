import { StatusBadge } from "./StatusBadge";
import type { ActiveTherapyRow } from "../../core/types";

interface TherapyTableProps {
  /** The list of active therapies to display. */
  therapies: ActiveTherapyRow[];
  /** Called when the user clicks "View SCADA" for a given therapy. */
  onSelectTherapy: (therapyId: number) => void;
  /** Whether the data is still loading. */
  isLoading: boolean;
}

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Formats a number of seconds into a `H:MM:SS` string.
 */
function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 0 || !Number.isFinite(totalSeconds)) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Formats an ISO date string into a locale-friendly date/time display.
 */
function formatStartTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Reads a named pressure from the pressures record, returning a formatted
 * string or "—" when the value is absent.
 */
function pressureValue(
  pressures: Record<string, number>,
  key: string,
): string {
  const v = pressures[key];
  return v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
}

/**
 * Reads a named flow from the flows record, returning a formatted string or
 * "—" when the value is absent.
 */
function flowValue(flows: Record<string, number>, key: string): string {
  const v = flows[key];
  return v != null && Number.isFinite(v) ? v.toFixed(1) : "—";
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Presentational therapy table.
 *
 * Displays a responsive table of active-therapy rows with pressures, flows,
 * start time, elapsed time, status badge, and a "View SCADA" action button.
 * On narrow viewports the table scrolls horizontally.
 */
export function TherapyTable({
  therapies,
  onSelectTherapy,
  isLoading,
}: TherapyTableProps) {
  /* ── Loading skeleton ─────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-3">
        {/* Simulate a 5-row table skeleton */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-gray-100"
          />
        ))}
      </div>
    );
  }

  /* ── Empty state ──────────────────────────────────────────── */
  if (therapies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg
          className="mb-3 h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm font-medium">No active therapies</p>
        <p className="mt-1 text-xs">
          Active therapies will appear here once started.
        </p>
      </div>
    );
  }

  /* ── Table ────────────────────────────────────────────────── */
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        {/* ── Header ──────────────────────────────────────────── */}
        <thead className="bg-gray-50">
          <tr>
            {[
              "Patient",
              "Machine",
              "Pressures (mmHg)",
              "Flows (mL/min)",
              "Start Time",
              "Elapsed",
              "Status",
              "",
            ].map((heading) => (
              <th
                key={heading}
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ────────────────────────────────────────────── */}
        <tbody className="divide-y divide-gray-100 bg-white">
          {therapies.map((row) => (
            <tr
              key={row.therapy_id}
              className="hover:bg-gray-50/50 transition-colors"
            >
              {/* Patient */}
              <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                {row.patient_external_id}
              </td>

              {/* Machine */}
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                {row.machine_label ?? row.machine_serial}
              </td>

              {/* Pressures */}
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                <div className="space-y-0.5">
                  <span className="block">
                    F: {pressureValue(row.pressures, "filter_pressure")}
                  </span>
                  <span className="block">
                    TMP: {pressureValue(row.pressures, "tmp_pressure")}
                  </span>
                  <span className="block">
                    Eff: {pressureValue(row.pressures, "effluent_pressure")}
                  </span>
                </div>
              </td>

              {/* Flows */}
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                <div className="space-y-0.5">
                  <span className="block">
                    Net: {flowValue(row.flows, "net_rem_flow")}
                  </span>
                  <span className="block">
                    FS: {flowValue(row.flows, "fs_mid_flow")}
                  </span>
                </div>
              </td>

              {/* Start Time */}
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                {formatStartTime(row.started_at)}
              </td>

              {/* Elapsed */}
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">
                {formatElapsed(row.elapsed_seconds)}
              </td>

              {/* Status */}
              <td className="whitespace-nowrap px-4 py-3">
                <StatusBadge status={row.status} size="sm" />
              </td>

              {/* Action */}
              <td className="whitespace-nowrap px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSelectTherapy(row.therapy_id)}
                  className="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                >
                  View SCADA
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
