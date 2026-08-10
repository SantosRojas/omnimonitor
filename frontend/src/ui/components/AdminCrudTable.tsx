import { useState, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
} from "lucide-react";
import { cn } from "../primitives";

/* ── Public types ─────────────────────────────────────────────── */

export interface Column<T> {
  /** Key used to look up the value on the row object. */
  key: string;
  /** Column header text. */
  label: string;
  /**
   * Optional custom renderer for this column.
   * Receives the full row object.
   */
  render?: (item: T) => ReactNode;
  /** Whether this column can be sorted by clicking the header. */
  sortable?: boolean;
  /** CSS class for the header / cells. */
  className?: string;
}

export interface TableProps<T> {
  /** Column definitions. */
  columns: Column<T>[];
  /** The rows to display. */
  data: T[];
  /** Function to extract a stable key from each row. */
  keyExtractor: (item: T) => string | number;
  /** Rows per page (default 10). */
  pageSize?: number;
  /** Columns that should show a text filter input. */
  filterableColumns?: string[];
  /** When `true`, a loading state is shown. */
  isLoading: boolean;
  /** Called when the user clicks the Edit action. */
  onEdit?: (row: T) => void;
  /** Called when the user clicks the Delete action. */
  onDelete?: (row: T) => void;
  /** Message shown when data is empty (and not loading). */
  emptyMessage?: string;
}

/* ── Component ────────────────────────────────────────────────── */

export function Table<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  filterableColumns,
  isLoading = false,
  onEdit,
  onDelete,
  emptyMessage,
}: TableProps<T>) {
  const { t } = useTranslation();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const hasActions = onEdit !== undefined || onDelete !== undefined;

  const filterableSet = useMemo(
    () => new Set(filterableColumns),
    [filterableColumns],
  );

  const columnDefs: ColumnDef<T>[] = useMemo(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.label,
        accessorFn: (row: T) => (row as Record<string, unknown>)[col.key],
        enableSorting: col.sortable ?? false,
        enableColumnFilter: filterableSet.has(col.key),
        cell: ({ row: r }) => {
          const item = r.original;
          if (col.render) return col.render(item);
          const val = (item as Record<string, unknown>)[col.key];
          return val != null ? String(val) : "—";
        },
        meta: { className: col.className },
      })),
    [columns, filterableSet],
  );

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;
  const totalRows = table.getFilteredRowModel().rows.length;

  /* ── Loading skeleton ─────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Table ──────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-neutral-200 dark:border-neutral-800">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const canFilter = header.column.getCanFilter();
                  const filterValue = (header.column.getFilterValue() ??
                    "") as string;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500",
                        canSort &&
                          "cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300",
                        (header.column.columnDef.meta as Record<string, unknown> | undefined)
                          ?.className as string,
                      )}
                    >
                      {/* Sort header */}
                      <div
                        className="flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                          ))}
                      </div>

                      {/* Column filter */}
                      {canFilter && (
                        <div
                          className="relative mt-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
                          <input
                            placeholder={t("common.filter")}
                            value={filterValue}
                            onChange={(e) => {
                              header.column.setFilterValue(e.target.value);
                              table.setPageIndex(0);
                            }}
                            className="flex h-7 w-full rounded border border-neutral-300 bg-white px-1.5 pl-6 text-xs shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:placeholder:text-neutral-500"
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
                {hasActions && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    {t("common.actions")}
                  </th>
                )}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-neutral-400"
                >
                  {emptyMessage ?? t("common.noRecords")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={keyExtractor(row.original)}
                  className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "whitespace-nowrap px-4 py-3 text-neutral-700 dark:text-neutral-300",
                        (cell.column.columnDef.meta as Record<string, unknown> | undefined)
                          ?.className as string,
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row.original)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors dark:text-blue-400 dark:hover:bg-blue-950"
                          >
                            {t("common.edit")}
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(row.original)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors dark:text-red-400 dark:hover:bg-red-950"
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t("common.records", { count: totalRows })}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {table.getState().pagination.pageIndex + 1} /{" "}
            {table.getPageCount()}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
