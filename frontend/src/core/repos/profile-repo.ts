import type { User } from "../types";

export interface ProfileRepo {
  getMe(): Promise<User>;
  updateMe(data: { username?: string; email?: string | null }): Promise<User>;
  changePassword(data: {
    current_password: string;
    new_password: string;
  }): Promise<{ message: string }>;
}
