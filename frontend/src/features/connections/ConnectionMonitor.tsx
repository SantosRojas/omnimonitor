import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpAdminRepo } from "../../data/repos/http-admin-repo";
import { wsManager } from "../../data/ws-manager";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useBridgeStatusStore } from "../../store/bridge-status-store";
import { useScadaStore, type TelemetryReading, type ScadaMachineState } from "../scada/domain/scada-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { DataTable } from "../../ui/components/DataTable";
import type { Column } from "../../ui/components/DataTable";
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

interface MachineRow extends Machine {
  liveStatus: string;
  telemetry: ScadaMachineState | undefined;
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
    .filter((m) => m.liveStatus === "online") as MachineRow[];

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

  const columns: Column<MachineRow>[] = [
    {
      key: "label",
      label: t("scada.connection.machine"),
      className: "font-medium",
      render: (m) => m.label ?? t("scada.connection.machineFallback", { id: m.id }),
    },
    {
      key: "serial_number",
      label: t("admin.serial"),
      render: (m) => m.serial_number ?? "—",
    },
    {
      key: "pressures",
      label: t("scada.layout.pressures"),
      sortable: false,
      render: (m) => (
        <div className="space-y-0.5 whitespace-nowrap">
          {PRESSURE_GAUGES.map((g) => (
            <span key={g.key} className="block">
              {t(`scada.signal.${g.key}`, { defaultValue: g.label })}: {formatReading(m.telemetry?.pressures[g.key])}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "flows",
      label: t("scada.layout.flows"),
      sortable: false,
      render: (m) => (
        <div className="space-y-0.5 whitespace-nowrap">
          {FLOW_INDICATORS.map((f) => (
            <span key={f.key} className="block">
              {t(`scada.signal.${f.key}`, { defaultValue: f.label })}: {formatReading(m.telemetry?.flows[f.key])}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "bridgeLabel",
      label: t("scada.connection.bridgeLabel"),
      render: (m) => {
        const bridge = m.ip_address ? bridgeByIp.get(m.ip_address) : undefined;
        return bridge?.label ?? bridge?.ip_address ?? "—";
      },
    },
    {
      key: "failures",
      label: t("scada.connection.failures"),
      sortable: false,
      render: (m) => {
        const bridge = m.ip_address ? bridgeByIp.get(m.ip_address) : undefined;
        const bridgeStatus = bridge ? bridgeStatuses[bridge.id] : undefined;
        return (
          <span
            className={
              bridgeStatus && bridgeStatus.failure_count > 0
                ? "font-mono font-semibold text-red-500"
                : "font-mono text-neutral-600"
            }
          >
            {bridgeStatus ? bridgeStatus.failure_count : "—"}
          </span>
        );
      },
    },
  ];

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
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 dark:text-neutral-950 dark:hover:bg-accent/80"
            >
              {t("common.retry")}
            </button>
          </CardContent>
        </Card>
      ) : (
        <DataTable<MachineRow>
          columns={columns}
          data={rows}
          keyExtractor={(m) => m.id}
          isLoading={isLoading}
          emptyMessage={t("scada.connection.noOnlineMachines")}
        />
      )}
    </div>
  );
}
