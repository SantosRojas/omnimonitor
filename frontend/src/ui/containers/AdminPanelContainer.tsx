import { useState, type ReactNode } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { Table } from "../components/AdminCrudTable";
import type { Column } from "../components/AdminCrudTable";
import { AdminCrudForm } from "../components/AdminCrudForm";
import type { Field } from "../components/AdminCrudForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, Bridge } from "../../core/types";
import { PageHeader } from "../layouts/PageHeader";
import { Card, CardContent } from "../primitives/card";
import { Button } from "../primitives/button";

const adminRepo = new HttpAdminRepo();
const signalRepo = new HttpSignalRepo();

type SectionId = "users" | "signals" | "equivalences" | "bridges" | "machine-ips";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "signals", label: "Signals" },
  { id: "equivalences", label: "Equivalences" },
  { id: "bridges", label: "Bridges" },
  { id: "machine-ips", label: "Machine IPs" },
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
    { key: "username", label: "Username" },
    { key: "role", label: "Role" },
    { key: "created_at", label: "Created", render: (item) => (item.created_at ? new Date(item.created_at).toLocaleDateString() : "—") },
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
        <Table<User>
          columns={columns}
          data={users}
          keyExtractor={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No users found."
          filterableColumns={["username", "role"]}
          onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
          onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
        />
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
    { key: "display_name", label: "Display Name", render: (item) => String(item.display_name ?? "—") },
    { key: "unit", label: "Unit", render: (item) => String(item.unit ?? "—") },
  ];
  return (
    <SectionShell title="Signals">
      <Table<Record<string, unknown>>
        columns={columns}
        data={signals as unknown as Record<string, unknown>[]}
        keyExtractor={(row) => row.id as number}
        isLoading={isLoading}
        emptyMessage="No signals found."
        filterableColumns={["internal_name", "display_name"]}
      />
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
        <Table<Record<string, unknown>>
          columns={columns}
          data={equivalences as Record<string, unknown>[]}
          keyExtractor={(row) => row.id as number}
          isLoading={isLoading}
          emptyMessage="No equivalences found."
          filterableColumns={["from", "to"]}
          onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
          onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
        />
      )}
      <ConfirmDialog open={state.deleting !== null} title="Delete Equivalence" message="Are you sure you want to delete this equivalence?" onConfirm={() => state.deleting && deleteMutation.mutate(Number(state.deleting.id))} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Bridges Section (RPi serial gateways) ───────────────────── */

function BridgesSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<Bridge>>(initialCrudState);

  const { data: bridges = [], isLoading } = useQuery<Bridge[]>({
    queryKey: ["admin", "bridges"],
    queryFn: () => adminRepo.listBridges(),
  });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.createBridge({
        ip_address: String(vals.ip_address),
        label: vals.label ? String(vals.label) : undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "bridges"] }); setState(initialCrudState); },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateBridge(Number(vals.id), {
        label: vals.label ? String(vals.label) : undefined,
        authorized: vals.authorized !== undefined ? String(vals.authorized) === "true" : undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "bridges"] }); setState(initialCrudState); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteBridge(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "bridges"] }); setState(initialCrudState); },
  });

  const columns: Column<Bridge>[] = [
    { key: "ip_address", label: "IP Address" },
    { key: "label", label: "Label", render: (item) => item.label ?? "—" },
    {
      key: "authorized",
      label: "Authorized",
      render: (item) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.authorized ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
          {item.authorized ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${item.status === "online" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${item.status === "online" ? "bg-green-500" : "bg-neutral-400"}`} />
          {item.status}
        </span>
      ),
    },
    { key: "last_seen_at", label: "Last Seen", render: (item) => item.last_seen_at ? new Date(item.last_seen_at).toLocaleString() : "—" },
  ];

  const formFields: Field[] = [
    { name: "ip_address", label: "IP Address", type: "text" },
    { name: "label", label: "Label", type: "text" },
  ];

  const editFields: Field[] = [
    { name: "label", label: "Label", type: "text" },
    {
      name: "authorized",
      label: "Authorized",
      type: "select",
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
  ];

  return (
    <SectionShell title="Bridges" onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      {!state.formOpen ? (
        <Table<Bridge>
          columns={columns}
          data={bridges}
          keyExtractor={(b) => b.id}
          isLoading={isLoading}
          emptyMessage="No bridges registered. Add the bridge IP so it can authenticate."
          filterableColumns={["ip_address", "label", "status"]}
          onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
          onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white">
              {state.editing ? `Edit Bridge: ${state.editing.ip_address}` : "Register Bridge"}
            </h3>
            <AdminCrudForm
              fields={state.editing ? editFields : formFields}
              initialValues={state.editing ? { id: state.editing.id, label: state.editing.label ?? "", authorized: state.editing.authorized ? "true" : "false" } : undefined}
              onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setState(initialCrudState)}>Cancel</Button>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={state.deleting !== null}
        title="Delete Bridge"
        message={`Are you sure you want to remove bridge "${state.deleting?.ip_address}"? The bridge will not be able to connect.`}
        onConfirm={() => state.deleting && deleteMutation.mutate(state.deleting.id)}
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
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
        <Table<Record<string, unknown>>
          columns={columns}
          data={ips as Record<string, unknown>[]}
          keyExtractor={(row) => row.id as number}
          isLoading={isLoading}
          emptyMessage="No machine IPs found."
          filterableColumns={["ip_address", "machine_id"]}
          onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
          onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
        />
      )}
      <ConfirmDialog open={state.deleting !== null} title="Delete Machine IP" message="Are you sure you want to delete this machine IP?" onConfirm={() => state.deleting && deleteMutation.mutate(Number(state.deleting.id))} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
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
  const location = useLocation();
  // Extract the section from the URL path: /admin/<section>
  const pathSection = location.pathname.replace("/admin/", "");
  const activeSection: SectionId = (
    SECTIONS.some((s) => s.id === pathSection) ? pathSection : "users"
  ) as SectionId;

  function renderSection() {
    switch (activeSection) {
      case "users": return <UsersSection />;
      case "signals": return <SignalsSection />;
      case "equivalences": return <EquivalencesSection />;
      case "bridges": return <BridgesSection />;
      case "machine-ips": return <MachineIpsSection />;
    }
  }

  // Redirect bare /admin to /admin/users
  if (location.pathname === "/admin" || location.pathname === "/admin/") {
    return <Navigate to="/admin/users" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Panel" description="Manage users, signals, equivalences, bridges, and machine IPs." />

      <div>{renderSection()}</div>
    </div>
  );
}

export { UsersSection, BridgesSection, EquivalencesSection, MachineIpsSection };
