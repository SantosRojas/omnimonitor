import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";

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
 * provided via props. The password field has a show/hide toggle; all colors
 * follow the app theme via `dark:` variants.
 */
export function LoginForm({
  onSubmit,
  isLoading,
  errorMessage,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || isLoading) return;
    onSubmit(username.trim(), password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          OMNI PDMS
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("login.subtitle")}
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div>
        <label
          htmlFor="login-username"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
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
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-accent dark:focus:ring-accent"
          placeholder={t("login.usernamePlaceholder")}
        />
      </div>

      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {t("login.password")}
        </label>
        <div className="relative mt-1">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 pr-10 text-sm text-neutral-900 shadow-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-accent dark:focus:ring-accent"
            placeholder={t("login.passwordPlaceholder")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? t("login.hidePassword") : t("login.showPassword")
            }
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-accent dark:text-neutral-950 dark:hover:bg-[#22d9ff] dark:focus:ring-accent/60 dark:focus:ring-offset-neutral-900"
      >
        {isLoading ? t("login.signingIn") : t("login.submit")}
      </button>
    </form>
  );
}
