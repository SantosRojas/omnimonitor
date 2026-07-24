import type { Bridge, User } from "../types";

export interface AdminRepo {
  // Users
  listUsers(): Promise<User[]>;
  createUser(data: { username: string; password: string; role: string }): Promise<User>;
  updateUser(id: number, data: { username?: string; role?: string }): Promise<User>;
  deleteUser(id: number): Promise<void>;

  // Equivalences
  listEquivalences(): Promise<unknown[]>;
  createEquivalence(data: { from: string; to: string }): Promise<unknown>;
  updateEquivalence(id: number, data: { from?: string; to?: string }): Promise<unknown>;
  deleteEquivalence(id: number): Promise<void>;

  // Bridges (RPi serial gateways)
  listBridges(): Promise<Bridge[]>;
  createBridge(data: { ip_address: string; label?: string }): Promise<Bridge>;
  updateBridge(id: number, data: { label?: string; authorized?: boolean }): Promise<Bridge>;
  deleteBridge(id: number): Promise<void>;

  // Machine IPs
  listMachineIps(): Promise<unknown[]>;
  createMachineIp(data: { machine_id: number; ip_address: string }): Promise<unknown>;
  updateMachineIp(id: number, data: { ip_address: string }): Promise<unknown>;
  deleteMachineIp(id: number): Promise<void>;

  // Therapy Comments
  listComments(therapyId: number): Promise<unknown[]>;
  createComment(therapyId: number, content: string): Promise<unknown>;
  deleteComment(commentId: number): Promise<void>;

  // Export
  exportPatient(patientId: number, format: "csv" | "json"): Promise<Blob>;
  exportTherapy(therapyId: number, format: "csv" | "json"): Promise<Blob>;

  // Config
  getConfig(): Promise<Record<string, unknown>>;
}
