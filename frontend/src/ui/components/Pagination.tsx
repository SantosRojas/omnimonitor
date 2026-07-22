/* ── Public types ─────────────────────────────────────────────── */

export interface PaginationProps {
  /** The current active page (1-indexed). */
  currentPage: number;
  /** Total number of pages. */
  totalPages: number;
  /** Called when the user clicks a specific page number. */
  onPageChange: (page: number) => void;
}

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Returns a compact array of page numbers to display, with `null` in
 * positions where an ellipsis should appear.
 *
 * Strategy: always show first, last, current, and immediate neighbours
 * of current.
 */
function buildPageWindow(
  current: number,
  total: number,
): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | null)[] = [1];

  if (current > 3) pages.push(null); // ellipsis after first

  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }

  if (current < total - 2) pages.push(null); // ellipsis before last

  if (total > 1) pages.push(total);

  return pages;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Compact, responsive pagination control.
 *
 * Renders Previous / Next buttons plus a windowed set of page-number
 * buttons. Ellipsis indicators (`…`) separate discontinuous ranges.
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageWindow(currentPage, totalPages);

  const btnBase =
    "rounded border border-gray-300 px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed";
  const btnActive = "bg-blue-600 text-white border-blue-600";
  const btnInactive =
    "bg-white text-gray-700 hover:bg-gray-50";

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Pagination"
    >
      {/* Previous */}
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className={btnBase}
      >
        Previous
      </button>

      {/* Page numbers */}
      {pages.map((p, idx) =>
        p === null ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-2 text-xs text-gray-400"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${
              p === currentPage ? btnActive : btnInactive
            }`}
          >
            {p}
          </button>
        ),
      )}

      {/* Next */}
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className={btnBase}
      >
        Next
      </button>
    </nav>
  );
}
