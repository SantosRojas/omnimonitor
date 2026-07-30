export type TherapyStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "paused"
  | "unknown";

export interface Therapy {
  id: number;
  patient_id: number;
  machine_id: number;
  started_at: string | null;
  ended_at: string | null;
  status: TherapyStatus | null;
  therapy_type: string | null;
  kit: string | null;
  weight: number | null;
  end_weight: number | null;
  created_at: string;
}

export interface ActiveTherapyRow {
  therapy_id: number;
  patient_id: number;
  patient_external_id: string;
  machine_id: number;
  machine_serial: string;
  machine_label: string | null;
  status: TherapyStatus;
  started_at: string;
  elapsed_seconds: number;
  pressures: Record<string, number>;
  flows: Record<string, number>;
}
