import type { Therapy } from "../types";

export interface TherapyRepo {
  list(params?: {
    patient_id?: number;
    machine_id?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<Therapy[]>;

  get(id: number): Promise<Therapy>;

  create(data: {
    patient_id: number;
    machine_id: number;
    therapy_type?: string;
    kit?: string;
    weight?: number;
  }): Promise<Therapy>;

  update(id: number, data: { status?: string }): Promise<Therapy>;

  updateStatus(id: number, status: string): Promise<Therapy>;

  updateMetadata(
    id: number,
    metadata: { therapy_type?: string; kit?: string; weight?: number },
  ): Promise<Therapy>;

  getDetail(id: number): Promise<Therapy>;
}
