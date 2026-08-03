import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { DataTable } from "../../ui/components/DataTable";
import { StatusBadge } from "../../ui/components/StatusBadge";
import { formatDuration } from "../../core/utils/time";
import type { Therapy, Machine } from "../../core/types";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();

/** A closed (completed/cancelled) therapy row with machine info resolved. */
interface TherapyHistoryRow {
  therapy_id: number;
  patient_name: string;
  machine_label: string;
  therapy_type: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

/* ── Helpers ──────────────────────────────────────────────────── */

/** Formats an ISO timestamp into a short, locale-friendly date/time. */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Hide the type/end columns on narrow viewports. */
function hideSm(columnId: string): string {
  return ["therapy_type", "ended_at"].includes(columnId)
    ? "hidden md:table-cell"
    : "";
}

/* ── Component ────────────────────────────────────────────────── */

const columnHelper = createColumnHelper<TherapyHistoryRow>();

export default function TherapiesHistoryPage() {
  const navigate = useNavigate();

  const { data: completed = [], isLoading } = useQuery<Therapy[]>({
    queryKey: ["therapies", "completed"],
    queryFn: () => therapyRepo.list({ status: "completed" }),
  });

  const { data: cancelled = [] } = useQuery<Therapy[]>({
    queryKey: ["therapies", "cancelled"],
    queryFn: () => therapyRepo.list({ status: "cancelled" }),
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
    staleTime: 60_000,
  });

  const machineById = useMemo(
    () => new Map(machines.map((m) => [m.id, m])),
    [machines],
  );

  const rows = useMemo<TherapyHistoryRow[]>(() => {
    return [...completed, ...cancelled]
      .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
      .map((t) => {
        const machine = machineById.get(t.machine_id);
        return {
          therapy_id: t.id,
          patient_name: t.patient_name ?? t.patient_external_id ?? "—",
          machine_label:
            machine?.label ??
            machine?.serial_number ??
            `Machine ${t.machine_id}`,
          therapy_type: t.therapy_type,
          status: t.status ?? "unknown",
          started_at: t.started_at,
          ended_at: t.ended_at,
        };
      });
  }, [completed, cancelled, machineById]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("patient_name", {
        header: "Patient",
        cell: (i) => (
          <span className="font-medium text-gray-900">{i.getValue()}</span>
        ),
      }),
      columnHelper.accessor("machine_label", {
        header: "Machine",
      }),
      columnHelper.accessor("therapy_type", {
        header: "Type",
        cell: (i) => i.getValue() ?? "-",
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (i) => <StatusBadge status={i.getValue()} size="sm" />,
      }),
      columnHelper.accessor("started_at", {
        header: "Start",
        cell: (i) => formatDateTime(i.getValue()),
      }),
      columnHelper.accessor("ended_at", {
        header: "End",
        cell: (i) => formatDateTime(i.getValue()),
      }),
      columnHelper.display({
        id: "duration",
        header: "Duration",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDuration(row.original.started_at, row.original.ended_at)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => navigate(`/history/${row.original.therapy_id}`)}
            className="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          >
            View
          </button>
        ),
      }),
    ],
    [navigate],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Therapy History"
        description="Completed and cancelled therapies across all machines"
      />
      <DataTable
        table={table}
        isLoading={isLoading}
        emptyMessage="No closed therapies"
        hideSm={hideSm}
      />
    </div>
  );
}
