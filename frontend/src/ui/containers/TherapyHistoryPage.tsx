import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type SortingState,
  type PaginationState,
} from "@tanstack/react-table";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../store/auth-store";
import { PageHeader } from "../layouts/PageHeader";
import { Card, CardContent } from "../primitives/card";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Badge } from "../primitives/badge";
import {
  BarChart3,
  Table2,
  MessageSquare,
  Download,
  Trash2,
  Send,
} from "lucide-react";
import { PRESSURE_SERIES, FLOW_SERIES, buildSignalDisplayMap, signalDisplayName } from "../../features/scada/signal-configs";
import { HistoryChart } from "../../features/history/HistoryChart";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { HttpSignalRepo } from "../../data/repos/http-signal-repo";
import type { Therapy, HistoryRow, TherapyComment } from "../../core/types";

const therapyRepo = new HttpTherapyRepo();
const signalRepo = new HttpSignalRepo();

const columnHelper = createColumnHelper<HistoryRow>();

const buildHistoryColumns = (signalDisplayMap: Record<string, string>) => [
  columnHelper.accessor("recorded_at", {
    header: "Time",
    cell: (i) => {
      const ts = i.getValue();
      return (
        <span className="text-neutral-500">
          {ts ? new Date(ts).toLocaleString() : "—"}
        </span>
      );
    },
  }),
  columnHelper.accessor("internal_name", {
    header: "Signal",
    cell: (i) => {
      const name = i.getValue();
      return (
        <span className="text-neutral-800 dark:text-neutral-200" title={name ?? undefined}>
          {name ? signalDisplayName(signalDisplayMap, name) : "—"}
        </span>
      );
    },
  }),
  columnHelper.accessor("value", {
    header: "Value",
    cell: (i) => (
      <span className="font-medium tabular-nums">
        {i.getValue()?.toFixed(2) ?? "—"}
      </span>
    ),
  }),
  columnHelper.accessor("unit", {
    header: "Unit",
    cell: (i) => <span className="text-neutral-500">{i.getValue() ?? "—"}</span>,
  }),
];

