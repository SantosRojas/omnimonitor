import apiClient from "../api-client";
import type { SignalRepo } from "../../core/repos";
import type { Signal, SignalMapping } from "../../core/types";

export class HttpSignalRepo implements SignalRepo {
  async list(): Promise<Signal[]> {
    const { data } = await apiClient.get<Signal[]>("/signals");
    return data;
  }

  async create(input: {
    internal_name: string;
    display_name?: string;
    unit?: string;
  }): Promise<Signal> {
    const { data } = await apiClient.post<Signal>("/signals", input);
    return data;
  }

  async update(
    id: number,
    input: { display_name?: string; unit?: string },
  ): Promise<Signal> {
    const { data } = await apiClient.patch<Signal>(
      `/signals/${id}`,
      input,
    );
    return data;
  }

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/signals/${id}`);
  }

  async addMapping(
    signalId: number,
    input: { numeric_value: string; display_name: string },
  ): Promise<SignalMapping> {
    const { data } = await apiClient.post<SignalMapping>(
      `/signals/${signalId}/mappings`,
      input,
    );
    return data;
  }

  async deleteMapping(signalId: number, mappingId: number): Promise<void> {
    await apiClient.delete(
      `/signals/${signalId}/mappings/${mappingId}`,
    );
  }
}
