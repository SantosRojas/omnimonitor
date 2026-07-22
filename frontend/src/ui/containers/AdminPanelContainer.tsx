import { useState, type ReactNode } from "react";
import { AdminCrudTable } from "../components/AdminCrudTable";
import type { Column } from "../components/AdminCrudTable";
import { AdminCrudForm } from "../components/AdminCrudForm";
import type { Field } from "../components/AdminCrudForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../../core/types";
import { PageHeader } from "../layouts/PageHeader";
import { Card, CardContent } from "../primitives/card";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";

const adminRepo = new HttpAdminRepo();
const signalRepo = new HttpSignalRepo();

type SectionId =
  | "users" | "signals" | "equivalences" | "machine-ips" | "comments" | "config" | "tokens";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "signals", label: "Signals" },
  { id: "equivalences", label: "Equivalences" },
  { id: "machine-ips", label: "Machine IPs" },
  { id: "comments", label: "Comments" },
  { id: "config", label: "Config" },
  { id: "tokens", label: "Tokens" },
];

interface CrudState<T> {
  formOpen: boolean;
  editing: T | null;
  deleting: T | null;
}

function initialCrudState<T>(): CrudState<T> {
  return { formOpen: false, editing: null, deleting: null };
}

/* ── Users Section ──────────────────────────────────────────────── */

function UsersSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<User>>(initialCrudState);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: () => adminRepo.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.createUser({ username: String(vals.username), password: String(vals.password), role: String(vals.role) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateUser(Number(vals.id), { username: vals.username ? String(vals.username) : undefined, role: vals.role ? String(vals.role) : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); },
  });

  const columns: Column<User>[] = [
    { key: "id", label: "ID" },
    { key: "username", label: "Username" },
    { key: "role", label: "Role" },
    { key: "created_at", label: "Created", render: (v) => (v ? new Date(String(v)).toLocaleDateString() : "—") },
  ];

  const formFields: Field[] = [
    { name: "username", label: "Username", type: "text" },
    { name: "password", label: "Password", type: "text" },
    { name: "role", label: "Role", type: "select", options: [{ value: "admin", label: "Admin" }, { value: "operator", label: "Operator" }, { value: "viewer", label: "Viewer" }] },
  ];

  const editFields: Field[] = [
    { name: "username", label: "Username", type: "text" },
    { name: "role", label: "Role", type: "select", options: [{ value: "admin", label: "Admin" }, { value: "operator", label: "Operator" }, { value: "viewer", label: "Viewer" }] },
  ];

  return (
    <SectionShell title="Users" onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      {!state.formOpen ? (
        <AdminCrudTable columns={columns} data={users} isLoading={isLoading} emptyMessage="No users found." onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })} onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">{state.editing ? "Edit User" : "Create User"}</h3>
            <AdminCrudForm fields={state.editing ? editFields : formFields} initialValues={state.editing ? { id: state.editing.id, username: state.editing.username, role: state.editing.role } : undefined} onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }} isLoading={createMutation.isPending || updateMutation.isPending} />
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setState(initialCrudState)}>Cancel</Button>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog open={state.deleting !== null} title="Delete User" message={`Are you sure you want to delete user "${state.deleting?.username}"? This action cannot be undone.`} onConfirm={() => state.deleting && deleteMutation.mutate(state.deleting.id)} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Signals Section ────────────────────────────────────────────── */

function SignalsSection() {
  const { data: signals = [], isLoading } = useQuery({ queryKey: ["admin", "signals"], queryFn: () => signalRepo.list() });
  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "internal_name", label: "Internal Name" },
    { key: "display_name", label: "Display Name", render: (v) => String(v ?? "—") },
    { key: "unit", label: "Unit", render: (v) => String(v ?? "—") },
  ];
  return (
    <SectionShell title="Signals">
      <AdminCrudTable columns={columns} data={signals as unknown as Record<string, unknown>[]} isLoading={isLoading} emptyMessage="No signals found." />
    </SectionShell>
  );
}

/* ── Equivalences Section ───────────────────────────────────────── */

function EquivalencesSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<Record<string, unknown>>>(initialCrudState);
  const { data: equivalences = [], isLoading } = useQuery({ queryKey: ["admin", "equivalences"], queryFn: () => adminRepo.listEquivalences() });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) => adminRepo.createEquivalence({ from: String(vals.from), to: String(vals.to) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] }); setState(initialCrudState); },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) => adminRepo.updateEquivalence(Number(vals.id), { from: String(vals.from), to: String(vals.to) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] }); setState(initialCrudState); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteEquivalence(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] }); setState(initialCrudState); },
  });

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" }, { key: "from", label: "From" }, { key: "to", label: "To" },
  ];
  const formFields: Field[] = [
    { name: "from", label: "From", type: "text" }, { name: "to", label: "To", type: "text" },
  ];

  return (
    <SectionShell title="Equivalences" onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      {state.formOpen ? (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">{state.editing ? "Edit Equivalence" : "Create Equivalence"}</h3>
            <AdminCrudForm fields={formFields} initialValues={state.editing ? { id: state.editing.id as number, from: state.editing.from as string, to: state.editing.to as string } : undefined} onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }} isLoading={createMutation.isPending || updateMutation.isPending} />
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setState(initialCrudState)}>Cancel</Button>
          </CardContent>
        </Card>
      ) : (
        <AdminCrudTable columns={columns} data={equivalences as Record<string, unknown>[]} isLoading={isLoading} emptyMessage="No equivalences found." onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })} onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })} />
      )}
      <ConfirmDialog open={state.deleting !== null} title="Delete Equivalence" message="Are you sure you want to delete this equivalence?" onConfirm={() => state.deleting && deleteMutation.mutate(Number(state.deleting.id))} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Machine IPs Section ────────────────────────────────────────── */

function MachineIpsSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<Record<string, unknown>>>(initialCrudState);
  const { data: ips = [], isLoading } = useQuery({ queryKey: ["admin", "machine-ips"], queryFn: () => adminRepo.listMachineIps() });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) => adminRepo.createMachineIp({ machine_id: Number(vals.machine_id), ip_address: String(vals.ip_address) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] }); setState(initialCrudState); },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) => adminRepo.updateMachineIp(Number(vals.id), { ip_address: String(vals.ip_address) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] }); setState(initialCrudState); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteMachineIp(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] }); setState(initialCrudState); },
  });

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" }, { key: "machine_id", label: "Machine ID" }, { key: "ip_address", label: "IP Address" },
  ];
  const formFields: Field[] = [
    { name: "machine_id", label: "Machine ID", type: "number" }, { name: "ip_address", label: "IP Address", type: "text" },
  ];

  return (
    <SectionShell title="Machine IPs" onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      {state.formOpen ? (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">{state.editing ? "Edit Machine IP" : "Add Machine IP"}</h3>
            <AdminCrudForm fields={formFields} initialValues={state.editing ? { id: state.editing.id as number, machine_id: state.editing.machine_id as number, ip_address: state.editing.ip_address as string } : undefined} onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }} isLoading={createMutation.isPending || updateMutation.isPending} />
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setState(initialCrudState)}>Cancel</Button>
          </CardContent>
        </Card>
      ) : (
        <AdminCrudTable columns={columns} data={ips as Record<string, unknown>[]} isLoading={isLoading} emptyMessage="No machine IPs found." onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })} onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })} />
      )}
      <ConfirmDialog open={state.deleting !== null} title="Delete Machine IP" message="Are you sure you want to delete this machine IP?" onConfirm={() => state.deleting && deleteMutation.mutate(Number(state.deleting.id))} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Comments Section ───────────────────────────────────────────── */

