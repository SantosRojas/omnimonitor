import { useState, type ReactNode } from "react";
import { AdminCrudTable } from "../components/AdminCrudTable";
import type { Column } from "../components/AdminCrudTable";
import { AdminCrudForm } from "../components/AdminCrudForm";
import type { Field } from "../components/AdminCrudForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ExportButton } from "../components/ExportButton";
import type { ExportFormat } from "../components/ExportButton";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../../core/types";

/* ── Repo instances ────────────────────────────────────────────── */

const adminRepo = new HttpAdminRepo();
const signalRepo = new HttpSignalRepo();

/* ── Section identifiers ───────────────────────────────────────── */

type SectionId =
  | "users"
  | "signals"
  | "equivalences"
  | "machine-ips"
  | "comments"
  | "config"
  | "tokens";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "signals", label: "Signals" },
  { id: "equivalences", label: "Equivalences" },
  { id: "machine-ips", label: "Machine IPs" },
  { id: "comments", label: "Comments" },
  { id: "config", label: "Config" },
  { id: "tokens", label: "Tokens" },
];

/* ── Generic CRD section state (create + edit + delete) ─────────── */

interface CrudState<T> {
  formOpen: boolean;
  editing: T | null;
  deleting: T | null;
}

function initialCrudState<T>(): CrudState<T> {
  return { formOpen: false, editing: null, deleting: null };
}

