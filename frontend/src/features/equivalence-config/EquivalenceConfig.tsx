import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HttpEquivalenceRepo } from "../../data/repos/http-equivalence-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { Input } from "../../ui/primitives/input";
import { DataTable } from "../../ui/components/DataTable";
import type { Column } from "../../ui/components/DataTable";

const equivalenceRepo = new HttpEquivalenceRepo();

interface Equivalence {
  id: number;
  input_value: string;
  output_value: string;
}

type FormData = { input_value: string; output_value: string };

const emptyForm: FormData = { input_value: "", output_value: "" };

export default function EquivalenceConfig() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equivalence | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["equivalences"],
    queryFn: () => equivalenceRepo.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => equivalenceRepo.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equivalences"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormData> }) => equivalenceRepo.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equivalences"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => equivalenceRepo.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equivalences"] }),
  });

  const resetForm = () => { setForm(emptyForm); setEditing(null); setShowForm(false); };

  const handleEdit = (r: Equivalence) => {
    setEditing(r);
    setForm({ input_value: r.input_value, output_value: r.output_value });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const columns: Column<Equivalence>[] = [
    { key: "input_value", label: t("admin.inputValue"), className: "font-mono", sortable: false },
    { key: "output_value", label: t("admin.outputValue"), className: "font-mono", sortable: false },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("admin.equivalenceConfigTitle")}
        description={t("admin.equivalenceConfigDescription")}
        actions={
          <Button onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? t("common.cancel") : t("admin.addRule")}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-neutral-500">{t("admin.inputValue")}</label>
                <Input value={form.input_value} onChange={(e) => setForm({ ...form, input_value: e.target.value })} placeholder={t("admin.inputValuePlaceholder")} required />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-neutral-500">{t("admin.outputValue")}</label>
                <Input value={form.output_value} onChange={(e) => setForm({ ...form, output_value: e.target.value })} placeholder={t("admin.outputValuePlaceholder")} required />
              </div>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? t("admin.update") : t("admin.create")}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={resetForm}>{t("common.cancel")}</Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <DataTable<Equivalence>
        columns={columns}
        data={(rules as Equivalence[]) ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyMessage={t("admin.noEquivalenceRules")}
        onEdit={handleEdit}
        onDelete={(r) => { if (window.confirm(t("admin.deleteRuleConfirm"))) deleteMutation.mutate(r.id); }}
      />
    </div>
  );
}
