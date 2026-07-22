export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user_id: number;
  role: string;
}
