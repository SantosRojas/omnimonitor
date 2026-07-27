import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { useWsMachine } from "../../data/ws-hook";
import { useAlarmStore } from "../../store/alarm-store";
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
import type { Machine, MachineStatus, Reading, WsMessage } from "../../core/types";
import type { ScadaAlarm } from "../../features/scada/components/alarm-panel";
import type { Vital } from "../../features/scada/components/vitals-display";

const machineRepo = new HttpMachineRepo();

export default function ScadaDetailContainer() {
  const { id: machineIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const machineId = machineIdParam ?? "";
  const acknowledgeAlarm = useAlarmStore((s) => s.acknowledgeAlarm);
  const storeAlarms = useAlarmStore((s) => s.alarms);

  /* ── Machine info (REST) ─────────────────────────────────────── */
  const { data: machine, isLoading: machineLoading, error: machineError } = useQuery<Machine>({
    queryKey: ["machine", machineId],
    queryFn: () => machineRepo.get(Number(machineId)),
    enabled: machineId.length > 0,
  });

  /* ── WebSocket ───────────────────────────────────────────────── */
  const wsMessage = useWsMachine(machineId);

  const [machineStatus, setMachineStatus] = useState<MachineStatus | null>(null);

  useEffect(() => {
    if (wsMessage?.type === "MachineStatus" && wsMessage.machine_id === machineId) {
      setMachineStatus(wsMessage.status.status);
    }
  }, [wsMessage, machineId]);

  /* ── Trend tracking ──────────────────────────────────────────── */
  const trendRef = useRef<{ timestamp: string; pressure: number }[]>([]);
  const prevReadingsRef = useRef<Map<string, number | null>>(new Map());

  const gaugeData = useMemo<{ label: string; value: number | null; unit: string; trend: "up" | "down" | "stable" }[]>(() => {
    if (!wsMessage || (wsMessage.type !== "ReadingsBroadcast" && wsMessage.type !== "ReadingsReplay") || wsMessage.machine_id !== machineId) {
      return [];
    }
    const readings = "readings" in wsMessage ? (wsMessage as Extract<WsMessage, { readings: Reading[] }>).readings : [];
    const prev = new Map(prevReadingsRef.current);
    const data = readings.map((r) => {
      const key = r.display_label ?? `Signal #${r.signal_id ?? r.id}`;
      const prevVal = prev.get(key);
      let trend: "up" | "down" | "stable" = "stable";
      if (prevVal != null && r.value != null) {
        trend = r.value > prevVal ? "up" : r.value < prevVal ? "down" : "stable";
      }
      return { label: key, value: r.value, unit: r.unit ?? "—", trend };
    });
    const current = new Map<string, number | null>();
    data.forEach((d) => current.set(d.label, d.value));
    prevReadingsRef.current = current;
    return data;
  }, [wsMessage, machineId]);

  /* ── Derived values ──────────────────────────────────────────── */
  const displayStatus: MachineStatus = machineStatus ?? machine?.status ?? "unknown";
  const isOnline = displayStatus === "online";
  const hasLiveData = gaugeData.length > 0;

  const pressureReading = gaugeData.find((g) => g.label.toLowerCase().includes("pressure"));
  const pressure = pressureReading?.value ?? 0;

  const vitals: Vital[] = gaugeData.slice(0, 6).map((g) => ({
    label: g.label,
    value: g.value?.toFixed(1) ?? "—",
    unit: g.unit,
    trend: g.trend,
    status: g.value != null && g.value > 50 ? "critical" : g.value != null && g.value > 40 ? "warning" : "normal",
  }));

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

  const flowRate = gaugeData.find((g) => g.label.toLowerCase().includes("flow"))?.value ?? 0;
  const sourcePressure = gaugeData.find((g) => g.label.toLowerCase().includes("source"))?.value ?? pressure * 1.5;
  const running = hasLiveData && pressure > 0;

  /* ── Trend data ──────────────────────────────────────────────── */
  useEffect(() => {
    if (pressure > 0) {
      trendRef.current = [...trendRef.current.slice(-119), { timestamp: new Date().toISOString(), pressure }];
    }
  }, [pressure]);

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
          <MachineStatusDot status={displayStatus as any} size="lg" />
          <PageHeader
            title={machine?.label ?? machine?.serial_number ?? `Machine #${machineId}`}
            description={`Serial: ${machine?.serial_number ?? "—"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <TherapyStateMachine
            state={running ? "running" : isOnline ? "idle" : "error"}
            patientName={(machine as any)?.patient_name}
          />
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
            <TrendChart data={trendRef.current} width={260} height={100} />
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
              {isOnline ? "Waiting for live data..." : "Machine is offline"}
            </p>
            <p className="mt-1 text-xs">
              {isOnline ? "Connect to receive real-time telemetry." : "No data while disconnected."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
