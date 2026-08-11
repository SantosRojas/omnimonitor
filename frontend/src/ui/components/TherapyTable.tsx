import { StatusBadge } from "./StatusBadge";
import { DataTable } from "./DataTable";
import type { Column } from "./DataTable";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../core/utils/format";
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
  const { t } = useTranslation();

  const emptyIcon = (
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
        d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2v10a2 2 0 002 2z"
      />
    </svg>
  );

  const columns: Column<ActiveTherapyRow>[] = [
    { key: "patient_external_id", label: t("dashboard.patient") },
    {
      key: "machine_label",
      label: t("dashboard.machine"),
      render: (r) => r.machine_label ?? r.machine_serial,
    },
    {
      key: "pressures",
      label: `${t("dashboard.pressures")} (mmHg)`,
      sortable: false,
      render: (r) => (
        <div className="space-y-0.5">
          <span className="block">
            {t("scada.signal.c_press_fp_act")}: {pressureValue(r.pressures, "filter_pressure")}
          </span>
          <span className="block">
            {t("scada.signal.c_press_tmp_act")}: {pressureValue(r.pressures, "tmp_pressure")}
          </span>
          <span className="block">
            {t("scada.signal.c_press_ep_act")}: {pressureValue(r.pressures, "effluent_pressure")}
          </span>
        </div>
      ),
    },
    {
      key: "flows",
      label: `${t("dashboard.flows")} (mL/min)`,
      sortable: false,
      render: (r) => (
        <div className="space-y-0.5">
          <span className="block">
            {t("scada.signal.c_net_rem_flow_act")}: {flowValue(r.flows, "net_rem_flow")}
          </span>
          <span className="block">
            {t("scada.signal.c_pump_fs_mid_flow_act")}: {flowValue(r.flows, "fs_mid_flow")}
          </span>
        </div>
      ),
    },
    {
      key: "started_at",
      label: t("dashboard.startTime"),
      render: (r) => formatDateTime(r.started_at),
    },
    {
      key: "elapsed_seconds",
      label: t("dashboard.elapsed"),
      className: "tabular-nums",
      render: (r) => formatElapsed(r.elapsed_seconds),
    },
    {
      key: "status",
      label: t("dashboard.status"),
      sortable: false,
      render: (r) => <StatusBadge status={r.status} size="sm" />,
    },
    {
      key: "action",
      label: "",
      sortable: false,
      render: (r) => (
        <button
          type="button"
          onClick={() => onSelectTherapy(r.therapy_id)}
          className="rounded bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-1 transition-colors"
        >
          {t("dashboard.viewScada")}
        </button>
      ),
    },
  ];

  return (
    <DataTable<ActiveTherapyRow>
      columns={columns}
      data={therapies}
      keyExtractor={(r) => r.therapy_id}
      isLoading={isLoading}
      emptyMessage={t("dashboard.emptyTitle")}
      emptyHint={t("dashboard.emptyDescription")}
      emptyIcon={emptyIcon}
    />
  );
}
