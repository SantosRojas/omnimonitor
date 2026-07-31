export interface Reading {
  id: number;
  machine_id: number;
  therapy_id: number | null;
  signal_id: number | null;
  internal_name: string;
  recorded_at: string | null;
  raw_value: number | null;
  value: number | null;
  unit: string | null;
  display_label: string | null;
  phase: string | null;
  created_at: string;
}

export interface ReadingBroadcast {
  machine_id: string;
  readings: Reading[];
}

export interface ReadingsReplay {
  machine_id: string;
  readings: Reading[];
}
