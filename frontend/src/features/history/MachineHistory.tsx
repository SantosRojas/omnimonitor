import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent } from "../../ui/primitives/card";
import { Input } from "../../ui/primitives/input";
import { Button } from "../../ui/primitives/button";
import { Badge } from "../../ui/primitives/badge";
const therapyRepo = new HttpTherapyRepo();
const PAGE_SIZE = 10;

const statusVariant: Record<string, "default" | "success" | "secondary" | "warning" | "danger"> = {
  completed: "success",
  active: "default",
  cancelled: "secondary",
  error: "danger",
};

export default function MachineHistory() {
  const { machineId } = useParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const { data: therapies, isLoading } = useQuery({
    queryKey: ["therapies", "history", machineId],
    queryFn: () => therapyRepo.list({ machine_id: machineId ? Number(machineId) : undefined }),
    enabled: !!machineId,
  });

  const filtered = useMemo(() => {
    let list = (therapies ?? []) as any[];
    if (search) {
      list = list.filter((t) =>
        t.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.status?.toLowerCase().includes(search.toLowerCase()),
      );
    }
    if (typeFilter) {
      list = list.filter((t) => t.therapy_type === typeFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter((t) => new Date(t.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      list = list.filter((t) => new Date(t.created_at).getTime() <= to);
    }
    return list;
  }, [therapies, search, typeFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const header = "Patient,Type,Start,End,Status";
    const rows = filtered.map((t: any) =>
      `"${t.patient_name ?? ""}","${t.therapy_type ?? ""}","${t.created_at ?? ""}","${t.ended_at ?? ""}","${t.status ?? ""}"`,
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `machine-${machineId}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const therapyTypes = useMemo(() => {
    const types = new Set((therapies ?? []).map((t: any) => t.therapy_type).filter(Boolean));
    return [...types] as string[];
  }, [therapies]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Therapy History"
        description={`Past therapies for machine ${machineId}`}
        actions={<Button size="sm" onClick={exportCsv}>Export CSV</Button>}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search by patient or status..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">All types</option>
          {therapyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-40" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-40" />
      </div>

      {isLoading ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">Loading...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-neutral-400">No therapies found</CardContent></Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Patient</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Start</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">End</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pageData.map((t: any) => (
                  <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3 font-medium">{t.patient_name ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-500">{t.therapy_type ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-500">{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-neutral-500">{t.ended_at ? new Date(t.ended_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant[t.status ?? ""] ?? "secondary"}>{t.status ?? "unknown"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>{filtered.length} total therapies</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