function CommentsSection() {
  const queryClient = useQueryClient();
  const [therapyIdInput, setTherapyIdInput] = useState("");
  const [activeTherapyId, setActiveTherapyId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [deletingComment, setDeletingComment] = useState<Record<string, unknown> | null>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["admin", "comments", activeTherapyId],
    queryFn: () => adminRepo.listComments(activeTherapyId!),
    enabled: activeTherapyId !== null,
  });

  const createMutation = useMutation({
    mutationFn: () => adminRepo.createComment(activeTherapyId!, newComment),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "comments", activeTherapyId] }); setNewComment(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteComment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "comments", activeTherapyId] }); setDeletingComment(null); },
  });

  function handleLoadTherapy() { const id = Number(therapyIdInput); if (id > 0) setActiveTherapyId(id); }

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "content", label: "Comment" },
    { key: "created_at", label: "Created", render: (v) => (v ? new Date(String(v)).toLocaleString() : "—") },
  ];

  return (
    <SectionShell title="Therapy Comments">
      <div className="mb-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Therapy ID</label>
          <Input type="number" value={therapyIdInput} onChange={(e) => setTherapyIdInput(e.target.value)} placeholder="Enter therapy ID" />
        </div>
        <Button onClick={handleLoadTherapy} disabled={!therapyIdInput}>Load</Button>
      </div>

      {activeTherapyId && (
        <>
          <AdminCrudTable columns={columns} data={comments as Record<string, unknown>[]} isLoading={isLoading} emptyMessage="No comments for this therapy." onDelete={(row) => setDeletingComment(row)} />
          <div className="mt-4 flex gap-3">
            <Input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment…" />
            <Button onClick={() => createMutation.mutate()} disabled={!newComment.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
          <ConfirmDialog open={deletingComment !== null} title="Delete Comment" message="Are you sure you want to delete this comment?" onConfirm={() => deletingComment && deleteMutation.mutate(Number(deletingComment.id))} onCancel={() => setDeletingComment(null)} isLoading={deleteMutation.isPending} />
        </>
      )}
    </SectionShell>
  );
}

/* ── Config Section ─────────────────────────────────────────────── */

function ConfigSection() {
  const { data: config, isLoading } = useQuery({ queryKey: ["admin", "config"], queryFn: () => adminRepo.getConfig() });

  if (isLoading) {
    return (
      <SectionShell title="Configuration">
        <Card className="animate-pulse"><CardContent className="h-40" /></Card>
      </SectionShell>
    );
  }

  const entries = config ? Object.entries(config) : [];

  return (
    <SectionShell title="Configuration">
      {entries.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-neutral-400">No configuration data available.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Key</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
              {entries.map(([key, value]) => (
                <tr key={key} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700 dark:text-neutral-300">{key}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-400">{typeof value === "object" ? JSON.stringify(value) : String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

/* ── Tokens Section ─────────────────────────────────────────────── */

function TokensSection() {
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true); setError(null); setGeneratedToken(null);
    try {
      const { default: apiClient } = await import("../../data/api-client");
      const { data } = await apiClient.post<{ token: string }>("/admin/tokens");
      setGeneratedToken(data.token);
    } catch (err: unknown) {
      const msg = typeof err === "object" && err !== null && "error" in err ? (err as { error: string }).error : "Failed to generate token.";
      setError(msg);
    } finally { setIsGenerating(false); }
  }

  return (
    <SectionShell title="Token Generation">
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">Generate a new API token for programmatic access.</p>
      <Button onClick={handleGenerate} disabled={isGenerating}>{isGenerating ? "Generating…" : "Generate Token"}</Button>

      {error && (
        <Card className="mt-4 border-red-200 dark:border-red-900">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">{error}</CardContent>
        </Card>
      )}

      {generatedToken && (
        <Card className="mt-4 border-green-200 dark:border-green-900">
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">Token generated successfully</p>
            <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">{generatedToken}</pre>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => { navigator.clipboard.writeText(generatedToken).catch(() => {}); }}>Copy to clipboard</Button>
            <div id="generated-token-text" className="sr-only">{generatedToken}</div>
          </CardContent>
        </Card>
      )}
    </SectionShell>
  );
}

/* ── Section Shell ──────────────────────────────────────────────── */

function SectionShell({ title, onCreate, children }: { title: string; onCreate?: () => void; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h2>
        {onCreate && <Button size="sm" onClick={onCreate}>+ New</Button>}
      </div>
      {children}
    </div>
  );
}

/* =================================================================
 * AdminPanelContainer — Main container
 * ================================================================= */

export default function AdminPanelContainer() {
  const [activeSection, setActiveSection] = useState<SectionId>("users");

  function renderSection() {
    switch (activeSection) {
      case "users": return <UsersSection />;
      case "signals": return <SignalsSection />;
      case "equivalences": return <EquivalencesSection />;
      case "machine-ips": return <MachineIpsSection />;
      case "comments": return <CommentsSection />;
      case "config": return <ConfigSection />;
      case "tokens": return <TokensSection />;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Panel" description="Manage users, signals, machines, and system configuration." />

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
              activeSection === sec.id
                ? "border-b-2 border-neutral-900 bg-white text-neutral-900 dark:border-white dark:bg-neutral-950 dark:text-white"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      <div>{renderSection()}</div>
    </div>
  );
}

export { UsersSection, EquivalencesSection, MachineIpsSection };
