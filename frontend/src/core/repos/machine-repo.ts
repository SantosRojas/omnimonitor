import type { Machine } from "../types";

export interface MachineRepo {
  list(): Promise<Machine[]>;
  get(id: number): Promise<Machine>;
  create(data: {
    serial_number: string;
    label?: string;
    ip_address?: string;
    port?: number;
  }): Promise<Machine>;
  update(
    id: number,
    data: {
      label?: string;
      ip_address?: string;
      port?: number;
      software_version?: string;
    },
  ): Promise<Machine>;
  delete(id: number): Promise<void>;
}
