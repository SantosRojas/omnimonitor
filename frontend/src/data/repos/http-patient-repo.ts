import apiClient from "../api-client";
import type { PatientRepo } from "../../core/repos";
import type { Patient } from "../../core/types";

export class HttpPatientRepo implements PatientRepo {
  async list(params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<Patient[]> {
    const { data } = await apiClient.get<Patient[]>("/patients", {
      params,
    });
    return data;
  }

  async search(query: string): Promise<Patient[]> {
    const { data } = await apiClient.get<Patient[]>("/patients/search", {
      params: { search: query },
    });
    return data;
  }

  async create(input: {
    external_id: string;
    name?: string | null;
    age?: number | null;
    email?: string | null;
    address?: string | null;
  }): Promise<Patient> {
    const { data } = await apiClient.post<Patient>("/patients", input);
    return data;
  }

  async get(id: number): Promise<Patient> {
    const { data } = await apiClient.get<Patient>(`/patients/${id}`);
    return data;
  }

  async update(
    id: number,
    input: {
      external_id?: string;
      name?: string | null;
      age?: number | null;
      email?: string | null;
      address?: string | null;
    },
  ): Promise<Patient> {
    const { data } = await apiClient.put<Patient>(
      `/patients/${id}`,
      input,
    );
    return data;
  }
}
