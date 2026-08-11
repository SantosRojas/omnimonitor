/* ── Public types ─────────────────────────────────────────────── */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog heading text. */
  title: string;
  /** Dialog body / description text. */
  message: string;
  /** Optional extra content rendered between the message and the actions. */
  children?: ReactNode;
  /** Called when the user confirms the action. */
  onConfirm: () => void;
  /** Called when the user dismisses the dialog. */
  onCancel: () => void;
  /** Whether the confirm action is in flight. */
  isLoading?: boolean;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Accessible confirmation dialog with modal overlay.
 *
 * Renders a TailwindCSS-styled modal overlay with a title, message, and
 * Cancel / Confirm buttons. Uses `role="dialog"` and `aria-modal` for
 * accessibility. Clicking the backdrop also calls `onCancel`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  children,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900 dark:text-neutral-100">
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">{message}</p>

        {children}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isLoading ? t("common.deleting") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
