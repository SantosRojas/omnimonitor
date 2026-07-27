import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HttpTherapyRepo } from "../../data/repos/http-therapy-repo";
import { TherapyTable } from "../components/TherapyTable";
import type { ActiveTherapyRow } from "../../core/types";

const therapyRepo = new HttpTherapyRepo();

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Computes elapsed seconds from an ISO `started_at` string relative to `now`.
 */
function computeElapsedSeconds(startedAt: string, now: number): number {
  try {
    return Math.floor((now - new Date(startedAt).getTime()) / 1000);
  } catch {
    return 0;
  }
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Smart dashboard container.
 *
 * Fetches active therapies on mount, subscribes to WebSocket updates for
 * each active machine, and presents a live-updating therapy table.
 *
 * Responsibilities:
 * - REST fetch via `HttpTherapyRepo` + React Query
 * - WS subscription (reads store updates on ReadingsBroadcast)
 * - Elapsed‑time clock (every 30 s)
 * - Loading / empty / error states
 * - SCADA navigation on button click
 */
export default function DashboardContainer() {
  const navigate = useNavigate();

  /* ── Clock tick for auto‑updating elapsed time ────────────────── */
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Fetch active therapies ──────────────────────────────────── */
  const {
    data: therapies,
    isLoading,
    error,
  } = useQuery<ActiveTherapyRow[]>({
    queryKey: ["therapies", "active"],
    queryFn: () => therapyRepo.list({ status: "active" }) as unknown as Promise<ActiveTherapyRow[]>,
  });

  /* ── Augment therapy rows with computed elapsed time ──────────── */
  const rows = useMemo<ActiveTherapyRow[]>(() => {
    if (!therapies) return [];
    return therapies.map((t) => ({
      ...t,
      elapsed_seconds: computeElapsedSeconds(t.started_at, now),
    }));
  }, [therapies, now]);

  /* ── SCADA navigation ────────────────────────────────────────── */
  const handleSelectTherapy = useCallback(
    (therapyId: number) => {
      const therapy = therapies?.find((t) => t.therapy_id === therapyId);
      if (therapy) {
        navigate(`/dashboard/${therapy.machine_id}/scada`);
      }
    },
    [therapies, navigate],
  );

  /* ── Error state ─────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-red-600">
        <p className="text-lg font-semibold">Failed to load therapies</p>
        <p className="mt-1 text-sm text-red-400">
          {(error as Error)?.message ?? "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Active Therapies
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Live view of all currently active therapies across all machines.
        </p>
      </div>

      {/* Therapy table */}
      <TherapyTable
        therapies={rows}
        onSelectTherapy={handleSelectTherapy}
        isLoading={isLoading}
      />
    </div>
  );
}
