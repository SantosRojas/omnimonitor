import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../store/auth-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { DataTable, type Column } from "../../ui/components/DataTable";
import { ConfirmDialog } from "../../ui/components/ConfirmDialog";
import { formatDuration } from "../../core/utils/time";
import { formatDateTime } from "../../core/utils/format";
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

/* ── Component ────────────────────────────────────────────────── */

export default function TherapiesHistoryPage() {
  const { t } = useTranslation();
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

  const columns = useMemo<Column<TherapyHistoryRow>[]>(
    () => [
      {
        key: "patient_name",
        label: t("history.patient"),
        render: (r) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">{r.patient_name}</span>
        ),
      },
      { key: "machine_label", label: t("history.machine") },
      {
        key: "therapy_type",
        label: t("history.type"),
        render: (r) => r.therapy_type ?? "-",
        hideSm: true,
      },
      {
        key: "started_at",
        label: t("history.start"),
        render: (r) => formatDateTime(r.started_at),
      },
      {
        key: "ended_at",
        label: t("history.end"),
        render: (r) => formatDateTime(r.ended_at),
        hideSm: true,
      },
      {
        key: "duration",
        label: t("history.duration"),
        sortable: false,
        render: (r) => (
          <span className="tabular-nums">
            {formatDuration(r.started_at, r.ended_at)}
          </span>
        ),
      },
      {
        key: "actions",
        label: "",
        sortable: false,
        render: (r) => (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(`/history/${r.therapy_id}`)}
              className="rounded bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-1 transition-colors"
            >
              {t("common.view")}
            </button>
            {isAdmin && (
              <button
                type="button"
                title={t("history.deleteFromHistory")}
                aria-label={t("history.deleteFromHistory", { id: r.therapy_id })}
                onClick={() => {
                  setDeleteTarget(r);
                  setDeleteReason("");
                }}
                className="rounded p-1.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors dark:text-red-400 dark:hover:bg-red-950/60 dark:focus:ring-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [navigate, isAdmin, t],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("history.title")}
        description={t("history.completedDescription")}
      />
      <DataTable<TherapyHistoryRow>
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.therapy_id}
        isLoading={isLoading}
        emptyMessage={t("history.empty")}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("history.deleteTitle")}
        message={
          deleteTarget
            ? t("history.deleteMessage", { patient: deleteTarget.patient_name })
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
            {t("history.deletionReason")}
          </span>
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
            placeholder={t("history.deletionReasonPlaceholder")}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
