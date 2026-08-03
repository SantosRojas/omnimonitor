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
  /** Patient's external identifier (DNI/code from the bridge), set by GET /therapies. */
  patient_external_id?: string | null;
  /** Patient's display name, set by GET /therapies. */
  patient_name?: string | null;
  /** Patient's age, set by GET /therapies. */
  patient_age?: number | null;
}

/** A single historical reading row returned by GET /therapies/:id/history. */
export interface HistoryRow {
  id: number;
  machine_id: number;
  therapy_id: number | null;
  signal_id: number | null;
  recorded_at: string | null;
  raw_value: number | null;
  value: number | null;
  unit: string | null;
  created_at: string;
  /** Resolved via LEFT JOIN signals */
  internal_name: string | null;
}

/** A therapy note/comment. */
export interface TherapyComment {
  id: number;
  therapy_id: number;
  user_id: number;
  username: string;
  content: string;
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
