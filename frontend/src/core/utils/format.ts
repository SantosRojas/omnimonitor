import { i18n } from "../../i18n";

/**
 * Formats an ISO timestamp as a full locale-aware date/time string using the
 * active i18n language. Returns "—" for null/undefined/invalid input.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(i18n.language);
}

/** Formats an ISO timestamp as a locale-aware date (no time). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(i18n.language);
}

/** Formats an ISO timestamp as a locale-aware time (no date). */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(i18n.language);
}
