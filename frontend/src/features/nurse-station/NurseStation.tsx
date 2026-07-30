import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { HttpPatientRepo } from "../../data/repos/http-patient-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useLiveDataStore } from "../../store/live-data-store";
import { useAlarmStore } from "../../store/alarm-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Input } from "../../ui/primitives/input";
import { Badge } from "../../ui/primitives/badge";
import {
  MachineStatusDot,
  type ConnectionStatus,
} from "../scada/components";
import {
  Activity,
  AlertTriangle,
  Clock,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { Machine, Therapy, Patient } from "../../core/types";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();
const patientRepo = new HttpPatientRepo();

type StatusFilter = "all" | ConnectionStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "offline", label: "Offline" },
  { key: "error", label: "Error" },
  { key: "unknown", label: "Unknown" },
];

interface MachineCardData {
  machine: Machine;
  connectionStatus: ConnectionStatus;
  lastSeen: string | null;
  pressure: number;
  therapy: Therapy | null;
  patient: Patient | null;
  unackedAlarms: number;
  hasActiveTherapy: boolean;
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "—";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

/* ── Mini sparkline bar ──────────────────────────────────── */
function MiniTrend({ readings }: { readings: number[] }) {
  if (readings.length < 2) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  const max = Math.max(...readings, 1);
  const min = Math.min(...readings, 0);
  const range = max - min || 1;
  const bars = readings.slice(-24);

  return (
    <div className="flex items-end gap-[2px] h-6">
      {bars.map((v, i) => {
        const height = ((v - min) / range) * 100;
        return (
          <div
            key={i}
            className="w-1 rounded-t bg-blue-400 dark:bg-blue-500"
            style={{ height: `${Math.max(height, 4)}%` }}
            title={`${v.toFixed(1)} cmH₂O`}
          />
        );
      })}
    </div>
  );
}

/* ── Therapy state badge ─────────────────────────────────── */
function TherapyBadge({
  hasTherapy,
  connectionStatus,
}: {
  hasTherapy: boolean;
  connectionStatus: ConnectionStatus;
}) {
  if (connectionStatus === "offline" || connectionStatus === "unknown") {
    return (
      <span className="text-xs text-neutral-400">Disconnected</span>
    );
  }
  if (connectionStatus === "error") {
    return <Badge variant="danger">Error</Badge>;
  }
  if (hasTherapy) {
    return <Badge variant="success">Running</Badge>;
  }
  return <Badge variant="outline">Idle</Badge>;
}

/* ── Main component ──────────────────────────────────────── */
export default function NurseStation() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Real-time stores
  const machineStatuses = useMachineStatusStore((s) => s.machines);
  const readings = useLiveDataStore((s) => s.readings);
  const alarms = useAlarmStore((s) => s.alarms);

