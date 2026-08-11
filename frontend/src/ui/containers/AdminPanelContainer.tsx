import { useState, type ReactNode } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Table } from "../components/AdminCrudTable";
import type { Column } from "../components/AdminCrudTable";
import { AdminCrudForm } from "../components/AdminCrudForm";
import type { Field } from "../components/AdminCrudForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, Bridge, Machine, ApiError } from "../../core/types";
import { PageHeader } from "../layouts/PageHeader";
import { Modal } from "../primitives/modal";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { formatDate, formatDateTime } from "../../core/utils/format";

const adminRepo = new HttpAdminRepo();
const signalRepo = new HttpSignalRepo();

type SectionId = "users" | "signals" | "equivalences" | "bridges" | "machines";

const SECTIONS: { id: SectionId }[] = [
  { id: "users" },
  { id: "signals" },
  { id: "equivalences" },
  { id: "bridges" },
  { id: "machines" },
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<User>>(initialCrudState);
  const [formError, setFormError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: () => adminRepo.listUsers(),
  });

  function handleError(error: unknown) {
    setFormError((error as ApiError)?.error ?? t("errors.unexpected"));
  }

  function resetFormState() {
    setFormError(null);
    setNewPassword("");
    setResetSuccess(false);
  }

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.createUser({
        username: String(vals.username),
        password: String(vals.password),
        role: String(vals.role),
        email: vals.email ? String(vals.email) : null,
      }),
    onError: handleError,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); resetFormState(); },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateUser(Number(vals.id), {
        username: vals.username ? String(vals.username) : undefined,
        role: vals.role ? String(vals.role) : undefined,
        email: vals.email ? String(vals.email) : undefined,
      }),
    onError: handleError,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); resetFormState(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); setState(initialCrudState); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: number) => adminRepo.resetPassword(id, newPassword),
    onSuccess: () => { setNewPassword(""); setResetSuccess(true); },
  });

  const columns: Column<User>[] = [
    { key: "username", label: t("admin.username") },
    { key: "email", label: t("admin.email"), render: (item) => item.email || "—" },
    { key: "role", label: t("admin.role") },
    { key: "created_at", label: t("admin.created"), render: (item) => (item.created_at ? formatDate(item.created_at) : "—") },
  ];

  const formFields: Field[] = [
    { name: "username", label: t("admin.username"), type: "text" },
    { name: "password", label: t("admin.password"), type: "password" },
    { name: "email", label: t("admin.email"), type: "email", optional: true },
    { name: "role", label: t("admin.role"), type: "select", options: [{ value: "admin", label: t("admin.roleAdmin") }, { value: "operator", label: t("admin.roleOperator") }, { value: "viewer", label: t("admin.roleViewer") }] },
  ];

  const editFields: Field[] = [
    { name: "username", label: t("admin.username"), type: "text" },
    { name: "email", label: t("admin.email"), type: "email", optional: true },
    { name: "role", label: t("admin.role"), type: "select", options: [{ value: "admin", label: t("admin.roleAdmin") }, { value: "operator", label: t("admin.roleOperator") }, { value: "viewer", label: t("admin.roleViewer") }] },
  ];

  return (
    <SectionShell title={t("admin.users")} onCreate={() => { resetFormState(); setState({ formOpen: true, editing: null, deleting: null }); }}>
      <Table<User>
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        emptyMessage={t("admin.noUsers")}
        filterableColumns={["username", "email", "role"]}
        onEdit={(row) => { resetFormState(); setState({ formOpen: true, editing: row, deleting: null }); }}
        onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
      />
      <Modal
        open={state.formOpen}
        title={state.editing ? t("admin.editUser") : t("admin.createUser")}
        onClose={() => { resetFormState(); setState(initialCrudState); }}
        size="lg"
      >
        <AdminCrudForm
          fields={state.editing ? editFields : formFields}
          initialValues={state.editing ? { id: state.editing.id, username: state.editing.username, email: state.editing.email ?? "", role: state.editing.role } : undefined}
          onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={formError}
          onCancel={() => { resetFormState(); setState(initialCrudState); }}
        />
        {state.editing && (
          <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <h4 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">{t("admin.resetPasswordTitle")}</h4>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="crud-reset-password" className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("admin.newPassword")}</label>
                <Input
                  id="crud-reset-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setResetSuccess(false); }}
                  placeholder={t("admin.newPassword")}
                />
              </div>
              <Button size="sm" disabled={!newPassword || resetPasswordMutation.isPending} onClick={() => state.editing && resetPasswordMutation.mutate(state.editing.id)}>
                {resetPasswordMutation.isPending ? t("common.saving") : t("admin.resetPassword")}
              </Button>
            </div>
            {resetPasswordMutation.isError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t("admin.passwordResetFailed")}</p>
            )}
            {resetSuccess && (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400">{t("admin.passwordResetSuccess")}</p>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={state.deleting !== null} title={t("admin.deleteUser")} message={t("admin.deleteUserMessage", { username: state.deleting?.username ?? "" })} onConfirm={() => state.deleting && deleteMutation.mutate(state.deleting.id)} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Signals Section ────────────────────────────────────────────── */

function SignalsSection() {
  const { t } = useTranslation();
  const { data: signals = [], isLoading } = useQuery({ queryKey: ["admin", "signals"], queryFn: () => signalRepo.list() });
  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: t("admin.id") },
    { key: "internal_name", label: t("admin.internalName") },
    { key: "display_name", label: t("admin.displayName"), render: (item) => String(item.display_name ?? "—") },
    { key: "unit", label: t("admin.unit"), render: (item) => String(item.unit ?? "—") },
  ];
  return (
    <SectionShell title={t("admin.signals")}>
      <Table<Record<string, unknown>>
        columns={columns}
        data={signals as unknown as Record<string, unknown>[]}
        keyExtractor={(row) => row.id as number}
        isLoading={isLoading}
        emptyMessage={t("admin.noSignals")}
        filterableColumns={["internal_name", "display_name"]}
      />
    </SectionShell>
  );
}

/* ── Equivalences Section ───────────────────────────────────────── */

function EquivalencesSection() {
  const { t } = useTranslation();
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
    { key: "id", label: t("admin.id") }, { key: "from", label: t("admin.from") }, { key: "to", label: t("admin.to") },
  ];
  const formFields: Field[] = [
    { name: "from", label: t("admin.from"), type: "text" }, { name: "to", label: t("admin.to"), type: "text" },
  ];

  return (
    <SectionShell title={t("admin.equivalences")} onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      <Table<Record<string, unknown>>
        columns={columns}
        data={equivalences as Record<string, unknown>[]}
        keyExtractor={(row) => row.id as number}
        isLoading={isLoading}
        emptyMessage={t("admin.noEquivalences")}
        filterableColumns={["from", "to"]}
        onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
        onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
      />
      <Modal
        open={state.formOpen}
        title={state.editing ? t("admin.editEquivalence") : t("admin.createEquivalence")}
        onClose={() => setState(initialCrudState)}
      >
        <AdminCrudForm
          fields={formFields}
          initialValues={state.editing ? { id: state.editing.id as number, from: state.editing.from as string, to: state.editing.to as string } : undefined}
          onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setState(initialCrudState)}
        />
      </Modal>
      <ConfirmDialog open={state.deleting !== null} title={t("admin.deleteEquivalence")} message={t("admin.deleteEquivalenceMessage", { from: state.deleting?.from ?? "", to: state.deleting?.to ?? "" })} onConfirm={() => state.deleting && deleteMutation.mutate(Number(state.deleting.id))} onCancel={() => setState(initialCrudState)} isLoading={deleteMutation.isPending} />
    </SectionShell>
  );
}

