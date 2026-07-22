import type { User, LoginRequest, LoginResponse } from "../types";

export interface AuthRepo {
  login(credentials: LoginRequest): Promise<LoginResponse>;
  validateToken(token: string): Promise<User>;
  generateToken(): Promise<string>;
}
