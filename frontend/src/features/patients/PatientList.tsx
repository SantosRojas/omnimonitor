import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HttpPatientRepo } from "../../data/repos/http-patient-repo";
import { useAuthStore } from "../../store/auth-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { Input } from "../../ui/primitives/input";
import { Search, Pen, User, Download } from "lucide-react";
import { formatDate } from "../../core/utils/format";
import { exportToExcel } from "../../core/utils/exportExcel";
import type { Patient } from "../../core/types";

const patientRepo = new HttpPatientRepo();

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

export default function PatientList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === "admin" || user?.role === "operator";

  const [search, setSearch] = useState("");
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["patients", search],
    queryFn: () => patientRepo.list({ search: search || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Partial<Patient> & { id: number }) =>
      patientRepo.update(vals.id, {
        name: vals.name ?? null,
        age: vals.age ?? null,
        email: vals.email ?? null,
        address: vals.address ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setFormOpen(false);
      setEditPatient(null);
    },
  });

  const handleEdit = (patient: Patient) => {
    setEditPatient(patient);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!editPatient) return;
    updateMutation.mutate(editPatient);
  };

  const handleExport = () => {
    exportToExcel(
      patients,
      [
        { header: t("patients.dni"), value: (r) => r.external_id ?? "" },
        { header: t("patients.name"), value: (r) => r.name ?? "" },
        { header: t("patients.age"), value: (r) => (r.age != null ? r.age : "") },
        { header: t("patients.email"), value: (r) => r.email ?? "" },
        { header: t("patients.address"), value: (r) => r.address ?? "" },
        { header: t("patients.registered"), value: (r) => toLocalIso(r.created_at) },
      ],
      "patients.xlsx",
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("patients.title")}
        description={t("patients.description")}
        actions={
          <Button size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("patients.exportExcel")}
          </Button>
        }
      />

      {/* Search + actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder={t("patients.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 dark:text-neutral-500">
              <User className="mb-2 h-10 w-10" />
              <p className="text-sm font-medium">{t("patients.emptyTitle")}</p>
              <p className="text-xs mt-1">
                {search
                  ? t("patients.emptySearch")
                  : t("patients.emptyAuto")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900">
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.dni")}</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.name")}</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.age")}</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.email")}</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.address")}</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500 dark:text-neutral-400">{t("patients.registered")}</th>
                    {canEdit && <th className="px-4 py-3 text-right font-medium text-neutral-500 dark:text-neutral-400">{t("patients.actions")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                    >
                      <td className="px-4 py-3 font-mono text-sm">{patient.external_id}</td>
                      <td className="px-4 py-3">{patient.name || <span className="text-neutral-400 italic dark:text-neutral-500">—</span>}</td>
                      <td className="px-4 py-3">{patient.age ?? <span className="text-neutral-400 dark:text-neutral-500">—</span>}</td>
                      <td className="px-4 py-3">{patient.email || <span className="text-neutral-400 dark:text-neutral-500">—</span>}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{patient.address || <span className="text-neutral-400 dark:text-neutral-500">—</span>}</td>
                      <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                        {formatDate(patient.created_at)}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(patient)}
                            title={t("patients.editInfo")}
                          >
                            <Pen className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {formOpen && editPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
              {t("patients.editTitle", { id: editPatient.external_id })}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">{t("patients.dniReadOnly")}</label>
                <Input value={editPatient.external_id} disabled />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">{t("patients.name")}</label>
                <Input
                  value={editPatient.name ?? ""}
                  onChange={(e) =>
                    setEditPatient({ ...editPatient, name: e.target.value || null })
                  }
                  placeholder={t("patients.namePlaceholder")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">{t("patients.age")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={150}
                    value={editPatient.age ?? ""}
                    onChange={(e) =>
                      setEditPatient({
                        ...editPatient,
                        age: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder={t("patients.agePlaceholder")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">{t("patients.email")}</label>
                  <Input
                    type="email"
                    value={editPatient.email ?? ""}
                    onChange={(e) =>
                      setEditPatient({ ...editPatient, email: e.target.value || null })
                    }
                    placeholder={t("patients.emailPlaceholder")}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">{t("patients.address")}</label>
                <Input
                  value={editPatient.address ?? ""}
                  onChange={(e) =>
                    setEditPatient({ ...editPatient, address: e.target.value || null })
                  }
                  placeholder={t("patients.addressPlaceholder")}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFormOpen(false);
                  setEditPatient(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("patients.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
