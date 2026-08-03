import { Fragment } from "react";
import { Card } from "../../../ui/primitives/card";
import { Play } from "lucide-react";
import type { TelemetryReading } from "../domain/scada-store";

/** Database-backed subset of the active therapy, used when the bridge has not sent a signal. */
export interface TherapySummary {
  patientExternalId?: string | null;
  patientName?: string | null;
  age?: number | null;
  weight?: number | null;
  kit?: string | null;
  therapyType?: string | null;
}

interface PatientInfoCardProps {
  info: Record<string, TelemetryReading>;
  therapyStart?: string | null;
  therapyTime?: string;
  netRemovalVol?: string;
  displayNameMap?: Record<string, string>;
  therapySummary?: TherapySummary;
}

interface FieldConfig {
  key: string;
  label: string;
  unit?: string;
  format?: (v: string) => string;
}

/**
 * Patient / therapy setup card. Ported from pdms-omni
 * `presentation/components/scada/patient-info-card.tsx`, adapted to the
 * omni `Reading` shape (`value` + `unit`).
 */
export function PatientInfoCard({
  info,
  therapyStart,
  therapyTime,
  netRemovalVol,
  displayNameMap,
  therapySummary,
}: PatientInfoCardProps) {
  const fields: FieldConfig[] = [
    { key: "g_patient_id_str", label: "Patient", format: (v) => v },
    { key: "g_patient_data_weight_set", label: "Weight", unit: "kg" },
    { key: "g_therapy_mode_set", label: "Therapy Mode", format: (v) => v },
    { key: "g_anticoag_mode_set", label: "Anticoagulant", format: (v) => v },
    { key: "g_substitution_mode_set", label: "Substitution", format: (v) => v },
    { key: "d_renal_dose_act", label: "Renal Dose", unit: "ml/kg/h" },
    { key: "d_kit_type_str", label: "Kit", format: (v) => v },
  ];

  function formatValue(reading: TelemetryReading, field: FieldConfig): string | null {
    if (reading.value == null) return null;
    if (field.format) {
      return field.format(String(reading.value));
    }
    if (field.unit) {
      return `${reading.value} ${field.unit}`;
    }
    return String(reading.value);
  }

  /**
   * Patient identifier: merges the DB name with the bridge DNI so the live
   * reading never hides the patient's name. DNI comes from the bridge
   * reading (`g_patient_id_str`) or the therapy's `patientExternalId`.
   */
  function mergePatientName(reading?: TelemetryReading): string | null {
    const summary = therapySummary;
    const liveDni = reading && reading.value != null ? String(reading.value) : null;
    const dni = liveDni ?? summary?.patientExternalId ?? null;
    const name = summary?.patientName ?? null;
    if (name && dni) return `${name} (${dni})`;
    return name ?? dni;
  }

  /** Database-backed fallback for a field the bridge has not sent yet. */
  function fallbackValue(field: FieldConfig): string | null {
    const summary = therapySummary;
    if (!summary) return null;
    switch (field.key) {
      case "g_patient_data_weight_set":
        return summary.weight != null ? `${summary.weight} kg` : null;
      case "g_therapy_mode_set":
        return summary.therapyType ?? null;
      case "d_kit_type_str":
        return summary.kit ?? null;
      default:
        return null;
    }
  }

  const age = therapySummary?.age ?? null;

  /** Therapy time and net removal labels come from the signals catalog
   *  (`displayNameMap`), falling back to English when not present. */
  const therapyTimeLabel = displayNameMap?.["c_acc_therapy_time_act"] ?? "Therapy Time";
  const netRemovalLabel = displayNameMap?.["c_acc_net_rem_vol_act"] ?? "Net Removal Vol";

  return (
    <Card className="rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-scada-muted">
        Information
      </h3>
      <div className="space-y-2">
        {fields.map((field) => {
          const reading = info[field.key];
          const value =
            field.key === "g_patient_id_str"
              ? mergePatientName(reading)
              : reading
                ? formatValue(reading, field)
                : fallbackValue(field);
          if (!value) return null;
          const label = displayNameMap?.[field.key] ?? field.label;
          return (
            <Fragment key={field.key}>
              <div className="flex justify-between text-xs">
                <span className="text-scada-muted">{label}</span>
                <span className="font-mono text-scada-text">{value}</span>
              </div>
              {field.key === "g_patient_id_str" && age != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-scada-muted">Age</span>
                  <span className="font-mono text-scada-text">{age}</span>
                </div>
              )}
            </Fragment>
          );
        })}
        <div className="flex justify-between text-xs">
          <span className="text-scada-muted">{therapyTimeLabel}</span>
          <span className="font-mono text-scada-text">{therapyTime || "--:--:--"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-scada-muted">{netRemovalLabel}</span>
          <span className="font-mono text-scada-text">{netRemovalVol || "--- ml"}</span>
        </div>
        {therapyStart && (
          <div className="mt-2 flex justify-between border-t border-scada-border pt-2 text-xs">
            <span className="flex items-center gap-1 text-scada-muted">
              <Play className="h-3 w-3 text-primary" />
              Therapy Start
            </span>
            <span className="font-mono text-scada-text">
              {new Date(therapyStart).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
