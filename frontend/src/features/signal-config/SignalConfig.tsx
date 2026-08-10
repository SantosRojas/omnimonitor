import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Input } from "../../ui/primitives/input";
import { Switch } from "../../ui/primitives/switch";

const signalRepo = new HttpSignalRepo();

interface SignalWithVisibility {
  id: number;
  display_label?: string;
  internal_name: string;
  unit?: string;
  phase?: string;
  is_visible: boolean;
}

export default function SignalConfig() {
  const { t } = useTranslation();
  const { machineId } = useParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals", machineId],
    queryFn: () => signalRepo.list(),
    enabled: !!machineId,
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, visible }: { id: number; visible: boolean }) =>
      signalRepo.addMapping(id, { numeric_value: visible ? "1" : "0", display_name: "visibility" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signals", machineId] }),
  });

  const filtered = ((signals ?? []) as unknown as SignalWithVisibility[]).filter((s) =>
    !search ||
    s.display_label?.toLowerCase().includes(search.toLowerCase()) ||
    s.internal_name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("admin.signalConfigTitle")}
        description={machineId ? t("admin.signalConfigMachine", { machineId }) : t("admin.signalConfigGeneric")}
      />

      <Input placeholder={t("admin.searchSignals")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">{t("admin.loadingSignals")}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">{t("admin.noSignalsFound")}</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("admin.signal")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("admin.unit")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("admin.phase")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("admin.visible")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">{s.display_label ?? s.internal_name}</td>
                  <td className="px-4 py-3 text-neutral-500">{s.unit ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{s.phase ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={s.is_visible ?? true}
                      onChange={(e) => visibilityMutation.mutate({ id: s.id, visible: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
