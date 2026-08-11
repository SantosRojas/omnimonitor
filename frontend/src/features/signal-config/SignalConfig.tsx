import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Input } from "../../ui/primitives/input";
import { Switch } from "../../ui/primitives/switch";
import { DataTable } from "../../ui/components/DataTable";
import type { Column } from "../../ui/components/DataTable";

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

  const columns: Column<SignalWithVisibility>[] = [
    {
      key: "display_label",
      label: t("admin.signal"),
      className: "font-medium",
      render: (s) => s.display_label ?? s.internal_name,
    },
    { key: "unit", label: t("admin.unit"), render: (s) => s.unit ?? "—" },
    { key: "phase", label: t("admin.phase"), render: (s) => s.phase ?? "—" },
    {
      key: "is_visible",
      label: t("admin.visible"),
      sortable: false,
      render: (s) => (
        <Switch
          checked={s.is_visible ?? true}
          onChange={(e) => visibilityMutation.mutate({ id: s.id, visible: e.target.checked })}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("admin.signalConfigTitle")}
        description={machineId ? t("admin.signalConfigMachine", { machineId }) : t("admin.signalConfigGeneric")}
      />

      <Input placeholder={t("admin.searchSignals")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <DataTable<SignalWithVisibility>
        columns={columns}
        data={filtered}
        keyExtractor={(s) => s.id}
        isLoading={isLoading}
        emptyMessage={t("admin.noSignalsFound")}
      />
    </div>
  );
}
