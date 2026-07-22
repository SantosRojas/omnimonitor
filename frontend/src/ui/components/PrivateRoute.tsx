import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/auth-store";

/**
 * Decodes the payload portion of a JWT and returns the parsed object,
 * or `null` if the token is malformed or expired.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    // JWT payload is base64url‑encoded
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT is still valid by reading its `exp` claim.
 * Returns `true` when the token has no `exp` claim (assume valid).
 */
function isTokenValid(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp;
  if (typeof exp !== "number") return true; // no exp → assume valid
  return Date.now() < exp * 1000;
}

interface PrivateRouteProps {
  /**
   * Optional — if provided, the user's role MUST equal this value.
   * When omitted, any authenticated user is allowed.
   */
  requiredRole?: string;
}

/**
 * Route guard that wraps protected routes.
 *
 * - No token → redirect `/login`.
 * - Expired token → clear auth store, redirect `/login`.
 * - Wrong role → redirect to the appropriate home page.
 * - Valid → render the child routes via `<Outlet />`.
 */
export function PrivateRoute({ requiredRole }: PrivateRouteProps) {
  const { token, user, logout } = useAuthStore();

  // Not authenticated
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Token expired
  if (!isTokenValid(token)) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Role mismatch
  if (requiredRole && user.role !== requiredRole) {
    const destination = user.role === "admin" ? "/admin" : "/dashboard";
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
