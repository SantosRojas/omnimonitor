import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { HttpPatientRepo } from "../../data/repos/http-patient-repo";
import { wsManager } from "../../data/ws-manager";
import { useLiveDataStore, type ReadingsBroadcast } from "../../store/live-data-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { DataTable, type Column } from "../../ui/components/DataTable";
import { formatDuration } from "../../core/utils/time";
import { formatDateTime } from "../../core/utils/format";
import {
  PRESSURE_GAUGES,
  FLOW_INDICATORS,
  PRESSURE_SERIES,
  FLOW_SERIES,
} from "../scada/signal-configs";
import type { Therapy, Machine, Patient } from "../../core/types";
import type { Reading } from "../../core/types/reading";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();
const patientRepo = new HttpPatientRepo();

/** A therapy row enriched with patient/machine info and live readings. */
interface DashboardTherapyRow {
  therapy_id: number;
  machine_id: number;
  patient_name: string;
  machine_label: string;
  /** All live readings for the machine, resolved by internal_name. */
  live: Reading[];
  therapy_type: string | null;
  started_at: string | null;
  elapsed_seconds: number;
}

/** Fallback units for the live pressure/flow rows (used when a reading lacks one). */
const SIGNAL_UNITS: Record<string, string> = {
  ...Object.fromEntries(PRESSURE_SERIES.map((s) => [s.key, s.unit ?? ""])),
  ...Object.fromEntries(FLOW_SERIES.map((s) => [s.key, s.unit ?? ""])),
};

/* ── Helpers ──────────────────────────────────────────────────── */

/** Seconds elapsed since `startedAt`, clamped to zero. */
function computeElapsedSeconds(startedAt: string | null | undefined): number {
  if (!startedAt) return 0;
  const ms = Date.parse(startedAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

/**
 * Reads a live signal by internal name and formats it as `value unit`,
 * or "—" when the reading is absent.
 */
function formatSignal(readings: Reading[], key: string): string {
  const r = readings.find((x) => x.internal_name === key);
  if (!r || r.value === null || r.value === undefined) return "—";
  const unit = r.unit ?? SIGNAL_UNITS[key] ?? "";
  return unit ? `${r.value} ${unit}` : String(r.value);
}

/* ── Component ────────────────────────────────────────────────── */

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const readings = useLiveDataStore((s) => s.readings);

  const { data: therapies = [], isLoading } = useQuery<Therapy[]>({
    queryKey: ["therapies", "active"],
    queryFn: () => therapyRepo.list({ status: "active" }),
    refetchInterval: 15_000,
  });

  // Subscribe to live broadcasts for every machine with an active therapy so
  // the pressure/flow columns are populated on first load (not only after
  // visiting a SCADA view, which is the only place that subscribes today).
  // The effect diffs against the previous set so 15s refetches don't churn
  // Subscribe/Unsubscribe on unchanged machines.
  useEffect(() => {
    const prev = new Set<string>();
    const sync = () => {
      const current = new Set(
        therapies.map((t) => String(t.machine_id)).filter(Boolean),
      );
      for (const id of current) {
        if (!prev.has(id)) wsManager.subscribeMachine(id);
      }
      for (const id of prev) {
        if (!current.has(id)) wsManager.unsubscribeMachine(id);
      }
      prev.clear();
      for (const id of current) prev.add(id);
    };
    sync();
    return () => {
      for (const id of prev) wsManager.unsubscribeMachine(id);
      prev.clear();
    };
  }, [therapies]);

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
    refetchInterval: 30_000,
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["patients"],
    queryFn: () => patientRepo.list(),
    staleTime: 60_000,
  });

  const machineById = useMemo(
    () => new Map(machines.map((m) => [m.id, m])),
    [machines],
  );
  const patientById = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );

  const rows = useMemo<DashboardTherapyRow[]>(() => {
    return therapies.map((t) => {
      const mid = String(t.machine_id);
      const live: ReadingsBroadcast | undefined = readings[mid];
      const machine = machineById.get(t.machine_id);
      const patient = patientById.get(t.patient_id);
      return {
        therapy_id: t.id,
        machine_id: t.machine_id,
        patient_name: t.patient_name ?? patient?.name ?? t.patient_external_id ?? "—",
        machine_label:
          (t as Therapy & { machine_label?: string | null }).machine_label ??
          machine?.label ??
          machine?.serial_number ??
          `Machine ${t.machine_id}`,
        live: live?.readings ?? [],
        therapy_type: t.therapy_type ?? null,
        started_at: t.started_at,
        elapsed_seconds: computeElapsedSeconds(t.started_at),
      };
    });
  }, [therapies, readings, machineById, patientById]);

  const columns = useMemo<Column<DashboardTherapyRow>[]>(
    () => [
      {
        key: "patient_name",
        label: t("dashboard.patient"),
        render: (item) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">{item.patient_name}</span>
        ),
      },
      { key: "machine_label", label: t("dashboard.machine") },
      {
        key: "therapy_type",
        label: t("dashboard.therapyMode"),
        render: (item) => item.therapy_type ?? "—",
      },
      {
        key: "pressures",
        label: t("dashboard.pressures"),
        sortable: false,
        hideSm: true,
        render: (item) => (
          <div className="space-y-0.5">
            {PRESSURE_GAUGES.map((g) => (
              <span key={g.key} className="block whitespace-nowrap">
                {t(`scada.signal.${g.key}`, { defaultValue: g.label })}: {formatSignal(item.live, g.key)}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "flows",
        label: t("dashboard.flows"),
        sortable: false,
        hideSm: true,
        render: (item) => (
          <div className="space-y-0.5">
            {FLOW_INDICATORS.map((f) => (
              <span key={f.key} className="block whitespace-nowrap">
                {t(`scada.signal.${f.key}`, { defaultValue: f.label })}: {formatSignal(item.live, f.key)}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "started_at",
        label: t("dashboard.startTime"),
        hideSm: true,
        render: (item) => formatDateTime(item.started_at),
      },
      {
        key: "elapsed_seconds",
        label: t("dashboard.elapsed"),
        hideSm: true,
        render: (item) => (
          <span className="tabular-nums">{formatDuration(item.started_at)}</span>
        ),
      },
      {
        key: "actions",
        label: "",
        sortable: false,
        className: "text-right",
        render: (item) => (
          <button
            type="button"
            onClick={() => navigate(`/dashboard/${item.machine_id}/scada`)}
            className="rounded bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-1 transition-colors"
          >
            {t("dashboard.viewScada")}
          </button>
        ),
      },
    ],
    [navigate, t, i18n.language],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.dashboard")}
        description={t("dashboard.pageDescription")}
      />
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.therapy_id}
        isLoading={isLoading}
        emptyMessage={t("dashboard.emptyTitle")}
      />
    </div>
  );
}
