/** Human-friendly relative time for a timestamp: "just now", "5m ago", "2h ago", "3d ago". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSeconds < 60) return "just now";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Session duration as "1h 23m" or "42m". If no start, returns "—".
 * If no end is given, duration is computed from now.
 */
export function formatDuration(
  start: string | null | undefined,
  end?: string | null | undefined,
): string {
  if (!start) return "—";
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return "—";

  let endMs: number;
  if (end) {
    endMs = Date.parse(end);
    if (Number.isNaN(endMs)) return "—";
  } else {
    endMs = Date.now();
  }

  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
