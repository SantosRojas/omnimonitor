import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { startWsAdapter } from "../../data/ws-adapter";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Badge } from "../../ui/primitives/badge";
import { MachineStatusDot } from "../scada/components/machine-status-dot";
import type { Machine } from "../../core/types/machine";

const machineRepo = new HttpMachineRepo();

const statusBadgeVariant: Record<string, "success" | "danger" | "secondary"> = {
  online: "success",
  offline: "secondary",
  error: "danger",
};

export default function ConnectionMonitor() {
  const machineStatuses = useMachineStatusStore((s) => s.machines);

  useEffect(() => {
    const stop = startWsAdapter();
    return () => stop();
  }, []);

  const { data: machines, isLoading } = useQuery({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
  });

  const rows = (machines ?? []).map((m: Machine) => {
    const live = machineStatuses[String(m.id)];
    const status = live?.status?.status ?? m.status ?? "unknown";
    const lastSeen = live?.status?.last_seen_at ?? m.last_seen_at;
    return { ...m, liveStatus: status, lastSeen };
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Connection Monitor" description="Bridge connection status for all machines" />

      {isLoading ? (
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
                      <MachineStatusDot status={m.liveStatus} />
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
    </div>
  );
}
