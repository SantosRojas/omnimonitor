export interface Patient {
  id: number;
  external_id: string;
  name: string | null;
  age: number | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string | null;
}
