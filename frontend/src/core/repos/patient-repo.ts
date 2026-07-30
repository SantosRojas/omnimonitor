import type { Patient } from "../types";

export interface PatientRepo {
  list(params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<Patient[]>;

  search(query: string): Promise<Patient[]>;

  create(data: {
    external_id: string;
    name?: string | null;
    age?: number | null;
    email?: string | null;
    address?: string | null;
  }): Promise<Patient>;

  get(id: number): Promise<Patient>;

  update(
    id: number,
    data: {
      external_id?: string;
      name?: string | null;
      age?: number | null;
      email?: string | null;
      address?: string | null;
    },
  ): Promise<Patient>;
}
