import apiClient from "../api-client";
import type { AdminRepo } from "../../core/repos";
import type { Bridge, User } from "../../core/types";

export class HttpAdminRepo implements AdminRepo {
  // ── Users ───────────────────────────────────────────────────────

  async listUsers(): Promise<User[]> {
    const { data } = await apiClient.get<User[]>("/admin/users");
    return data;
  }

  async createUser(input: {
    username: string;
    password: string;
    role: string;
  }): Promise<User> {
    const { data } = await apiClient.post<User>("/admin/users", input);
    return data;
  }

  async updateUser(
    id: number,
    input: { username?: string; role?: string },
  ): Promise<User> {
    const { data } = await apiClient.patch<User>(
      `/admin/users/${id}`,
      input,
    );
    return data;
  }

  async deleteUser(id: number): Promise<void> {
    await apiClient.delete(`/admin/users/${id}`);
  }

  // ── Equivalences ────────────────────────────────────────────────

  async listEquivalences(): Promise<unknown[]> {
    const { data } = await apiClient.get("/admin/equivalences");
    return data;
  }

  async createEquivalence(input: {
    from: string;
    to: string;
  }): Promise<unknown> {
    const { data } = await apiClient.post(
      "/admin/equivalences",
      input,
    );
    return data;
  }

  async updateEquivalence(
    id: number,
    input: { from?: string; to?: string },
  ): Promise<unknown> {
    const { data } = await apiClient.patch(
      `/admin/equivalences/${id}`,
      input,
    );
    return data;
  }

  async deleteEquivalence(id: number): Promise<void> {
    await apiClient.delete(`/admin/equivalences/${id}`);
  }

  // ── Bridges (RPi serial gateways) ──────────────────────────────

  async listBridges(): Promise<Bridge[]> {
    const { data } = await apiClient.get<Bridge[]>("/admin/bridges");
    return data;
  }

  async createBridge(input: {
    ip_address: string;
    label?: string;
  }): Promise<Bridge> {
    const { data } = await apiClient.post<Bridge>(
      "/admin/bridges",
      input,
    );
    return data;
  }

  async updateBridge(
    id: number,
    input: { label?: string; authorized?: boolean },
  ): Promise<Bridge> {
    const { data } = await apiClient.patch<Bridge>(
      `/admin/bridges/${id}`,
      input,
    );
    return data;
  }

  async deleteBridge(id: number): Promise<void> {
    await apiClient.delete(`/admin/bridges/${id}`);
  }

  // ── Machine IPs ─────────────────────────────────────────────────

  async listMachineIps(): Promise<unknown[]> {
    const { data } = await apiClient.get("/admin/machine-ips");
    return data;
  }

  async createMachineIp(input: {
    machine_id: number;
    ip_address: string;
  }): Promise<unknown> {
    const { data } = await apiClient.post(
      "/admin/machine-ips",
      input,
    );
    return data;
  }

  async updateMachineIp(
    id: number,
    input: { ip_address: string },
  ): Promise<unknown> {
    const { data } = await apiClient.patch(
      `/admin/machine-ips/${id}`,
      input,
    );
    return data;
  }

  async deleteMachineIp(id: number): Promise<void> {
    await apiClient.delete(`/admin/machine-ips/${id}`);
  }

  // ── Therapy Comments ────────────────────────────────────────────

  async listComments(therapyId: number): Promise<unknown[]> {
    const { data } = await apiClient.get(
      `/admin/therapies/${therapyId}/comments`,
    );
    return data;
  }

  async createComment(
    therapyId: number,
    content: string,
  ): Promise<unknown> {
    const { data } = await apiClient.post(
      `/admin/therapies/${therapyId}/comments`,
      { content },
    );
    return data;
  }

  async deleteComment(commentId: number): Promise<void> {
    await apiClient.delete(`/admin/comments/${commentId}`);
  }

  // ── Export ──────────────────────────────────────────────────────

  async exportPatient(
    patientId: number,
    format: "csv" | "json",
  ): Promise<Blob> {
    const { data } = await apiClient.get(
      `/admin/export/patients/${patientId}`,
      {
        params: { format },
        responseType: "blob",
      },
    );
    return data;
  }

  async exportTherapy(
    therapyId: number,
    format: "csv" | "json",
  ): Promise<Blob> {
    const { data } = await apiClient.get(
      `/admin/export/therapies/${therapyId}`,
      {
        params: { format },
        responseType: "blob",
      },
    );
    return data;
  }

  // ── Config ──────────────────────────────────────────────────────

  async getConfig(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get("/admin/config");
    return data;
  }
}
