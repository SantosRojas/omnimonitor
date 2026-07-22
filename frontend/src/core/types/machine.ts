export type MachineStatus = "online" | "offline" | "error" | "unknown";

export interface Machine {
  id: number;
  serial_number: string;
  software_version: string | null;
  ip_address: string | null;
  port: number | null;
  label: string | null;
  status: MachineStatus | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface MachineStatusPayload {
  status: MachineStatus;
  last_seen_at: string | null;
}
