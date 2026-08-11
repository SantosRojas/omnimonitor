import apiClient from "../api-client";
import type { ProfileRepo } from "../../core/repos";
import type { User } from "../../core/types";

export class HttpProfileRepo implements ProfileRepo {
  async getMe(): Promise<User> {
    const { data } = await apiClient.get<User>("/users/me");
    return data;
  }

  async updateMe(input: {
    username?: string;
    email?: string | null;
  }): Promise<User> {
    const { data } = await apiClient.patch<User>("/users/me", input);
    return data;
  }

  async changePassword(input: {
    current_password: string;
    new_password: string;
  }): Promise<{ message: string }> {
    const { data } = await apiClient.put<{ message: string }>(
      "/users/me/password",
      input,
    );
    return data;
  }
}
