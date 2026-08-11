import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  type PaginationState,
} from "@tanstack/react-table";
import {
  Inbox,
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
  /** Optional custom renderer, receives the full row object. */
  render?: (item: T) => ReactNode;
  /** Whether this column is sortable by clicking the header (default true). */
  sortable?: boolean;
  /** CSS class applied to both th and td for this column. */
  className?: string;
  /** Hide on narrow viewports (adds `hidden md:table-cell`). */
  hideSm?: boolean;
}

export interface DataTableProps<T> {
  /** Column definitions. */
  columns: Column<T>[];
  /** The rows to display. */
  data: T[];
  /** Stable key per row. */
  keyExtractor: (item: T) => string | number;
  /** Show loading skeleton (default false). */
  isLoading?: boolean;
  /** Message in empty state. */
  emptyMessage?: string;
  /** Optional icon shown above the empty message (default lucide Inbox). */
  emptyIcon?: ReactNode;
  /** Optional hint line shown under the empty message. */
  emptyHint?: string;
  /** Rows per page. When provided (>=1) pagination controls render below (default: no pagination). */
  pageSize?: number;
  /** Options for the rows-per-page selector (default [10, 25, 50, 100]). Only rendered when pageSize is set. */
  pageSizeOptions?: number[];
  /** Called whenever pageIndex/pageSize changes (useful for callers that show a range text). */
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  /** Columns that show a text filter input in the header (default: none). */
  filterableColumns?: string[];
  /** Renders the Edit action button (text "common.edit", accent style) at the right end. */
  onEdit?: (row: T) => void;
  /** Renders the Delete action button (text "common.delete", red style) at the right end. */
  onDelete?: (row: T) => void;
}

/* ── Helper types ─────────────────────────────────────────────── */

/** The per-column data stashed on `columnDef.meta`. */
interface TableMeta {
  className?: string;
  hideSm?: boolean;
}

function readMeta(def: { meta?: unknown } | undefined): TableMeta | undefined {
  return def?.meta as TableMeta | undefined;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Universal, declarative data table.
 *
 * Wraps TanStack Table to provide sortable headers, optional per-column text
 * filters, client-side pagination, loading skeletons, an empty state and
 * optional Edit/Delete action buttons — all with the project's design-system
 * styling. Callers only supply columns + data.
 */
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage,
  emptyIcon,
  emptyHint,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPaginationChange,
  filterableColumns,
  onEdit,
  onDelete,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: typeof pageSize === "number" && pageSize >= 1 ? pageSize : 10,
  });

  const hasPagination = typeof pageSize === "number" && pageSize >= 1;
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
        enableSorting: col.sortable ?? true,
        enableColumnFilter: filterableSet.has(col.key),
        cell: ({ row: r }) => {
          const item = r.original;
          if (col.render) return col.render(item);
          const val = (item as Record<string, unknown>)[col.key];
          return val != null ? String(val) : "—";
        },
        meta: { className: col.className, hideSm: col.hideSm },
      })),
    [columns, filterableSet],
  );

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: {
      sorting,
      columnFilters,
      ...(hasPagination ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    ...(hasPagination ? { onPaginationChange: setPagination } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(hasPagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  useEffect(() => {
    if (hasPagination) {
      onPaginationChange?.(pagination.pageIndex, pagination.pageSize);
    }
  }, [pagination.pageIndex, pagination.pageSize, hasPagination, onPaginationChange]);

  const rows = table.getRowModel().rows;
  const totalFilteredRows = table.getFilteredRowModel().rows.length;

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
    <div className={hasPagination ? "space-y-4" : undefined}>
      {/* ── Table ──────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-neutral-200 dark:border-neutral-800"
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const canFilter = header.column.getCanFilter();
                  const filterValue = (header.column.getFilterValue() ??
                    "") as string;
                  const meta = readMeta(header.column.columnDef);
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider",
                        sorted
                          ? "text-accent"
                          : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
                        canSort && "cursor-pointer select-none",
                        meta?.className,
                        meta?.hideSm && "hidden md:table-cell",
                      )}
                    >
                      {/* Sort header */}
                      <div
                        className="flex items-center gap-1"
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ArrowUp
                              className={cn("h-3.5 w-3.5", "text-accent")}
                            />
                          ) : sorted === "desc" ? (
                            <ArrowDown
                              className={cn("h-3.5 w-3.5", "text-accent")}
                            />
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
                            className="flex h-7 w-full rounded border border-neutral-300 bg-white px-1.5 pl-6 text-xs shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 dark:border-neutral-600 dark:bg-neutral-800 dark:placeholder:text-neutral-500"
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
                  className="px-4 py-12 text-center text-neutral-400 dark:text-neutral-500"
                >
                  {emptyIcon ?? (
                    <Inbox className="mb-3 mx-auto h-12 w-12" />
                  )}
                  <p className="text-sm font-medium text-neutral-400">
                    {emptyMessage ?? t("common.noRecords")}
                  </p>
                  {emptyHint && (
                    <p className="mt-1 text-xs text-neutral-400">{emptyHint}</p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={keyExtractor(row.original)}
                  className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-accent/5 dark:border-neutral-800 dark:hover:bg-accent/10"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = readMeta(cell.column.columnDef);
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "whitespace-nowrap px-4 py-3 text-neutral-700 dark:text-neutral-300",
                          meta?.className,
                          meta?.hideSm && "hidden md:table-cell",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                  {hasActions && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row.original)}
                            className="rounded px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/60 transition-colors"
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
      {hasPagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("common.records", { count: totalFilteredRows })}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-500">
              {t("history.rowsPerPage")}
            </label>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
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
      )}
    </div>
  );
}