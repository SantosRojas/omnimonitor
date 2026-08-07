import { useTranslation } from "react-i18next";
import type { TherapyStatus } from "../../core/types";

interface StatusBadgeProps {
  /** The current therapy status. */
  status: TherapyStatus | string;
  /** Badge size variant. */
  size?: "sm" | "md";
}

/**
 * Colour map keyed by status value.
 *
 * | Status      | Colour |
 * |-------------|--------|
 * | active      | green  |
 * | completed   | gray   |
 * | cancelled   | red    |
 * | paused      | yellow |
 * | (fallback)  | gray   |
 */
const colourClasses: Record<string, string> = {
  active:
    "bg-green-100 text-green-800 ring-green-600/20",
  completed:
    "bg-gray-100 text-gray-600 ring-gray-500/20",
  cancelled:
    "bg-red-100 text-red-700 ring-red-600/20",
  paused:
    "bg-yellow-100 text-yellow-800 ring-yellow-600/20",
  pending:
    "bg-yellow-100 text-yellow-800 ring-yellow-600/20",
};

function badgeColour(status: string): string {
  return colourClasses[status] ?? colourClasses["completed"]!;
}

/**
 * Presentational status badge.
 *
 * Renders a small coloured pill that visually conveys the therapy status.
 * The label resolves through the catalog (`status.{value}`); unknown values
 * fall back to the raw status string (design D5).
 */
export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const { t } = useTranslation();
  const colour = badgeColour(status);

  const sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-xs"
    : "px-2.5 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${colour} ${sizeClasses}`}
    >
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}
