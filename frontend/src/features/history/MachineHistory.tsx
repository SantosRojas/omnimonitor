import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Input } from "../../ui/primitives/input";
import { Button } from "../../ui/primitives/button";
import { Badge } from "../../ui/primitives/badge";
import { Check } from "lucide-react";
import { formatDateTime } from "../../core/utils/format";
import { exportToExcel } from "../../core/utils/exportExcel";
import { DataTable } from "../../ui/components/DataTable";
import type { Column } from "../../ui/components/DataTable";
import type { Therapy } from "../../core/types";
const therapyRepo = new HttpTherapyRepo();
const PAGE_SIZE = 10;

const statusVariant: Record<string, "default" | "success" | "secondary" | "warning" | "danger"> = {
  completed: "success",
  active: "default",
  cancelled: "secondary",
  error: "danger",
};

/** Formats an ISO UTC timestamp as local-time ISO 8601 with offset (Excel-friendly). */
function toLocalIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export default function MachineHistory() {
  const { t } = useTranslation();
  const { machineId } = useParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingEndWeight, setEditingEndWeight] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  const { data: therapies, isLoading } = useQuery({
    queryKey: ["therapies", "history", machineId],
    queryFn: () => therapyRepo.list({ machine_id: machineId ? Number(machineId) : undefined }),
    enabled: !!machineId,
  });

  const filtered = useMemo(() => {
    let list = (therapies ?? []) as Therapy[];
    if (search) {
      list = list.filter((t) =>
        (t.patient_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (t.status ?? "").toLowerCase().includes(search.toLowerCase()),
      );
    }
    if (typeFilter) {
      list = list.filter((t) => t.therapy_type === typeFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter((t) => new Date(t.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      list = list.filter((t) => new Date(t.created_at).getTime() <= to);
    }
    return list;
  }, [therapies, search, typeFilter, dateFrom, dateTo]);

  const exportExcel = () => {
    exportToExcel(
      filtered,
      [
        { header: t("history.patient"), value: (r: Therapy) => r.patient_name ?? "" },
        { header: t("history.type"), value: (r: Therapy) => r.therapy_type ?? "" },
        { header: t("history.start"), value: (r: Therapy) => toLocalIso(r.started_at) },
        { header: t("history.end"), value: (r: Therapy) => toLocalIso(r.ended_at) },
        {
          header: t("history.weightInitial"),
          value: (r: Therapy) => (r.weight != null ? `${r.weight} kg` : ""),
        },
        {
          header: t("history.weightEnd"),
          value: (r: Therapy) => (r.end_weight != null ? `${r.end_weight} kg` : ""),
        },
        { header: t("history.status"), value: (r: Therapy) => r.status ?? "" },
      ],
      `machine-${machineId}-history.xlsx`,
    );
  };

  const setEndWeight = useMutation({
    mutationFn: ({ therapyId, endWeight }: { therapyId: number; endWeight: number }) =>
      therapyRepo.updateMetadata(therapyId, { end_weight: endWeight }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapies"] });
    },
  });

  const handleRecordWeight = (therapyId: number) => {
    const val = editingEndWeight[therapyId];
    if (val === undefined || val === "") return;
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    setEndWeight.mutate({ therapyId, endWeight: num });
    setEditingEndWeight((prev) => {
      const next = { ...prev };
      delete next[therapyId];
      return next;
    });
  };

  const therapyTypes = useMemo(() => {
    const types = new Set((therapies ?? []).map((t) => t.therapy_type).filter(Boolean));
    return [...types] as string[];
  }, [therapies]);

  const columns: Column<Therapy>[] = [
    { key: "patient_name", label: t("history.patient") },
    { key: "therapy_type", label: t("history.type") },
    { key: "started_at", label: t("history.start"), render: (row) => row.started_at ? formatDateTime(row.started_at) : "—" },
    { key: "ended_at", label: t("history.end"), render: (row) => row.ended_at ? formatDateTime(row.ended_at) : "—" },
    { key: "weight", label: t("history.weightInitial"), render: (row) => row.weight != null ? `${row.weight} kg` : "—" },
    {
      key: "end_weight",
      label: t("history.weightEnd"),
      sortable: false,
      render: (row) => {
        if (row.end_weight != null) return <span className="font-medium text-neutral-700 dark:text-neutral-300">{row.end_weight} kg</span>;
        if (row.status === "completed") {
          return (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="kg"
                className="h-8 w-20 text-xs"
                value={editingEndWeight[row.id] ?? ""}
                onChange={(e) =>
                  setEditingEndWeight((prev) => ({ ...prev, [row.id]: e.target.value }))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!editingEndWeight[row.id] || !isFinite(Number(editingEndWeight[row.id])) || Number(editingEndWeight[row.id]) <= 0}
                onClick={() => handleRecordWeight(row.id)}
                title={t("history.recordEndWeight")}
              >
                <Check className="h-4 w-4 text-green-500" />
              </Button>
            </div>
          );
        }
        return <span className="text-neutral-400 dark:text-neutral-500">—</span>;
      },
    },
    {
      key: "status",
      label: t("history.status"),
      sortable: false,
      render: (row) => (
        <Badge variant={statusVariant[row.status ?? ""] ?? "secondary"}>
          {row.status ? t(`status.${row.status}`, { defaultValue: row.status }) : "—"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("history.title")}
        description={t("history.machineDescription", { machineId })}
        actions={<Button size="sm" onClick={exportExcel}>{t("history.exportExcel")}</Button>}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder={t("history.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); }} className="max-w-xs" />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); }}
          className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">{t("history.allTypes")}</option>
          {therapyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); }} className="w-40" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); }} className="w-40" />
      </div>

      <DataTable<Therapy>
        key={`${search}|${typeFilter}|${dateFrom}|${dateTo}`}
        columns={columns}
        data={filtered}
        keyExtractor={(t) => t.id}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        emptyMessage={t("history.noTherapies")}
      />
    </div>
  );
}
