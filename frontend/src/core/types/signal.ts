export interface Signal {
  id: number;
  internal_name: string;
  display_name: string | null;
  unit: string | null;
}

export interface SignalMapping {
  id: number;
  signal_id: number;
  numeric_value: string | null;
  display_name: string | null;
}
