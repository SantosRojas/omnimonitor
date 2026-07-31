import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useAlarmStore } from "../../store/alarm-store";
import { useScadaViewModel } from "../../features/scada/domain/use-scada-view-model";
import { FLOW_INDICATORS, PRESSURE_GAUGES } from "../../features/scada/signal-configs";
import { PageHeader } from "../layouts/PageHeader";
import { Button } from "../primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../primitives/card";
import { PressureGauge } from "../../features/scada/components/pressure-gauge";
import { ProcessFlowDiagram } from "../../features/scada/components/process-flow-diagram";
import { VitalsDisplay } from "../../features/scada/components/vitals-display";
import { AlarmPanel } from "../../features/scada/components/alarm-panel";
import { TherapyStateMachine } from "../../features/scada/components/therapy-state-machine";
import { MachineStatusDot } from "../../features/scada/components/machine-status-dot";
import { TrendChart } from "../../features/scada/components/trend-chart";
import type { Machine } from "../../core/types";
import type { ScadaAlarm } from "../../features/scada/components/alarm-panel";
import type { Vital } from "../../features/scada/components/vitals-display";
import type { TherapyState } from "../../features/scada/components/therapy-state-machine";
import type { ConnectionStatus } from "../../features/scada/components/machine-status-dot";
import type { TrendDataPoint } from "../../features/scada/components/trend-chart";
import type { TelemetryHistoryPoint } from "../../features/scada/domain/scada-store";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();

/** Maps the server therapy state name to the TherapyStateMachine union. */
function toTherapyState(
  stateName: string,
  active: boolean,
  connectionStatus: ConnectionStatus,
): TherapyState {
  const name = stateName.toLowerCase();
  if (active) return name === "paused" ? "paused" : "running";
  if (name === "completed") return "complete";
  return connectionStatus === "online" ? "idle" : "error";
}

/** Latest-vs-previous numeric trend for a signal across the history points. */
function signalTrend(
  history: TelemetryHistoryPoint[],
  internalName: string,
): "up" | "down" | "stable" | undefined {
  const values = history
    .map((h) => h[internalName])
    .filter((v): v is number => typeof v === "number");
  if (values.length < 2) return undefined;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (last == null || prev == null) return undefined;
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "stable";
}

