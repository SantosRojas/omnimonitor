import apiClient from "../api-client";
import type { MachineRepo } from "../../core/repos";
import type { Machine } from "../../core/types";

export class HttpMachineRepo implements MachineRepo {
  async list(): Promise<Machine[]> {
    const { data } = await apiClient.get<Machine[]>("/machines");
    return data;
  }

  async get(id: number): Promise<Machine> {
    const { data } = await apiClient.get<Machine>(`/machines/${id}`);
    return data;
  }

  async create(input: {
    serial_number: string;
    label?: string;
    ip_address?: string;
    port?: number;
  }): Promise<Machine> {
    const { data } = await apiClient.post<Machine>("/machines", input);
    return data;
  }

  async update(
    id: number,
    input: {
      label?: string;
      ip_address?: string;
      port?: number;
      software_version?: string;
    },
  ): Promise<Machine> {
    const { data } = await apiClient.put<Machine>(
      `/machines/${id}`,
      input,
    );
    return data;
  }

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/machines/${id}`);
  }
}
