"use client";

import { useEffect, useState } from "react";

import RotaDayView from "@/components/rota-day-view";
import RotaGrid from "@/components/rota-grid";
import StatusBanner from "@/components/status-banner";
import Toast from "@/components/toast";
import {
  ApiError,
  Period,
  RotaSummary,
  Shift,
  StaffManager,
  editAssignment,
  generateRota,
  getRota,
  listPeriods,
  listShifts,
  listStaff,
  publishRota,
} from "@/lib/api";
import { DAY_LABELS, formatWeekRange } from "@/lib/utils";

export default function RotaPage() {
  const [period, setPeriod] = useState<Period | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [summary, setSummary] = useState<RotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [periodsRes, shiftsRes, staffRes] = await Promise.all([
          listPeriods(),
          listShifts(),
          listStaff(),
        ]);
        if (cancelled) return;

        const current = periodsRes[0] ?? null;
        setPeriod(current);
        setShifts(shiftsRes);
        setStaff(staffRes);

        if (current) {
          const summaryRes = await getRota(current.id);
          if (cancelled) return;
          setSummary(summaryRes);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function handleGenerate() {
    if (!period) return;
    setGenerating(true);
    try {
      const result = await generateRota(period.id);
      setSummary(result);
      setPeriod((p) => (p ? { ...p, status: result.status } : p));
      showToast(
        result.warnings.length ? result.warnings[0] : "Rota generated",
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not generate rota");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd(dayIndex: number, shiftId: string, staffId: string) {
    if (!period) return;
    try {
      const result = await editAssignment(period.id, {
        staff_id: staffId,
        day_index: dayIndex,
        shift_id: shiftId,
        action: "add",
      });
      setSummary(result);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update rota");
    }
  }

  async function handleRemove(dayIndex: number, shiftId: string, staffId: string) {
    if (!period) return;
    try {
      const result = await editAssignment(period.id, {
        staff_id: staffId,
        day_index: dayIndex,
        shift_id: shiftId,
        action: "remove",
      });
      setSummary(result);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update rota");
    }
  }

  async function handlePublish() {
    if (!period) return;
    setPublishing(true);
    try {
      const result = await publishRota(period.id);
      setSummary(result);
      setPeriod((p) => (p ? { ...p, status: result.status } : p));
      showToast("Rota published! Staff can now view it.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not publish rota");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading the rota.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!period) {
    return (
      <div className="p-10 text-center text-sm text-ink-muted">
        No availability period exists yet — one is created automatically once onboarding finishes.
      </div>
    );
  }

  if (shifts.length === 0) {
    return <div className="p-10 text-center text-sm text-ink-muted">Add some shifts in Settings first.</div>;
  }

  const uncoveredByShift = new Map<string, number[]>();
  for (const u of summary?.uncovered ?? []) {
    const days = uncoveredByShift.get(u.shift_id) ?? [];
    days.push(u.day_index);
    uncoveredByShift.set(u.shift_id, days);
  }
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[26px] font-bold text-ink md:text-[28px]">Rota Builder</div>
          <div className="text-sm font-semibold text-ink-label">{formatWeekRange(period.week_start)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-[10px] border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-medium text-ink-muted disabled:opacity-60"
          >
            {generating ? "Generating…" : "Auto-fill"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || period.status === "published"}
            className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {period.status === "published" ? "Published" : publishing ? "Publishing…" : "Publish Rota"}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBanner status={period.status} />
        {summary && summary.conflicts > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-unavail-bg px-3.5 py-1.5 text-xs font-semibold text-unavail-text">
            <span className="h-1.5 w-1.5 rounded-full bg-unavail-border" />
            {summary.conflicts} conflict{summary.conflicts === 1 ? "" : "s"} — willing staff couldn&apos;t be
            scheduled
          </div>
        )}
      </div>

      {summary && summary.conflicts > 0 && (
        <div className="mb-5 rounded-panel border border-unavail-border bg-unavail-bg p-4">
          <div className="mb-2 text-[13px] font-semibold text-unavail-text">Uncovered shifts</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(uncoveredByShift.entries()).map(([shiftId, days]) => {
              const shift = shiftsById.get(shiftId);
              if (!shift) return null;
              return (
                <span
                  key={shiftId}
                  className="rounded-lg bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-unavail-text"
                >
                  {shift.name}: {days.map((d) => DAY_LABELS[d]).join(", ")}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="hidden md:block">
        <RotaGrid
          weekStart={period.week_start}
          shifts={shifts}
          staff={staff}
          assignments={summary?.assignments ?? []}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>
      <div className="md:hidden">
        <RotaDayView
          shifts={shifts}
          staff={staff}
          assignments={summary?.assignments ?? []}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>

      <Toast message={toast} />
    </div>
  );
}
