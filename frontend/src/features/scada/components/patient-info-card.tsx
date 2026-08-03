import { Card } from "../../../ui/primitives/card";
import { Play } from "lucide-react";
import type { TelemetryReading } from "../domain/scada-store";

interface PatientInfoCardProps {
  info: Record<string, TelemetryReading>;
  therapyStart?: string | null;
  therapyTime?: string;
  netRemovalVol?: string;
  displayNameMap?: Record<string, string>;
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
 * omni `Reading` shape (`value` + `display_label` instead of
 * `physical_value` + `display_value`).
 */
export function PatientInfoCard({
  info,
  therapyStart,
  therapyTime,
  netRemovalVol,
  displayNameMap,
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
    if (field.unit) {
      return typeof reading.value === "number" ? `${reading.value} ${field.unit}` : null;
    }
    const display = reading.display_label;
    if (display !== null && display !== undefined && display !== "") return display;
    return typeof reading.value === "number" ? String(reading.value) : null;
  }

  return (
    <Card className="rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-scada-muted">
        Information
      </h3>
      <div className="space-y-2">
        {fields.map((field) => {
          const reading = info[field.key];
          if (!reading) return null;
          const label = displayNameMap?.[field.key] ?? field.label;
          const value = formatValue(reading, field);
          return (
            <div key={field.key} className="flex justify-between text-xs">
              <span className="text-scada-muted">{label}</span>
              <span className="font-mono text-scada-text">{value ?? "--"}</span>
            </div>
          );
        })}
        <div className="flex justify-between text-xs">
          <span className="text-scada-muted">Therapy Time</span>
          <span className="font-mono text-scada-text">{therapyTime || "--:--:--"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-scada-muted">Net Removal Vol</span>
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
