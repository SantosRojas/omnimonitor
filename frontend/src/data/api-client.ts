import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiError } from "../core/types";

/**
 * Token getter — set by the auth store on app init to avoid circular imports.
 * The Axios interceptor calls this on each request to attach the Authorization header.
 */
let _tokenGetter: (() => string | null) | null = null;

/**
 * Sets the token getter function used by the Axios interceptor.
 * Called once during app bootstrap (usually from main.tsx after store hydration).
 */
export function setTokenGetter(getter: () => string | null): void {
  _tokenGetter = getter;
}

/**
 * 401 handler — set by the auth store to clear credentials and redirect.
 */
let _onUnauthorized: (() => void) | null = null;

/**
 * Sets the handler invoked when the API responds with a 401 status.
 */
export function setOnUnauthorized(handler: () => void): void {
  _onUnauthorized = handler;
}

/**
 * Shared Axios instance pre-configured with the API base URL and JSON defaults.
 *
 * - **Request interceptor**: reads the current JWT via `_tokenGetter` and
 *   attaches it as `Authorization: Bearer <token>`.
 * - **Response interceptor**: on 401 clears auth state and redirects to `/login`.
 * - **Error normalisation**: extracts the server error message into a typed
 *   `ApiError` shape.
 */
const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

/* ── Request interceptor: attach JWT ──────────────────────────── */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = _tokenGetter?.() ?? null;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* ── Response interceptor: handle 401 ─────────────────────────── */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      _onUnauthorized?.();
    }

    // Normalise the error payload so callers always get a consistent shape.
    const apiError: ApiError = error.response?.data ?? {
      error: error.message ?? "Network error",
    };
    if (error.response?.status) {
      apiError.status_code = error.response.status;
    }

    return Promise.reject(apiError);
  },
);

export default apiClient;
