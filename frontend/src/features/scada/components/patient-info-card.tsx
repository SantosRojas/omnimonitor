import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../../ui/primitives/card";
import { Play } from "lucide-react";
import { formatDateTime } from "../../../core/utils/format";
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
  labelKey: string;
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
  const { t } = useTranslation();

  const fields: FieldConfig[] = [
    { key: "g_patient_id_str", labelKey: "scada.patientInfo.patient", format: (v) => v },
    { key: "g_patient_data_weight_set", labelKey: "scada.patientInfo.weight", unit: "kg" },
    { key: "g_therapy_mode_set", labelKey: "scada.patientInfo.therapyMode", format: (v) => v },
    { key: "g_anticoag_mode_set", labelKey: "scada.patientInfo.anticoagulant", format: (v) => v },
    { key: "g_substitution_mode_set", labelKey: "scada.patientInfo.substitution", format: (v) => v },
    { key: "d_renal_dose_act", labelKey: "scada.patientInfo.renalDose", unit: "ml/kg/h" },
    { key: "d_kit_type_str", labelKey: "scada.patientInfo.kit", format: (v) => v },
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

  /** Signal display labels resolve catalog-first (D4): `scada.signal.<internal_name>`
   *  wins when present (en overlay), otherwise the DB `displayNameMap` value or a
   *  static localized label. */
  function signalLabel(field: FieldConfig): string {
    return t(`scada.signal.${field.key}`, {
      defaultValue: displayNameMap?.[field.key] ?? t(field.labelKey),
    });
  }

  const therapyTimeLabel = t("scada.signal.c_acc_therapy_time_act", {
    defaultValue: displayNameMap?.["c_acc_therapy_time_act"] ?? t("scada.patientInfo.therapyTime"),
  });
  const netRemovalLabel = t("scada.signal.c_acc_net_rem_vol_act", {
    defaultValue: displayNameMap?.["c_acc_net_rem_vol_act"] ?? t("scada.patientInfo.netRemovalVol"),
  });

  return (
    <Card className="rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-scada-muted">
        {t("scada.patientInfo.title")}
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
          const label = signalLabel(field);
          return (
            <Fragment key={field.key}>
              <div className="flex justify-between text-xs">
                <span className="text-scada-muted">{label}</span>
                <span className="font-mono text-scada-text">{value}</span>
              </div>
              {field.key === "g_patient_id_str" && age != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-scada-muted">{t("scada.patientInfo.age")}</span>
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
              {t("scada.patientInfo.therapyStart")}
            </span>
            <span className="font-mono text-scada-text">
              {formatDateTime(therapyStart)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
