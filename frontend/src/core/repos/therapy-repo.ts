import type { Therapy, HistoryRow, TherapyComment } from "../types";

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
    metadata: {
      therapy_type?: string;
      kit?: string;
      weight?: number;
      end_weight?: number | null;
    },
  ): Promise<Therapy>;

  getDetail(id: number): Promise<Therapy>;

  /** GET /therapies/:id/history — readings for a therapy. */
  getHistory(therapyId: number, limit?: number): Promise<HistoryRow[]>;

  /** GET /therapies/:id/comments */
  getComments(therapyId: number): Promise<TherapyComment[]>;

  /** POST /therapies/:id/comments */
  createComment(therapyId: number, content: string): Promise<TherapyComment>;

  /** DELETE /therapies/comments/:comment_id */
  deleteComment(commentId: number): Promise<void>;

  /** DELETE /therapies/:id — soft-delete a closed therapy with an audit reason. */
  deleteTherapy(id: number, reason: string): Promise<void>;
}