/* ── Helper: trigger file download ──────────────────────────────── */

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =================================================================
 * Section Components (4.7 — inline)
 * ================================================================= */

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
      adminRepo.createUser({
        username: String(vals.username),
        password: String(vals.password),
        role: String(vals.role),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setState(initialCrudState);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateUser(Number(vals.id), {
        username: vals.username ? String(vals.username) : undefined,
        role: vals.role ? String(vals.role) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setState(initialCrudState);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setState(initialCrudState);
    },
  });

  const columns: Column<User>[] = [
    { key: "id", label: "ID" },
    { key: "username", label: "Username" },
    { key: "role", label: "Role" },
    {
      key: "created_at",
      label: "Created",
      render: (v) => (v ? new Date(String(v)).toLocaleDateString() : "—"),
    },
  ];

  const formFields: Field[] = [
    { name: "username", label: "Username", type: "text" },
    { name: "password", label: "Password", type: "text" },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "admin", label: "Admin" },
        { value: "operator", label: "Operator" },
        { value: "viewer", label: "Viewer" },
      ],
    },
  ];

  const editFields: Field[] = [
    { name: "username", label: "Username", type: "text" },
    {
      name: "role",
      label: "Role",
      type: "select",
      options: [
        { value: "admin", label: "Admin" },
        { value: "operator", label: "Operator" },
        { value: "viewer", label: "Viewer" },
      ],
    },
  ];

  return (
    <SectionShell
      title="Users"
      onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}
    >
      {!state.formOpen ? (
        <AdminCrudTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          emptyMessage="No users found."
          onEdit={(row) =>
            setState({ formOpen: true, editing: row, deleting: null })
          }
          onDelete={(row) =>
            setState({ formOpen: false, editing: null, deleting: row })
          }
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-800">
            {state.editing ? "Edit User" : "Create User"}
          </h3>
          <AdminCrudForm
            fields={state.editing ? editFields : formFields}
            initialValues={
              state.editing
                ? { id: state.editing.id, username: state.editing.username, role: state.editing.role }
                : undefined
            }
            onSubmit={(vals) => {
              if (state.editing) {
                updateMutation.mutate(vals);
              } else {
                createMutation.mutate(vals);
              }
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
          <button
            type="button"
            onClick={() => setState(initialCrudState)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      <ConfirmDialog
        open={state.deleting !== null}
        title="Delete User"
        message={`Are you sure you want to delete user "${state.deleting?.username}"? This action cannot be undone.`}
        onConfirm={() =>
          state.deleting && deleteMutation.mutate(state.deleting.id)
        }
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
    </SectionShell>
  );
}

/* ── Signals Section ────────────────────────────────────────────── */

function SignalsSection() {
  const { data: signals = [], isLoading } = useQuery({
    queryKey: ["admin", "signals"],
    queryFn: () => signalRepo.list(),
  });

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "internal_name", label: "Internal Name" },
    { key: "display_name", label: "Display Name", render: (v) => String(v ?? "—") },
    { key: "unit", label: "Unit", render: (v) => String(v ?? "—") },
  ];

  return (
    <SectionShell title="Signals">
      <AdminCrudTable
        columns={columns}
        data={signals as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage="No signals found."
      />
    </SectionShell>
  );
}

/* ── Equivalences Section ───────────────────────────────────────── */

function EquivalencesSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<Record<string, unknown>>>(initialCrudState);

  const { data: equivalences = [], isLoading } = useQuery({
    queryKey: ["admin", "equivalences"],
    queryFn: () => adminRepo.listEquivalences(),
  });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.createEquivalence({ from: String(vals.from), to: String(vals.to) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] });
      setState(initialCrudState);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateEquivalence(Number(vals.id), { from: String(vals.from), to: String(vals.to) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] });
      setState(initialCrudState);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteEquivalence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "equivalences"] });
      setState(initialCrudState);
    },
  });

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "from", label: "From" },
    { key: "to", label: "To" },
  ];

  const formFields: Field[] = [
    { name: "from", label: "From", type: "text" },
    { name: "to", label: "To", type: "text" },
  ];

  return (
    <SectionShell
      title="Equivalences"
      onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}
    >
      {state.formOpen ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-800">
            {state.editing ? "Edit Equivalence" : "Create Equivalence"}
          </h3>
          <AdminCrudForm
            fields={formFields}
            initialValues={
              state.editing
                ? { id: state.editing.id, from: state.editing.from, to: state.editing.to }
                : undefined
            }
            onSubmit={(vals) => {
              if (state.editing) updateMutation.mutate(vals);
              else createMutation.mutate(vals);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
          <button
            type="button"
            onClick={() => setState(initialCrudState)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <AdminCrudTable
          columns={columns}
          data={equivalences as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyMessage="No equivalences found."
          onEdit={(row) =>
            setState({ formOpen: true, editing: row, deleting: null })
          }
          onDelete={(row) =>
            setState({ formOpen: false, editing: null, deleting: row })
          }
        />
      )}

      <ConfirmDialog
        open={state.deleting !== null}
        title="Delete Equivalence"
        message={`Are you sure you want to delete this equivalence? This action cannot be undone.`}
        onConfirm={() =>
          state.deleting && deleteMutation.mutate(Number(state.deleting.id))
        }
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
    </SectionShell>
  );
}

/* ── Machine IPs Section ──────────────────────────────────────────── */

function MachineIpsSection() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CrudState<Record<string, unknown>>>(initialCrudState);

  const { data: ips = [], isLoading } = useQuery({
    queryKey: ["admin", "machine-ips"],
    queryFn: () => adminRepo.listMachineIps(),
  });

  const createMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.createMachineIp({ machine_id: Number(vals.machine_id), ip_address: String(vals.ip_address) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] });
      setState(initialCrudState);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vals: Record<string, string | number>) =>
      adminRepo.updateMachineIp(Number(vals.id), { ip_address: String(vals.ip_address) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] });
      setState(initialCrudState);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteMachineIp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "machine-ips"] });
      setState(initialCrudState);
    },
  });

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "machine_id", label: "Machine ID" },
    { key: "ip_address", label: "IP Address" },
  ];

  const formFields: Field[] = [
    { name: "machine_id", label: "Machine ID", type: "number" },
    { name: "ip_address", label: "IP Address", type: "text" },
  ];

  return (
    <SectionShell
      title="Machine IPs"
      onCreate={() => setState({ formOpen: true, editing: null, deleting: null })}
    >
      {state.formOpen ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-800">
            {state.editing ? "Edit Machine IP" : "Add Machine IP"}
          </h3>
          <AdminCrudForm
            fields={formFields}
            initialValues={
              state.editing
                ? { id: state.editing.id, machine_id: state.editing.machine_id, ip_address: state.editing.ip_address }
                : undefined
            }
            onSubmit={(vals) => {
              if (state.editing) updateMutation.mutate(vals);
              else createMutation.mutate(vals);
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
          <button
            type="button"
            onClick={() => setState(initialCrudState)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <AdminCrudTable
          columns={columns}
          data={ips as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyMessage="No machine IPs found."
          onEdit={(row) =>
            setState({ formOpen: true, editing: row, deleting: null })
          }
          onDelete={(row) =>
            setState({ formOpen: false, editing: null, deleting: row })
          }
        />
      )}

      <ConfirmDialog
        open={state.deleting !== null}
        title="Delete Machine IP"
        message={`Are you sure you want to delete this machine IP? This action cannot be undone.`}
        onConfirm={() =>
          state.deleting && deleteMutation.mutate(Number(state.deleting.id))
        }
        onCancel={() => setState(initialCrudState)}
        isLoading={deleteMutation.isPending}
      />
    </SectionShell>
  );
}

/* ── Comments Section ─────────────────────────────────────────────── */

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "comments", activeTherapyId] });
      setNewComment("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminRepo.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "comments", activeTherapyId] });
      setDeletingComment(null);
    },
  });

  function handleLoadTherapy() {
    const id = Number(therapyIdInput);
    if (id > 0) setActiveTherapyId(id);
  }

  const columns: Column<Record<string, unknown>>[] = [
    { key: "id", label: "ID" },
    { key: "content", label: "Comment" },
    {
      key: "created_at",
      label: "Created",
      render: (v) => (v ? new Date(String(v)).toLocaleString() : "—"),
    },
  ];

  return (
    <SectionShell title="Therapy Comments">
      {/* Therapy ID selector */}
      <div className="mb-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">
            Therapy ID
          </label>
          <input
            type="number"
            value={therapyIdInput}
            onChange={(e) => setTherapyIdInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Enter therapy ID"
          />
        </div>
        <button
          type="button"
          onClick={handleLoadTherapy}
          disabled={!therapyIdInput}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Load
        </button>
      </div>

      {activeTherapyId && (
        <>
          <AdminCrudTable
            columns={columns}
            data={comments as Record<string, unknown>[]}
            isLoading={isLoading}
            emptyMessage="No comments for this therapy."
            onDelete={(row) => setDeletingComment(row)}
          />

          {/* Add comment */}
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment…"
              className="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!newComment.trim() || createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {createMutation.isPending ? "Adding…" : "Add"}
            </button>
          </div>

          <ConfirmDialog
            open={deletingComment !== null}
            title="Delete Comment"
            message="Are you sure you want to delete this comment?"
            onConfirm={() =>
              deletingComment && deleteMutation.mutate(Number(deletingComment.id))
            }
            onCancel={() => setDeletingComment(null)}
            isLoading={deleteMutation.isPending}
          />
        </>
      )}
    </SectionShell>
  );
}