export default function ScadaDetailContainer() {
  const { id: machineIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const machineId = machineIdParam ?? "";
  const acknowledgeAlarm = useAlarmStore((s) => s.acknowledgeAlarm);
  const storeAlarms = useAlarmStore((s) => s.alarms);

  /* ── Store-backed live data (single WS connection via App.tsx) ── */
  const vm = useScadaViewModel(machineId);
  const machineEntry = useMachineStatusStore((s) => s.machines[machineId]);
  const connectionStatus: ConnectionStatus = machineEntry?.status.status ?? "unknown";

  /* ── Machine info (REST) ─────────────────────────────────────── */
  const { data: machine, isLoading: machineLoading, error: machineError } = useQuery<Machine>({
    queryKey: ["machine", machineId],
    queryFn: () => machineRepo.get(Number(machineId)),
    enabled: machineId.length > 0,
  });

  /* ── Active therapy for history navigation ──────────────────── */
  const { data: therapies = [] } = useQuery({
    queryKey: ["therapies", "active", machineId],
    queryFn: () => therapyRepo.list({ machine_id: Number(machineId), status: "active" }),
    enabled: machineId.length > 0,
  });
  const activeTherapyId = therapies[0]?.id;

  /* ── Primary signals (configured gauge order, numeric only) ──── */
  const primaryPressure = useMemo(() => {
    for (const g of PRESSURE_GAUGES) {
      const r = vm.telemetry.pressures[g.key];
      if (r && typeof r.value === "number") return r;
    }
    return Object.values(vm.telemetry.pressures).find(
      (r) => typeof r.value === "number",
    );
  }, [vm.telemetry.pressures]);

  const pressure = primaryPressure?.value ?? 0;

  const primaryFlow = useMemo(() => {
    for (const f of FLOW_INDICATORS) {
      const r = vm.telemetry.flows[f.key];
      if (r && typeof r.value === "number") return r;
    }
    return Object.values(vm.telemetry.flows).find(
      (r) => typeof r.value === "number",
    );
  }, [vm.telemetry.flows]);

  const flowRate = primaryFlow?.value ?? 0;

  /* Source cylinder pressure: secondary pressure when available. */
  const sourcePressure = useMemo(() => {
    for (const g of PRESSURE_GAUGES) {
      const r = vm.telemetry.pressures[g.key];
      if (r && typeof r.value === "number" && r !== primaryPressure) {
        return r.value;
      }
    }
    return pressure;
  }, [vm.telemetry.pressures, pressure, primaryPressure]);

  /* ── Trend data from classified history ──────────────────────── */
  const trendData = useMemo<TrendDataPoint[]>(() => {
    const key = primaryPressure?.internal_name;
    if (!key) return [];
    return vm.telemetry.history
      .map((h) => ({ timestamp: h.timestamp, pressure: h[key] }))
      .filter(
        (p): p is { timestamp: string; pressure: number } =>
          typeof p.pressure === "number",
      );
  }, [vm.telemetry.history, primaryPressure]);

  /* ── Derived values ──────────────────────────────────────────── */
  const hasLiveData =
    Object.keys(vm.telemetry.pressures).length > 0 ||
    Object.keys(vm.telemetry.flows).length > 0;
  const running = vm.therapy.active;
  const therapyState = toTherapyState(
    vm.therapy.stateName,
    vm.therapy.active,
    connectionStatus,
  );

  const vitals: Vital[] = useMemo(() => {
    const items: Vital[] = [];
    for (const key of [
      ...PRESSURE_GAUGES.map((g) => g.key),
      ...FLOW_INDICATORS.map((f) => f.key),
    ]) {
      const r = vm.telemetry.pressures[key] ?? vm.telemetry.flows[key];
      if (!r) continue;
      items.push({
        label: vm.presentation.displayNameMap[r.internal_name] ?? r.internal_name,
        value: r.value?.toFixed(1) ?? "—",
        unit: r.unit ?? undefined,
        trend: signalTrend(vm.telemetry.history, r.internal_name),
        status: "normal",
      });
    }
    return items;
  }, [
    vm.telemetry.pressures,
    vm.telemetry.flows,
    vm.telemetry.history,
    vm.presentation.displayNameMap,
  ]);

  const machineAlarms: ScadaAlarm[] = storeAlarms
    .filter((a) => a.machineId === machineId)
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      timestamp: a.timestamp,
      acknowledged: a.acknowledged,
      source: a.source,
    }));

  /* ── Handle alarm acknowledge ────────────────────────────────── */
  const handleAcknowledge = (alarmId: string) => acknowledgeAlarm(alarmId);

  /* ── Loading state ────────────────────────────────────────── */
  if (machineLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────── */
  if (machineError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-red-600">
        <p className="text-lg font-semibold">Failed to load machine</p>
        <p className="mt-1 text-sm text-red-400">Machine "{machineId}" could not be found or is unreachable.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/dashboard")}>
          &larr; Back to Dashboard
        </Button>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MachineStatusDot status={connectionStatus} size="lg" />
          <PageHeader
            title={machine?.label ?? machine?.serial_number ?? `Machine #${machineId}`}
            description={`Serial: ${machine?.serial_number ?? "—"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <TherapyStateMachine
            state={therapyState}
            patientName={(machine as any)?.patient_name}
          />
          {activeTherapyId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/history/${activeTherapyId}`)}
            >
              History
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            &larr; Back
          </Button>
        </div>
      </div>

      {/* SCADA Visualization Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pressure Gauge */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Pressure</CardTitle></CardHeader>
          <CardContent>
            <PressureGauge pressure={pressure} maxPressure={60} />
          </CardContent>
        </Card>

        {/* Process Flow */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Flow Diagram</CardTitle></CardHeader>
          <CardContent>
            <ProcessFlowDiagram
              sourcePressure={sourcePressure}
              workingPressure={pressure}
              flowActive={running}
              flowRate={flowRate}
              isRunning={running}
            />
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Trend</CardTitle></CardHeader>
          <CardContent>
            <TrendChart data={trendData} width={260} height={100} />
          </CardContent>
        </Card>
      </div>

      {/* Vitals */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Vitals</CardTitle></CardHeader>
        <CardContent>
          <VitalsDisplay vitals={vitals.length > 0 ? vitals : [{ label: "No data", value: "—", status: "normal" }]} columns={3} />
        </CardContent>
      </Card>

      {/* Alarms */}
      <AlarmPanel alarms={machineAlarms} onAcknowledge={handleAcknowledge} />

      {/* No data state */}
      {!hasLiveData && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-neutral-400">
            <p className="text-sm font-medium">
              {connectionStatus === "online" ? "Waiting for live data..." : "Machine is offline"}
            </p>
            <p className="mt-1 text-xs">
              {connectionStatus === "online" ? "Connect to receive real-time telemetry." : "No data while disconnected."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
