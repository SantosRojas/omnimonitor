import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMachineSubscription } from "../../data/ws-hook";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useAlarmStore } from "../../store/alarm-store";
import { useScadaViewModel } from "../../features/scada/domain/use-scada-view-model";
import { PageHeader } from "../layouts/PageHeader";
import { Button } from "../primitives/button";
import { MachineStatusDot } from "../../features/scada/components/machine-status-dot";
import { TherapyStateMachine } from "../../features/scada/components/therapy-state-machine";
import { ScadaLayout } from "../../features/scada/components/scada-layout";
import type { Machine } from "../../core/types";
import type { ScadaAlarm } from "../../features/scada/components/alarm-panel";
import type { TherapyState } from "../../features/scada/components/therapy-state-machine";
import type { ConnectionStatus } from "../../features/scada/components/machine-status-dot";

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

export default function ScadaDetailContainer() {
  const { id: machineIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const machineId = machineIdParam ?? "";
  useMachineSubscription(machineId);
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
  const activeTherapy = therapies[0];
  const activeTherapyId = activeTherapy?.id;

  /* ── Alarms from the store ───────────────────────────────────── */
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

  /* ── Active therapy summary for header + patient info fallback ─ */
  const therapySummary = activeTherapy
    ? {
        patientExternalId: activeTherapy.patient_external_id ?? null,
        patientName: activeTherapy.patient_name ?? null,
        age: activeTherapy.patient_age ?? null,
        weight: activeTherapy.weight ?? null,
        kit: activeTherapy.kit ?? null,
        therapyType: activeTherapy.therapy_type ?? null,
      }
    : undefined;

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
            state={toTherapyState(vm.therapy.stateName, vm.therapy.active, connectionStatus)}
            patientName={activeTherapy?.patient_name ?? activeTherapy?.patient_external_id ?? undefined}
            startedAt={activeTherapy?.started_at ?? undefined}
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

      {/* Ported SCADA layout (pdms-omni) */}
      <ScadaLayout
        vm={vm}
        alarms={machineAlarms}
        onAcknowledge={handleAcknowledge}
        therapySummary={therapySummary}
      />
    </div>
  );
}
