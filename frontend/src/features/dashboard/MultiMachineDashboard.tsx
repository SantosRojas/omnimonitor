import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useLiveDataStore } from "../../store/live-data-store";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useAlarmStore } from "../../store/alarm-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Badge } from "../../ui/primitives/badge";
import { Input } from "../../ui/primitives/input";
import { MachineStatusDot } from "../scada/components/machine-status-dot";
import {
  PRESSURE_GAUGES,
  FLOW_INDICATORS,
  PRESSURE_SERIES,
  FLOW_SERIES,
} from "../scada/signal-configs";
import { Clock, Timer, User } from "lucide-react";
import type { Therapy } from "../../core/types/therapy";
import type { Reading } from "../../core/types/reading";
import { relativeTime, formatDuration } from "../../core/utils/time";

const therapyRepo = new HttpTherapyRepo();

type TherapyWithMeta = Therapy & {
  machine_label: string;
  connection_status: string;
  liveReadings: Reading[];
  unacked_alarms: number;
  patient_external_id?: string | null;
};

/** Fallback units for the live pressure/flow rows (used when a reading lacks one). */
const SIGNAL_UNITS: Record<string, string> = {
  ...Object.fromEntries(PRESSURE_SERIES.map((s) => [s.key, s.unit ?? ""])),
  ...Object.fromEntries(FLOW_SERIES.map((s) => [s.key, s.unit ?? ""])),
};

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

const connectionStatuses = ["all", "online", "offline", "error", "unknown"] as const;

export default function MultiMachineDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const machineStatuses = useMachineStatusStore((s) => s.machines);
  const readings = useLiveDataStore((s) => s.readings);
  const alarms = useAlarmStore((s) => s.alarms);

  const { data: therapies, isLoading } = useQuery({
    queryKey: ["therapies", "active"],
    queryFn: () => therapyRepo.list({ status: "active" }),
  });

  const rows = useMemo<TherapyWithMeta[]>(() => {
    if (!therapies) return [];
    return therapies.map((t: any) => {
      const mid = String(t.machine_id ?? t.id);
      const status = machineStatuses[mid];
      const machineReadings = readings[mid];
      return {
        ...t,
        machine_label: t.machine_label ?? `Machine ${mid}`,
        patient_external_id: t.patient_external_id,
        connection_status: status?.status?.status ?? "unknown",
        liveReadings: machineReadings?.readings ?? [],
        unacked_alarms: alarms.filter((a) => a.machineId === mid && !a.acknowledged).length,
      };
    });
  }, [therapies, machineStatuses, readings, alarms]);

  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.machine_label.toLowerCase().includes(q) ||
        r.patient_external_id?.toLowerCase().includes(q) ||
        String(r.id).includes(q),
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.connection_status === statusFilter);
    }
    return list;
  }, [rows, search, statusFilter]);

  const handleSelect = useCallback(
    (machineId: number) => navigate(`/dashboard/${machineId}/scada`),
    [navigate],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Multi-Machine Dashboard" description="Live view of all therapies across all machines" />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by machine, patient, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-700">
          {connectionStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="h-32" /></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-400">
            {search || statusFilter !== "all" ? "No machines match your filters" : "No active therapies"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleSelect(t.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t.machine_label}</CardTitle>
                  <MachineStatusDot status={t.connection_status as any} />
                </div>
              </CardHeader>
              <CardContent>
                {t.therapy_type ? (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {t.therapy_type}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">Sin modo de terapia</span>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                  <span className="flex min-w-0 items-center gap-1">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {t.patient_external_id ?? `Paciente #${t.id}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    {relativeTime(t.started_at)}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Timer className="h-3.5 w-3.5" />
                    {formatDuration(t.started_at, t.ended_at)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {PRESSURE_GAUGES.map((g) => (
                    <div key={g.key} className="flex items-baseline justify-between gap-2">
                      <span className="text-neutral-500 dark:text-neutral-400">{g.label}</span>
                      <span className="font-mono tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
                        {formatSignal(t.liveReadings, g.key)}
                      </span>
                    </div>
                  ))}
                  {FLOW_INDICATORS.map((f) => (
                    <div key={f.key} className="flex items-baseline justify-between gap-2">
                      <span className="text-neutral-500 dark:text-neutral-400">{f.label}</span>
                      <span className="font-mono tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
                        {formatSignal(t.liveReadings, f.key)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
                  {t.unacked_alarms > 0 && (
                    <Badge variant="danger">{t.unacked_alarms} alarm{t.unacked_alarms > 1 ? "s" : ""}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
