import apiClient from "../api-client";
import type { AuthRepo } from "../../core/repos";
import type { User, LoginRequest, LoginResponse } from "../../core/types";

export class HttpAuthRepo implements AuthRepo {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>(
      "/auth/login",
      credentials,
    );
    return data;
  }

  async validateToken(token: string): Promise<User> {
    const { data } = await apiClient.get<User>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }

  async generateToken(): Promise<string> {
    const { data } = await apiClient.post<{ token: string }>(
      "/auth/generate-token",
    );
    return data.token;
  }
}
