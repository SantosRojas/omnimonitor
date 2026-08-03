import apiClient from "../api-client";
import type { CylinderConfigRepo } from "../../core/repos";
import type { CylinderConfig } from "../../core/types";

export class HttpCylinderConfigRepo implements CylinderConfigRepo {
  async list(): Promise<CylinderConfig[]> {
    const { data } = await apiClient.get<CylinderConfig[]>("/cylinder-configs");
    return data;
  }

  async update(
    pressureType: string,
    data: { min_value: number; max_value: number; step_value: number },
  ): Promise<CylinderConfig> {
    const { data: updated } = await apiClient.put<CylinderConfig>(
      `/cylinder-configs/${pressureType}`,
      data,
    );
    return updated;
  }

  async reset(): Promise<void> {
    await apiClient.post("/cylinder-configs/reset");
  }
}
