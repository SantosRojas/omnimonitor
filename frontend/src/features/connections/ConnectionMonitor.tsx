import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useBridgeStatusStore } from "../../store/bridge-status-store";
import { startWsAdapter } from "../../data/ws-adapter";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Badge } from "../../ui/primitives/badge";
import { cn } from "../../ui/primitives";
import { MachineStatusDot } from "../scada/components/machine-status-dot";
import type { Machine } from "../../core/types/machine";

const machineRepo = new HttpMachineRepo();

const statusBadgeVariant: Record<string, "success" | "danger" | "secondary" | "warning"> = {
  online: "success",
  offline: "secondary",
  error: "danger",
};

const bridgeStateColor: Record<string, string> = {
  Running: "bg-green-500",
  Initializing: "bg-amber-500",
  FailedLimit: "bg-red-500",
  Stopped: "bg-neutral-400",
};

const bridgeStateBadge: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  Running: "success",
  Initializing: "warning",
  FailedLimit: "danger",
  Stopped: "secondary",
};

const wsStateBadge: Record<string, "success" | "secondary" | "warning"> = {
  connected: "success",
  disconnected: "secondary",
  reconnecting: "warning",
};

export default function ConnectionMonitor() {
  const machineStatuses = useMachineStatusStore((s) => s.machines);
  const bridgeStatuses = useBridgeStatusStore((s) => s.bridges);

  useEffect(() => {
    const stop = startWsAdapter();
    return () => stop();
  }, []);

  const { data: machines, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
  });

  const rows = (machines ?? []).map((m: Machine) => {
    const live = machineStatuses[String(m.id)];
    const status = live?.status?.status ?? m.status ?? "unknown";
    const lastSeen = live?.status?.last_seen_at ?? m.last_seen_at;
    return { ...m, liveStatus: status, lastSeen };
  });

  const bridgeEntries = Object.entries(bridgeStatuses);

  return (
    <div className="space-y-6">
      <PageHeader title="Connection Monitor" description="Bridge connection status for all machines" />

      {/* ── Bridge Status Cards ── */}
      {bridgeEntries.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">Bridge Status</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bridgeEntries.map(([id, status]) => (
              <Card key={id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Bridge #{id}</CardTitle>
                  <span
                    className={cn(
                      "inline-block h-3 w-3 rounded-full",
                      bridgeStateColor[status.state] ?? "bg-neutral-400",
                    )}
                    title={status.state}
                  />
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">State</span>
                    <Badge variant={bridgeStateBadge[status.state] ?? "secondary"}>{status.state}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Failures</span>
                    <span className={cn(
                      "font-mono",
                      status.failure_count > 0 ? "text-red-500 font-semibold" : "text-neutral-600",
                    )}>
                      {status.failure_count}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">WS</span>
                    <Badge variant={wsStateBadge[status.ws_state] ?? "secondary"}>{status.ws_state}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Last Updated</span>
                    <span className="text-neutral-600">
                      {new Date(status.updated_at).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Machine Status Table ── */}
      {isError ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="mb-3 text-red-500">
              <p className="font-medium">Failed to load machines</p>
              <p className="mt-1 text-sm text-neutral-500">{(error as Error)?.message ?? "Unknown error"}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">Loading machines...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">No machines registered</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Machine</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Serial</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Last Seen</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Bridge Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((m: any) => (
                <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">{m.label ?? `Machine ${m.id}`}</td>
                  <td className="px-4 py-3 text-neutral-500">{m.serial_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MachineStatusDot status={m.liveStatus as any} />
                      <Badge variant={statusBadgeVariant[m.liveStatus] ?? "secondary"}>{m.liveStatus}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {m.lastSeen ? new Date(m.lastSeen).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{m.software_version ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Empty Bridge Status ── */}
      {bridgeEntries.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-neutral-400">
            No bridge status available. Bridge status appears here once a bridge connects and sends serial status.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
