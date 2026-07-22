import type { ReactNode } from "react";

/* ── Public types ─────────────────────────────────────────────── */

export interface Column<T> {
  /** Key used to look up the value on the row object. */
  key: string;
  /** Column header text. */
  label: string;
  /**
   * Optional custom renderer for this column.
   * Receives the raw value at `row[key]` plus the full row object.
   */
  render?: (value: unknown, row: T) => ReactNode;
  /** Whether this column header shows sort affordance (visual only). */
  sortable?: boolean;
}

export interface AdminCrudTableProps<T> {
  /** Column definitions. */
  columns: Column<T>[];
  /** The rows to display. */
  data: T[];
  /** When `true`, a loading skeleton replaces the table body. */
  isLoading: boolean;
  /** Called when the user clicks the Edit action. */
  onEdit?: (row: T) => void;
  /** Called when the user clicks the Delete action. */
  onDelete?: (row: T) => void;
  /** Message shown when `data` is an empty array (and not loading). */
  emptyMessage?: string;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Reusable admin CRUD table.
 *
 * Renders a TailwindCSS-styled table from a column definition array and a
 * data array. Supports optional Edit / Delete action columns, a loading
 * skeleton, and an empty state message.
 */
export function AdminCrudTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading,
  onEdit,
  onDelete,
  emptyMessage = "No records found.",
}: AdminCrudTableProps<T>) {
  /* ── Loading skeleton ─────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-gray-100"
          />
        ))}
      </div>
    );
  }

  /* ── Empty state ──────────────────────────────────────────────── */
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <svg
          className="mb-3 h-10 w-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  const hasActions = onEdit !== undefined || onDelete !== undefined;

  /* ── Table ───────────────────────────────────────────────────── */
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        {/* ── Header ────────────────────────────────────────────── */}
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                  col.sortable ? "cursor-pointer" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
            {hasActions && (
              <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Actions
              </th>
            )}
          </tr>
        </thead>

        {/* ── Body ──────────────────────────────────────────────── */}
        <tbody className="divide-y divide-gray-100 bg-white">
          {data.map((row, rowIdx) => (
            <tr
              key={(row.id as string | number) ?? rowIdx}
              className="hover:bg-gray-50/50 transition-colors"
            >
              {columns.map((col) => {
                const value = row[col.key];
                return (
                  <td
                    key={col.key}
                    className="whitespace-nowrap px-4 py-3 text-gray-700"
                  >
                    {col.render ? col.render(value, row) : String(value ?? "—")}
                  </td>
                );
              })}
              {hasActions && (
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="rounded px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
