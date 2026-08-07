import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMachineSubscription } from "../../data/ws-hook";
import { HttpMachineRepo } from "../../data/repos/http-machine-repo";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useAlarmStore } from "../../store/alarm-store";
import { useScadaViewModel } from "../../features/scada/domain/use-scada-view-model";
import { PageHeader } from "../layouts/PageHeader";
import { Button } from "../primitives/button";
import { MachineStatusDot } from "../../features/scada/components/machine-status-dot";
import { CloseTherapyButton } from "../../features/scada/components/close-therapy-button";
import { ScadaLayout } from "../../features/scada/components/scada-layout";
import { History } from "lucide-react";
import type { Machine } from "../../core/types";
import type { ScadaAlarm } from "../../features/scada/components/alarm-panel";
import type { ConnectionStatus } from "../../features/scada/components/machine-status-dot";

const machineRepo = new HttpMachineRepo();
const therapyRepo = new HttpTherapyRepo();

export default function ScadaDetailContainer() {
  const { t } = useTranslation();
  const { id: machineIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const machineId = machineIdParam ?? "";
  useMachineSubscription(machineId);
  const acknowledgeAlarm = useAlarmStore((s) => s.acknowledgeAlarm);
  const storeAlarms = useAlarmStore((s) => s.alarms);

  /* ── Active therapy (REST) for comments panel + history navigation ──
     Resolved before the SCADA VM so the active therapy id can be passed
     as an override; the WS broadcast intentionally does not carry it
     (keeps the hot path lean). */
  const { data: therapies = [] } = useQuery({
    queryKey: ["therapies", "active", machineId],
    queryFn: () => therapyRepo.list({ machine_id: Number(machineId), status: "active" }),
    enabled: machineId.length > 0,
  });
  const activeTherapy = therapies[0];
  const activeTherapyId = activeTherapy?.id;

  /* ── Store-backed live data (single WS connection via App.tsx) ── */
  const vm = useScadaViewModel(machineId, activeTherapyId);
  const machineEntry = useMachineStatusStore((s) => s.machines[machineId]);
  const connectionStatus: ConnectionStatus = machineEntry?.status.status ?? "unknown";

  /* ── Machine info (REST) ─────────────────────────────────────── */
  const { data: machine, isLoading: machineLoading, error: machineError } = useQuery<Machine>({
    queryKey: ["machine", machineId],
    queryFn: () => machineRepo.get(Number(machineId)),
    enabled: machineId.length > 0,
  });

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

  /* ── Final weight default: serial frame wins, DB therapy weight falls back ─ */
  const serialWeight =
    vm.telemetry.info["g_patient_data_weight_set"]?.value ?? null;
  const defaultEndWeight =
    serialWeight != null ? Number(serialWeight) : activeTherapy?.weight ?? null;

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
        <p className="text-lg font-semibold">{t("errors.loadMachineFailed")}</p>
        <p className="mt-1 text-sm text-red-400">{t("errors.machineUnreachable", { id: machineId })}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/dashboard")}>
          &larr; {t("common.backToDashboard")}
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
            title={machine?.label ?? machine?.serial_number ?? `${t("history.machine")} #${machineId}`}
            description={`${t("admin.serial")}: ${machine?.serial_number ?? "—"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          {activeTherapyId != null && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/history/${activeTherapyId}`)}
              >
                <History className="h-3.5 w-3.5" />
                {t("nav.history")}
              </Button>
              <CloseTherapyButton
                therapyId={activeTherapyId}
                defaultWeight={defaultEndWeight}
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            {t("history.back")}
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