export default function TherapyHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const therapyId = Number(id);

  // ── Toggle state ───────────────────────────────────────────
  const [showCharts, setShowCharts] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [commentText, setCommentText] = useState("");

  // ── Filters ────────────────────────────────────────────────
  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // ── Therapy info ────────────────────────────────────────────
  const { data: therapy } = useQuery<Therapy>({
    queryKey: ["therapy", therapyId],
    queryFn: () => therapyRepo.get(therapyId),
    enabled: !isNaN(therapyId),
  });

  // ── History readings ────────────────────────────────────────
  const { data: historyRows = [], isLoading: historyLoading } = useQuery<HistoryRow[]>({
    queryKey: ["therapy-history", therapyId],
    queryFn: () => therapyRepo.getHistory(therapyId, 10000),
    enabled: !isNaN(therapyId),
  });

  // ── Comments ───────────────────────────────────────────────
  const { data: comments = [] } = useQuery<TherapyComment[]>({
    queryKey: ["therapy-comments", therapyId],
    queryFn: () => therapyRepo.getComments(therapyId),
    enabled: !isNaN(therapyId),
  });

  const addComment = useMutation({
    mutationFn: () => therapyRepo.createComment(therapyId, commentText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
      setCommentText("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: number) => therapyRepo.deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
    },
  });

  // ── Signal catalog for human-readable display names ─────────
  const { data: signals = [] } = useQuery({
    queryKey: ["signals"],
    queryFn: () => signalRepo.list(),
    staleTime: 60_000,
  });
  const signalDisplayMap = useMemo(() => buildSignalDisplayMap(signals), [signals]);
  const signalUnitMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of signals) {
      if (s.internal_name && s.unit) m[s.internal_name] = s.unit;
    }
    return m;
  }, [signals]);

  // ── Unique signal options for the filter dropdown ───────────
  const signalOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of historyRows) {
      if (r.internal_name) names.add(r.internal_name);
    }
    return [...names]
      .map((name) => ({ value: name, label: signalDisplayName(signalDisplayMap, name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [historyRows, signalDisplayMap]);

  // ── Pivot readings into chart data ─────────────────────────
  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();

    for (const r of historyRows) {
      if (!r.recorded_at || !r.internal_name) continue;

      // Group by minute (UTC key — only used for grouping/sorting).
      const minuteKey = r.recorded_at.slice(0, 16);
      // Display time in the viewer's local timezone (recorded_at is UTC ISO).
      const timeOnly = new Date(r.recorded_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      let point = map.get(minuteKey);
      if (!point) {
        point = { _time: minuteKey, timeOnly };
        map.set(minuteKey, point);
      }

      // Use internal_name as the series key
      point[r.internal_name] = r.value ?? 0;
    }

    return [...map.values()].sort((a, b) =>
      String(a._time).localeCompare(String(b._time)),
    );
  }, [historyRows]);

  // ── Filtered rows for table ────────────────────────────────
  const filteredRows = useMemo(() => {
    let list = historyRows;
    if (signalFilter !== "all") {
      list = list.filter((r) => r.internal_name === signalFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.internal_name?.toLowerCase().includes(q) ||
          r.unit?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [historyRows, signalFilter, search]);

  // ── TanStack table: sorting + client-side pagination ─────────
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const columns = useMemo(() => buildHistoryColumns(signalDisplayMap), [signalDisplayMap]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageStart = filteredRows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = Math.min((pageIndex + 1) * pageSize, filteredRows.length);

  // ── CSV export via existing backend endpoint ───────────────
  const handleExport = useCallback(() => {
    const url = `/api/export/readings?therapy_id=${therapyId}&format=csv`;
    window.open(url, "_blank");
  }, [therapyId]);

  // ── Loading ────────────────────────────────────────────────
  if (historyLoading && historyRows.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  const statusVariant: Record<string, "default" | "success" | "secondary" | "warning" | "danger"> = {
    completed: "success",
    active: "default",
    cancelled: "secondary",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title={`History #${id}`}
        description={
          therapy
            ? `${therapy.therapy_type ?? "Therapy"} · ${therapy.status ?? "—"}`
            : "Historical readings and charts"
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              &larr; Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComments((v) => !v)}
              className={showComments ? "" : "opacity-40"}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCharts((v) => !v)}
              className={showCharts ? "" : "opacity-40"}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTable((v) => !v)}
              className={showTable ? "" : "opacity-40"}
            >
              <Table2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        }
      />

      {/* Therapy summary */}
      {therapy && (
        <div className="flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <span>Type: <strong>{therapy.therapy_type ?? "—"}</strong></span>
          <span>Kit: <strong>{therapy.kit ?? "—"}</strong></span>
          <span>Weight: <strong>{therapy.weight != null ? `${therapy.weight} kg` : "—"}</strong></span>
          <span>End weight: <strong>{therapy.end_weight != null ? `${therapy.end_weight} kg` : "—"}</strong></span>
          <span>Status: <Badge variant={statusVariant[therapy.status ?? ""] ?? "secondary"}>{therapy.status ?? "—"}</Badge></span>
          <span>Start: <strong>{therapy.started_at ? new Date(therapy.started_at).toLocaleString() : "—"}</strong></span>
          <span>End: <strong>{therapy.ended_at ? new Date(therapy.ended_at).toLocaleString() : "—"}</strong></span>
          <span>Readings: <strong>{filteredRows.length}</strong></span>
        </div>
      )}

      {/* ── Comments ────────────────────────────────── */}
      {showComments && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" /> Comments ({comments.length})
            </h3>

            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-neutral-400">No comments</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800/50">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">
                        {c.username}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                        {(user?.role === "admin" || user?.id === c.user_id) && (
                          <button
                            onClick={() => deleteComment.mutate(c.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            {user?.role !== "viewer" && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentText.trim()) {
                      addComment.mutate();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={() => addComment.mutate()}
                  disabled={!commentText.trim() || addComment.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Charts ───────────────────────────────────── */}
      {showCharts && (
        <div className="grid gap-4 md:grid-cols-2">
          <HistoryChart
            title="Pressures"
            data={chartData}
            series={PRESSURE_SERIES}
            displayNameMap={signalDisplayMap}
            unitMap={signalUnitMap}
          />
          <HistoryChart
            title="Flows"
            data={chartData}
            series={FLOW_SERIES}
            displayNameMap={signalDisplayMap}
            unitMap={signalUnitMap}
          />
        </div>
      )}

      {/* ── Data table ───────────────────────────────── */}
      {showTable && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-neutral-500">Signal:</label>
                <select
                  value={signalFilter}
                  onChange={(e) => setSignalFilter(e.target.value)}
                  className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                >
                  <option value="all">All</option>
                  {signalOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 max-w-xs text-xs"
              />
              <span className="text-xs text-neutral-400">
                {filteredRows.length === 0
                  ? "0 of 0 readings"
                  : `${pageStart}–${pageEnd} of ${filteredRows.length} readings`}
              </span>
            </div>

            <DataTable table={table} emptyMessage="No readings found" />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-neutral-500">
                  Rows per page:
                </label>
                <select
                  value={pageSize}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                  className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                >
                  {[25, 50, 100, 250].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <Pagination
                currentPage={pageIndex + 1}
                totalPages={table.getPageCount()}
                onPageChange={(page) => table.setPageIndex(page - 1)}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