  // REST: machines
  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
    refetchInterval: 30_000,
  });

  // REST: active therapies
  const { data: therapies = [] } = useQuery<Therapy[]>({
    queryKey: ["therapies", "active"],
    queryFn: () => therapyRepo.list({ status: "active" }),
    refetchInterval: 15_000,
  });

  // REST: patients (for client-side join with therapies)
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["patients"],
    queryFn: () => patientRepo.list(),
    staleTime: 60_000,
  });

  // Index data for O(1) lookup
  const therapyByMachine = useMemo(() => {
    const map = new Map<number, Therapy>();
    for (const t of therapies) {
      map.set(t.machine_id, t);
    }
    return map;
  }, [therapies]);

  const patientById = useMemo(() => {
    const map = new Map<number, Patient>();
    for (const p of patients) {
      map.set(p.id, p);
    }
    return map;
  }, [patients]);

  // Build machine cards
  const cards = useMemo<MachineCardData[]>(() => {
    return machines.map((m) => {
      const mid = String(m.id);
      const storeStatus = machineStatuses[mid];
      const therapy = therapyByMachine.get(m.id) ?? null;
      const patient = therapy ? patientById.get(therapy.patient_id) ?? null : null;
      const machineReadings = readings[mid];
      const pressure =
        machineReadings?.readings?.find(
          (r) => r.display_label?.toLowerCase().includes("pressure"),
        )?.value ?? 0;

      const connectionStatus: ConnectionStatus =
        storeStatus?.status?.status ?? m.status ?? "unknown";

      return {
        machine: m,
        connectionStatus,
        lastSeen: storeStatus?.status?.last_seen_at ?? m.last_seen_at,
        pressure,
        therapy,
        patient,
        unackedAlarms: alarms.filter(
          (a) => a.machineId === mid && !a.acknowledged,
        ).length,
        hasActiveTherapy: therapy !== null,
      };
    });
  }, [machines, machineStatuses, readings, alarms, therapyByMachine, patientById]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = cards;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.machine.label?.toLowerCase().includes(q) ||
          c.machine.serial_number.toLowerCase().includes(q) ||
          c.patient?.name?.toLowerCase().includes(q) ||
          c.patient?.external_id?.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((c) => c.connectionStatus === statusFilter);
    }
    return list;
  }, [cards, search, statusFilter]);

  // Track pressure readings for mini trend (persistent across renders)
  const trendRef = useRef<Map<number, number[]>>(new Map());
  useEffect(() => {
    for (const c of cards) {
      if (c.pressure > 0) {
        const buf = trendRef.current.get(c.machine.id) ?? [];
        buf.push(c.pressure);
        if (buf.length > 60) buf.shift();
        trendRef.current.set(c.machine.id, buf);
      }
    }
  }, [cards]);

  const onlineCount = cards.filter((c) => c.connectionStatus === "online").length;
  const alarmCount = cards.reduce((sum, c) => sum + c.unackedAlarms, 0);

  return (
    <div className="space-y-6">
      {/* Header with summary */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageHeader
            title="Nurse Station"
            description="Central monitoring — all machines at a glance"
          />
          <div className="mt-1 flex items-center gap-4 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              <Wifi className="h-3.5 w-3.5 text-green-500" />
              {onlineCount} online
            </span>
            <span className="flex items-center gap-1">
              <WifiOff className="h-3.5 w-3.5 text-neutral-400" />
              {cards.length - onlineCount} offline
            </span>
            {alarmCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {alarmCount} alarm{alarmCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search by machine, patient, or DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-700">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s.key
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {machinesLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-40" />
            </Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!machinesLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-neutral-400">
            <Activity className="mb-2 h-10 w-10" />
            <p className="text-sm font-medium">
              {search || statusFilter !== "all"
                ? "No machines match your filters"
                : "No machines registered"}
            </p>
            <p className="mt-1 text-xs">
              {search || statusFilter !== "all"
                ? "Try adjusting filters"
                : "Machines appear automatically when they connect via a bridge"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Machine grid */}
      {!machinesLoading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <Card
              key={c.machine.id}
              className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => navigate(`/dashboard/${c.machine.id}/scada`)}
            >
              <CardContent className="p-4">
                {/* Top row: label + status dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {c.machine.label || c.machine.serial_number}
                    </p>
                    <p className="truncate text-xs text-neutral-400">
                      {c.machine.serial_number}
                    </p>
                  </div>
                  <MachineStatusDot status={c.connectionStatus} size="sm" />
                </div>

                {/* Last seen */}
                <div className="mt-1 flex items-center gap-1 text-[11px] text-neutral-400">
                  <Clock className="h-3 w-3" />
                  {formatLastSeen(c.lastSeen)}
                </div>

                {/* Patient info */}
                {c.therapy && c.patient && (
                  <div className="mt-2 rounded-md bg-neutral-50 p-2 dark:bg-neutral-800/50">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {c.patient.name ?? "Unknown patient"}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      DNI: {c.patient.external_id}
                    </p>
                  </div>
                )}

                {/* Pressure + mini trend */}
                <div className="mt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
                        {c.pressure.toFixed(1)}
                      </p>
                      <p className="text-[11px] text-neutral-400 leading-none">cmH₂O</p>
                    </div>
                    <MiniTrend readings={trendRef.current.get(c.machine.id) ?? []} />
                  </div>
                </div>

                {/* Therapy state + alarms */}
                <div className="mt-3 flex items-center justify-between">
                  <TherapyBadge
                    hasTherapy={c.hasActiveTherapy}
                    connectionStatus={c.connectionStatus}
                  />
                  {c.unackedAlarms > 0 && (
                    <Badge variant="danger" className="ml-2 shrink-0">
                      {c.unackedAlarms}
                    </Badge>
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
