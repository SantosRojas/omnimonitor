import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import type { Table } from "@tanstack/react-table";

interface DataTableProps<T> {
  /** The TanStack table instance (created by the caller). */
  table: Table<T>;
  /** Show a 5-row loading skeleton instead of the table. */
  isLoading?: boolean;
  /** Message rendered in the empty state when there are no rows. */
  emptyMessage?: string;
  /**
   * Per-column responsive hiding. Receives a column id and returns the
   * Tailwind classes to apply (e.g. `"hidden md:table-cell"`), or `""`.
   */
  hideSm?: (columnId: string) => string;
}

/**
 * Reusable TanStack Table wrapper.
 *
 * Renders sortable headers, hover-highlighted rows, a loading skeleton and an
 * empty state. Callers own the `useReactTable(...)` wiring (columns, sorting,
 * row models) exactly like the monitor's `ActiveTherapiesTable`.
 */
export function DataTable<T>({
  table,
  isLoading = false,
  emptyMessage,
  hideSm,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
          />
        ))}
      </div>
    );
  }

  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 select-none cursor-pointer ${hideSm?.(h.id) ?? ""}`}
                >
                  <div className="flex items-center gap-1">
                    {h.column.columnDef.header as string}
                    {h.column.getIsSorted() && (
                      <span className="text-[10px]">
                        {h.column.getIsSorted() === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300 ${hideSm?.(cell.column.id) ?? ""}`}
                >
                  {cell.column.columnDef.cell
                    ? (cell.column.columnDef.cell as (ctx: unknown) => ReactNode)(
                        cell.getContext(),
                      )
                    : (cell.getValue() as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && emptyMessage && (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500">
          <Inbox className="mb-3 h-12 w-12" />
          <p className="text-sm font-medium">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
