import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../layouts/AuthLayout";
import { LoginForm } from "../components/LoginForm";
import { HttpAuthRepo } from "../../data/repos/http-auth-repo";
import { useAuthStore } from "../../store/auth-store";
import type { UserRole } from "../../core/types";

const authRepo = new HttpAuthRepo();

/**
 * Smart login container.
 *
 * Orchestrates the login flow:
 * 1. Collects credentials via the presentational `LoginForm`.
 * 2. Calls `HttpAuthRepo.login()`.
 * 3. On success: persists token + user to the auth store and
 *    navigates to the role‑appropriate home page.
 * 4. On failure: passes the error back to the form for display.
 */
export function LoginContainer() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await authRepo.login({ username, password });

      // Map the login response to a partial User object.
      // A full User can be fetched via validateToken if needed.
      login(res.token, {
        id: res.user_id,
        username,
        role: res.role as UserRole,
        created_at: new Date().toISOString(),
      });

      // Role‑based redirect
      const home = res.role === "admin" ? "/admin" : "/dashboard";
      navigate(home, { replace: true });
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "error" in err
          ? (err as { error: string }).error
          : "Login failed. Please check your credentials.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <LoginForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        errorMessage={error}
      />
    </AuthLayout>
  );
}