/* ── Bridges Section (RPi serial gateways) ───────────────────── */

function BridgesSection() {
  const { t } = useTranslation();
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
    { key: "ip_address", label: t("admin.ipAddress") },
    { key: "label", label: t("admin.label"), render: (item) => item.label ?? "—" },
    {
      key: "authorized",
      label: t("admin.authorized"),
      render: (item) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.authorized ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
          {item.authorized ? t("common.yes") : t("common.no")}
        </span>
      ),
    },
    {
      key: "status",
      label: t("admin.status"),
      render: (item) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${item.status === "online" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${item.status === "online" ? "bg-green-500" : "bg-neutral-400"}`} />
          {t(`state.${item.status}`, { defaultValue: item.status })}
        </span>
      ),
    },
    { key: "last_seen_at", label: t("admin.lastSeen"), render: (item) => item.last_seen_at ? formatDateTime(item.last_seen_at) : "—" },
  ];

  const formFields: Field[] = [
    { name: "ip_address", label: t("admin.ipAddress"), type: "text" },
    { name: "label", label: t("admin.label"), type: "text" },
  ];

  const editFields: Field[] = [
    { name: "label", label: t("admin.label"), type: "text" },
    {
      name: "authorized",
      label: t("admin.authorized"),
      type: "select",
      options: [
        { value: "true", label: t("common.yes") },
        { value: "false", label: t("common.no") },
      ],
    },
  ];

  return (
    <SectionShell title={t("admin.bridges")} onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}>
      <Table<Bridge>
        columns={columns}
        data={bridges}
        keyExtractor={(b) => b.id}
        isLoading={isLoading}
        emptyMessage={t("admin.noBridges")}
        filterableColumns={["ip_address", "label", "status"]}
        onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
        onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
      />
      <Modal
        open={state.formOpen}
        title={state.editing ? t("admin.editBridge", { ip: state.editing.ip_address }) : t("admin.registerBridge")}
        onClose={() => setState(initialCrudState)}
      >
        <AdminCrudForm
          fields={state.editing ? editFields : formFields}
          initialValues={state.editing ? { id: state.editing.id, label: state.editing.label ?? "", authorized: state.editing.authorized ? "true" : "false" } : undefined}
          onSubmit={(vals) => { if (state.editing) updateMutation.mutate(vals); else createMutation.mutate(vals); }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => setState(initialCrudState)}
        />
      </Modal>
      <ConfirmDialog
        open={state.deleting !== null}
        title={t("admin.deleteBridge")}
        message={t("admin.deleteBridgeMessage", { ip: state.deleting?.ip_address ?? "" })}
        onConfirm={() => state.deleting && deleteMutation.mutate(state.deleting.id)}
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
    </SectionShell>
  );
}

/* ── Machines Section (auto-registered by bridge, editable IP/label) */

function MachinesSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const machineRepo = new HttpMachineRepo();
  const [state, setState] = useState<CrudState<Machine>>(initialCrudState);

  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      machineRepo.update(Number(vals.id), {
        label: vals.label ? String(vals.label) : undefined,
        ip_address: vals.ip_address ? String(vals.ip_address) : undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["machines"] }); setState(initialCrudState); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => machineRepo.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["machines"] }); setState(initialCrudState); },
  });

  const columns: Column<Machine>[] = [
    { key: "serial_number", label: t("admin.serial") },
    { key: "label", label: t("admin.label"), render: (item) => item.label ?? "—" },
    { key: "ip_address", label: t("admin.ipAddress"), render: (item) => item.ip_address ?? "—" },
    {
      key: "status",
      label: t("admin.status"),
      render: (item) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${item.status === "online" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${item.status === "online" ? "bg-green-500" : "bg-neutral-400"}`} />
          {item.status ? t(`state.${item.status}`) : t("state.unknown")}
        </span>
      ),
    },
    { key: "last_seen_at", label: t("admin.lastSeen"), render: (item) => item.last_seen_at ? formatDateTime(item.last_seen_at) : "—" },
  ];

  const editFields: Field[] = [
    { name: "label", label: t("admin.label"), type: "text" },
    { name: "ip_address", label: t("admin.ipAddress"), type: "text" },
  ];

  return (
    <SectionShell title={t("admin.machines")}>
      <Table<Machine>
        columns={columns}
        data={machines}
        keyExtractor={(m) => m.id}
        isLoading={isLoading}
        emptyMessage={t("admin.noMachines")}
        filterableColumns={["serial_number", "ip_address", "label", "status"]}
        onEdit={(row) => setState({ formOpen: true, editing: row, deleting: null })}
        onDelete={(row) => setState({ formOpen: false, editing: null, deleting: row })}
      />
      <Modal
        open={state.formOpen}
        title={t("admin.editMachine", { serial: state.editing?.serial_number ?? "" })}
        onClose={() => setState(initialCrudState)}
      >
        <AdminCrudForm
          fields={editFields}
          initialValues={state.editing ? { id: state.editing.id, label: state.editing.label ?? "", ip_address: state.editing.ip_address ?? "" } : undefined}
          onSubmit={(vals) => { updateMutation.mutate(vals); }}
          isLoading={updateMutation.isPending}
          onCancel={() => setState(initialCrudState)}
        />
      </Modal>
      <ConfirmDialog
        open={state.deleting !== null}
        title={t("admin.deleteMachine")}
        message={t("admin.deleteMachineMessage", { serial: state.deleting?.serial_number ?? "" })}
        onConfirm={() => state.deleting && deleteMutation.mutate(state.deleting.id)}
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
    </SectionShell>
  );
}

/* ── Section Shell ──────────────────────────────────────────────── */

function SectionShell({ title, onCreate, children }: { title: string; onCreate?: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h2>
        {onCreate && <Button size="sm" onClick={onCreate}>{t("admin.new")}</Button>}
      </div>
      {children}
    </div>
  );
}

/* =================================================================
 * AdminPanelContainer — Main container
 * ================================================================= */

export default function AdminPanelContainer() {
  const { t } = useTranslation();
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
      case "machines": return <MachinesSection />;
    }
  }

  // Redirect bare /admin to /admin/users
  if (location.pathname === "/admin" || location.pathname === "/admin/") {
    return <Navigate to="/admin/users" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.title")} description={t("admin.description")} />

      <div>{renderSection()}</div>
    </div>
  );
}

export { UsersSection, BridgesSection, EquivalencesSection, MachinesSection };