/* ── Config Section ──────────────────────────────────────────────── */

function ConfigSection() {
  const { data: config, isLoading } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => adminRepo.getConfig(),
  });

  if (isLoading) {
    return (
      <SectionShell title="Configuration">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </SectionShell>
    );
  }

  const entries = config ? Object.entries(config) : [];

  return (
    <SectionShell title="Configuration">
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No configuration data available.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Key
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {entries.map(([key, value]) => (
                <tr key={key} className="hover:bg-gray-50/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">
                    {key}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

/* ── Tokens Section ──────────────────────────────────────────────── */

function TokensSection() {
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The AdminRepo doesn't have a generateToken method, so we call the API
  // directly via apiClient. This is consistent with how token generation was
  // described in the spec — "displays a new token".
  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setGeneratedToken(null);

    try {
      const { default: apiClient } = await import("../../data/api-client");
      const { data } = await apiClient.post<{ token: string }>("/admin/tokens");
      setGeneratedToken(data.token);
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "error" in err
          ? (err as { error: string }).error
          : "Failed to generate token.";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <SectionShell title="Token Generation">
      <p className="mb-4 text-sm text-gray-600">
        Generate a new API token for programmatic access.
      </p>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {isGenerating ? "Generating…" : "Generate Token"}
      </button>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {generatedToken && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm font-medium text-green-800">
            Token generated successfully
          </p>
          <pre className="overflow-x-auto rounded bg-white p-3 text-xs text-gray-800">
            {generatedToken}
          </pre>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(generatedToken).catch(() => {
                // Fallback: select the text
                const el = document.querySelector("#generated-token-text");
                if (el) {
                  const range = document.createRange();
                  range.selectNode(el);
                  window.getSelection()?.removeAllRanges();
                  window.getSelection()?.addRange(range);
                }
              });
            }}
            className="mt-3 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
          >
            Copy to clipboard
          </button>
          <div id="generated-token-text" className="sr-only">
            {generatedToken}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

/* ── Section Shell ──────────────────────────────────────────────── */

function SectionShell({
  title,
  onCreate,
  children,
}: {
  title: string;
  onCreate?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            + New
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* =================================================================
 * AdminPanelContainer — Main container (4.6)
 * ================================================================= */

/**
 * Main admin panel container.
 *
 * Provides tab navigation across all admin sections (Users, Signals,
 * Equivalences, Machine IPs, Comments, Config, Tokens). Each section is
 * a self-contained component that manages its own data fetching, CRUD
 * operations, and UI state.
 */
export default function AdminPanelContainer() {
  const [activeSection, setActiveSection] = useState<SectionId>("users");

  /* ── Section renderer ─────────────────────────────────────────── */
  function renderSection() {
    switch (activeSection) {
      case "users":
        return <UsersSection />;
      case "signals":
        return <SignalsSection />;
      case "equivalences":
        return <EquivalencesSection />;
      case "machine-ips":
        return <MachineIpsSection />;
      case "comments":
        return <CommentsSection />;
      case "config":
        return <ConfigSection />;
      case "tokens":
        return <TokensSection />;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage users, signals, machines, and system configuration.
        </p>
      </div>

      {/* ── Tab navigation ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              activeSection === sec.id
                ? "border-b-2 border-blue-600 bg-white text-blue-700"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* ── Active section content ───────────────────────────────── */}
      <div>{renderSection()}</div>
    </div>
  );
}

/* ── Re-export for App.tsx import convenience ─────────────────── */

export { UsersSection, EquivalencesSection, MachineIpsSection };
