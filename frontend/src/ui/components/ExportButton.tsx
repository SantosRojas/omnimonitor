import { useState, useRef, useEffect } from "react";

/* ── Public types ─────────────────────────────────────────────── */

export type ExportFormat = "csv" | "json";

export interface ExportButtonProps {
  /** Called when the user selects a format. */
  onExport: (format: ExportFormat) => void;
  /** Whether an export is currently being generated. */
  isLoading: boolean;
  /** Visible label on the trigger button. */
  label?: string;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Export dropdown button.
 *
 * Renders a button that opens a small dropdown with CSV and JSON export
 * options. The dropdown closes after selection or when clicking outside.
 */
export function ExportButton({
  onExport,
  isLoading,
  label = "Export",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleSelect(format: ExportFormat) {
    setOpen(false);
    onExport(format);
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isLoading}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {isLoading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {label}
          </>
        )}
      </button>

      {/* ── Dropdown ──────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => handleSelect("csv")}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export as CSV
          </button>
          <button
            type="button"
            onClick={() => handleSelect("json")}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export as JSON
          </button>
        </div>
      )}
    </div>
  );
}
