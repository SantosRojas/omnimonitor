import apiClient from "../api-client";
import type { TherapyRepo } from "../../core/repos";
import type { Therapy, HistoryRow, TherapyComment } from "../../core/types";

export class HttpTherapyRepo implements TherapyRepo {
  async list(params?: {
    patient_id?: number;
    machine_id?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<Therapy[]> {
    const { data } = await apiClient.get<Therapy[]>("/therapies", {
      params,
    });
    return data;
  }

  async get(id: number): Promise<Therapy> {
    const { data } = await apiClient.get<Therapy>(`/therapies/${id}`);
    return data;
  }

  async create(input: {
    patient_id: number;
    machine_id: number;
    therapy_type?: string;
    kit?: string;
    weight?: number;
  }): Promise<Therapy> {
    const { data } = await apiClient.post<Therapy>("/therapies", input);
    return data;
  }

  async update(id: number, input: { status?: string }): Promise<Therapy> {
    const { data } = await apiClient.patch<Therapy>(
      `/therapies/${id}`,
      input,
    );
    return data;
  }

  async updateStatus(id: number, status: string): Promise<Therapy> {
    const { data } = await apiClient.put<Therapy>(
      `/therapies/${id}`,
      { status },
    );
    return data;
  }

  async updateMetadata(
    id: number,
    metadata: {
      therapy_type?: string;
      kit?: string;
      weight?: number;
      end_weight?: number | null;
    },
  ): Promise<Therapy> {
    const { data } = await apiClient.put<Therapy>(
      `/therapies/${id}/metadata`,
      metadata,
    );
    return data;
  }

  async getDetail(id: number): Promise<Therapy> {
    const { data } = await apiClient.get<Therapy>(
      `/therapies/${id}/detail`,
    );
    return data;
  }

  async getHistory(therapyId: number, limit?: number): Promise<HistoryRow[]> {
    const { data } = await apiClient.get<HistoryRow[]>(
      `/therapies/${therapyId}/history`,
      { params: { limit } },
    );
    return data;
  }

  async getComments(therapyId: number): Promise<TherapyComment[]> {
    const { data } = await apiClient.get<TherapyComment[]>(
      `/therapies/${therapyId}/comments`,
    );
    return data;
  }

  async createComment(
    therapyId: number,
    content: string,
  ): Promise<TherapyComment> {
    const { data } = await apiClient.post<TherapyComment>(
      `/therapies/${therapyId}/comments`,
      { content },
    );
    return data;
  }

  async deleteComment(commentId: number): Promise<void> {
    await apiClient.delete(`/therapies/comments/${commentId}`);
  }
}
