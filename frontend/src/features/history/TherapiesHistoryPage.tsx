import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../store/auth-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { DataTable } from "../../ui/components/DataTable";
import { ConfirmDialog } from "../../ui/components/ConfirmDialog";
import { formatDuration } from "../../core/utils/time";
import type { Therapy, Machine } from "../../core/types";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();

/** A completed therapy row with machine info resolved. */
interface TherapyHistoryRow {
  therapy_id: number;
  patient_name: string;
  machine_label: string;
  therapy_type: string | null;
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
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [deleteTarget, setDeleteTarget] = useState<TherapyHistoryRow | null>(
    null,
  );
  const [deleteReason, setDeleteReason] = useState("");

  const { data: completed = [], isLoading } = useQuery<Therapy[]>({
    queryKey: ["therapies", "completed"],
    queryFn: () => therapyRepo.list({ status: "completed" }),
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
    return [...completed]
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
          started_at: t.started_at,
          ended_at: t.ended_at,
        };
      });
  }, [completed, machineById]);

  const deleteTherapy = useMutation({
    mutationFn: () => {
      if (!deleteTarget) return Promise.reject(new Error("No therapy selected"));
      return therapyRepo.deleteTherapy(deleteTarget.therapy_id, deleteReason.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapies", "completed"] });
      setDeleteTarget(null);
      setDeleteReason("");
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("patient_name", {
        header: "Patient",
        cell: (i) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">{i.getValue()}</span>
        ),
      }),
      columnHelper.accessor("machine_label", {
        header: "Machine",
      }),
      columnHelper.accessor("therapy_type", {
        header: "Type",
        cell: (i) => i.getValue() ?? "-",
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
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(`/history/${row.original.therapy_id}`)}
              className="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900/70 dark:focus:ring-blue-400"
            >
              View
            </button>
            {isAdmin && (
              <button
                type="button"
                title="Delete from history"
                aria-label={`Delete therapy ${row.original.therapy_id}`}
                onClick={() => {
                  setDeleteTarget(row.original);
                  setDeleteReason("");
                }}
                className="rounded p-1.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors dark:text-red-400 dark:hover:bg-red-950/60 dark:focus:ring-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ),
      }),
    ],
    [navigate, isAdmin],
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
        description="Completed therapies across all machines"
      />
      <DataTable
        table={table}
        isLoading={isLoading}
        emptyMessage="No completed therapies"
        hideSm={hideSm}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete therapy from history"
        message={
          deleteTarget
            ? `Remove the therapy for ${deleteTarget.patient_name}? This keeps an audit trail of who deleted it and why.`
            : ""
        }
        onConfirm={() => deleteTherapy.mutate()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteReason("");
        }}
        isLoading={deleteTherapy.isPending}
      >
        <label className="mt-4 block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Deletion reason
          </span>
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
            placeholder="Why is this therapy being removed?"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
