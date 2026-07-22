import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HttpEquivalenceRepo } from "../../data/repos/http-equivalence-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { Input } from "../../ui/primitives/input";

const equivalenceRepo = new HttpEquivalenceRepo();

interface Equivalence {
  id: number;
  input_value: string;
  output_value: string;
  description?: string;
}

type FormData = { input_value: string; output_value: string; description: string };

const emptyForm: FormData = { input_value: "", output_value: "", description: "" };

export default function EquivalenceConfig() {
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
    setForm({ input_value: r.input_value, output_value: r.output_value, description: r.description ?? "" });
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Equivalence Configuration"
        description="Value mapping rules"
        actions={
          <Button onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? "Cancel" : "Add Rule"}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-neutral-500">Input Value</label>
                <Input value={form.input_value} onChange={(e) => setForm({ ...form, input_value: e.target.value })} placeholder="e.g. raw_high" required />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs text-neutral-500">Output Value</label>
                <Input value={form.output_value} onChange={(e) => setForm({ ...form, output_value: e.target.value })} placeholder="e.g. critical_high" required />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="mb-1 block text-xs text-neutral-500">Description</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Update" : "Create"}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">Loading...</CardContent></Card>
      ) : !rules || rules.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">No equivalence rules defined</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Input Value</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Output Value</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Description</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {(rules as Equivalence[]).map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-mono text-sm">{r.input_value}</td>
                  <td className="px-4 py-3 font-mono text-sm">{r.output_value}</td>
                  <td className="px-4 py-3 text-neutral-500">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { if (confirm("Delete this rule?")) deleteMutation.mutate(r.id); }}>Delete</Button>
                    </div>
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
