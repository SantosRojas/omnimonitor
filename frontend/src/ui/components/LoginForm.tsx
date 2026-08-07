import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

interface LoginFormProps {
  /** Called when the user submits the form with username + password. */
  onSubmit: (username: string, password: string) => void;
  /** Whether a login request is in flight. */
  isLoading: boolean;
  /** An optional error message to display above the form fields. */
  errorMessage: string | null;
}

/**
 * Presentational login form.
 *
 * Renders a Tailwind‑styled card with username / password inputs, a submit
 * button, and an error banner. No data dependencies — all behaviour is
 * provided via props.
 */
export function LoginForm({
  onSubmit,
  isLoading,
  errorMessage,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || isLoading) return;
    onSubmit(username.trim(), password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">OMNI PDMS</h1>
        <p className="mt-1 text-sm text-gray-500">{t("login.subtitle")}</p>
      </div>

      {errorMessage && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label
          htmlFor="login-username"
          className="block text-sm font-medium text-gray-700"
        >
          {t("login.username")}
        </label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={t("login.usernamePlaceholder")}
        />
      </div>

      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-gray-700"
        >
          {t("login.password")}
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={t("login.passwordPlaceholder")}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? t("login.signingIn") : t("login.submit")}
      </button>
    </form>
  );
}
