import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../layouts/AuthLayout";
import { LoginForm } from "../components/LoginForm";
import { HttpAuthRepo } from "../../data/repos/http-auth-repo";
import { useAuthStore } from "../../store/auth-store";
import type { UserRole } from "../../core/types";

const authRepo = new HttpAuthRepo();

/**
 * Case-insensitive backend error substrings → catalog error keys (design D6).
 * The backend API is out of scope to change, so the mapping lives client-side
 * in the login flow; unknown messages pass through raw.
 */
const SERVER_ERROR_MAP: ReadonlyArray<readonly [needle: string, key: string]> = [
  ["invalid credentials", "invalidCredentials"],
  ["credenciales inválidas", "invalidCredentials"],
  ["therapy not found", "therapyNotFound"],
  ["terapia no encontrada", "therapyNotFound"],
  ["machine not found", "machineNotFound"],
  ["máquina no encontrada", "machineNotFound"],
  ["invalid status", "invalidStatus"],
  ["estado inválido", "invalidStatus"],
];

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
  const { t } = useTranslation();
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
        email: null,
        role: res.role as UserRole,
        created_at: new Date().toISOString(),
      });

      // Role‑based redirect
      const home = res.role === "admin" ? "/admin" : "/dashboard";
      navigate(home, { replace: true });
    } catch (err: unknown) {
      const raw =
        typeof err === "object" && err !== null && "error" in err
          ? String((err as { error: string }).error)
          : null;

      let msg: string;
      if (raw) {
        const matched = SERVER_ERROR_MAP.find(([needle]) =>
          raw.toLowerCase().includes(needle.toLowerCase()),
        );
        msg = matched ? t(`errors.${matched[1]}`) : raw;
      } else {
        msg = t("errors.loginFailed");
      }
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
