import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { wsManager } from "../../data/ws-manager";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useBridgeStatusStore } from "../../store/bridge-status-store";
import { useScadaStore, type TelemetryReading } from "../scada/domain/scada-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { PRESSURE_GAUGES, FLOW_INDICATORS } from "../scada/signal-configs";
import type { Machine } from "../../core/types/machine";
import type { Bridge } from "../../core/types/bridge";

const machineRepo = new HttpMachineRepo();
const adminRepo = new HttpAdminRepo();

/** Formats a live reading as `value unit`, or "—" when absent. */
function formatReading(r: TelemetryReading | undefined): string {
  if (!r || r.value === null || r.value === undefined) return "—";
  return r.unit ? `${r.value} ${r.unit}` : String(r.value);
}

export default function ConnectionMonitor() {
  const { t } = useTranslation();
  const machineStatuses = useMachineStatusStore((s) => s.machines);
  const bridgeStatuses = useBridgeStatusStore((s) => s.bridges);
  // Classified per-machine telemetry (pressures/flows) fed by the WS adapter.
  const scadaMachines = useScadaStore((s) => s.machines);

  const { data: machines, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["machines"],
    queryFn: () => machineRepo.list(),
  });

  // Bridge catalog (label + IP) so each machine row can show its serving bridge.
  const { data: bridges = [] } = useQuery<Bridge[]>({
    queryKey: ["bridges"],
    queryFn: () => adminRepo.listBridges(),
  });

  const bridgeByIp = useMemo(
    () => new Map(bridges.map((b) => [b.ip_address, b])),
    [bridges],
  );

  // Only online machines are shown (pre/post-therapy live monitoring).
  const rows = (machines ?? [])
    .map((m: Machine) => {
      const live = machineStatuses[String(m.id)];
      const status = live?.status?.status ?? m.status ?? "unknown";
      return { ...m, liveStatus: status, telemetry: scadaMachines[String(m.id)] };
    })
    .filter((m) => m.liveStatus === "online");

  // Subscribe to live broadcasts for every online machine — not just the ones
  // with an active therapy — so pre/post-therapy phases are observable.
  // The effect diffs against the previous set so refetches don't churn
  // Subscribe/Unsubscribe on unchanged machines (same pattern as DashboardPage).
  useEffect(() => {
    const prev = new Set<string>();
    const sync = () => {
      const current = new Set(rows.map((m) => String(m.id)));
      for (const id of current) {
        if (!prev.has(id)) wsManager.subscribeMachine(id);
      }
      for (const id of prev) {
        if (!current.has(id)) wsManager.unsubscribeMachine(id);
      }
      prev.clear();
      for (const id of current) prev.add(id);
    };
    sync();
    return () => {
      for (const id of prev) wsManager.unsubscribeMachine(id);
      prev.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, rows.map((m) => m.id).join(",")]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("scada.connection.title")} description={t("scada.connection.description")} />

      {/* ── Machine Status Table ── */}
      {isError ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="mb-3 text-red-500">
              <p className="font-medium">{t("scada.connection.loadFailed")}</p>
              <p className="mt-1 text-sm text-neutral-500">{(error as Error)?.message ?? t("scada.connection.unknownError")}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-accent dark:text-neutral-950 dark:hover:bg-[#22d9ff]"
            >
              {t("common.retry")}
            </button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">{t("scada.connection.loadingMachines")}</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">{t("scada.connection.noOnlineMachines")}</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("scada.connection.machine")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("admin.serial")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("scada.layout.pressures")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("scada.layout.flows")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("scada.connection.bridgeLabel")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">{t("scada.connection.failures")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((m: any) => {
                const bridge: Bridge | undefined = m.ip_address
                  ? bridgeByIp.get(m.ip_address)
                  : undefined;
                const bridgeStatus = bridge ? bridgeStatuses[bridge.id] : undefined;
                return (
                  <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3 font-medium">{m.label ?? t("scada.connection.machineFallback", { id: m.id })}</td>
                    <td className="px-4 py-3 text-neutral-500">{m.serial_number ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5 whitespace-nowrap">
                        {PRESSURE_GAUGES.map((g) => (
                          <span key={g.key} className="block">
                            {t(`scada.signal.${g.key}`, { defaultValue: g.label })}: {formatReading(m.telemetry?.pressures[g.key])}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5 whitespace-nowrap">
                        {FLOW_INDICATORS.map((f) => (
                          <span key={f.key} className="block">
                            {t(`scada.signal.${f.key}`, { defaultValue: f.label })}: {formatReading(m.telemetry?.flows[f.key])}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {bridge?.label ?? bridge?.ip_address ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          bridgeStatus && bridgeStatus.failure_count > 0
                            ? "font-mono font-semibold text-red-500"
                            : "font-mono text-neutral-600"
                        }
                      >
                        {bridgeStatus ? bridgeStatus.failure_count : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
