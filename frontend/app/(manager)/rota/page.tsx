"use client";

import { useEffect, useState } from "react";

import LoadingScreen from "@/components/loading-screen";
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
  createPeriod,
  editAssignment,
  generateRota,
  getRota,
  listPeriods,
  listShifts,
  listStaff,
  publishRota,
} from "@/lib/api";
import { DAY_LABELS, formatWeekRange } from "@/lib/utils";

// This week's Monday (offset 0) and the following weeks, as YYYY-MM-DD.
function mondayISO(offsetWeeks: number): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEK_OPTIONS = [
  { weekStart: mondayISO(0), label: "This week" },
  { weekStart: mondayISO(1), label: "Next week" },
  { weekStart: mondayISO(2), label: "In 2 weeks" },
];

export default function RotaPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [summary, setSummary] = useState<RotaSummary | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>(WEEK_OPTIONS[0].weekStart);
  const [loading, setLoading] = useState(true);
  const [rotaLoading, setRotaLoading] = useState(false);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const period = periods.find((p) => p.week_start === selectedWeek) ?? null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Initial load: periods, shifts, staff. Default the switcher to the newest
  // period's week if it's one of the options, else this week.
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
        setPeriods(periodsRes);
        setShifts(shiftsRes);
        setStaff(staffRes);

        const newest = periodsRes[0];
        if (newest && WEEK_OPTIONS.some((w) => w.weekStart === newest.week_start)) {
          setSelectedWeek(newest.week_start);
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

  // Load the rota whenever the selected week's period changes.
  useEffect(() => {
    let cancelled = false;
    async function loadRota() {
      if (!period) {
        setSummary(null);
        return;
      }
      setRotaLoading(true);
      try {
        const res = await getRota(period.id);
        if (!cancelled) setSummary(res);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setRotaLoading(false);
      }
    }
    loadRota();
    return () => {
      cancelled = true;
    };
  }, [period?.id]);

  async function ensurePeriod(): Promise<Period | null> {
    if (period) return period;
    try {
      const created = await createPeriod(selectedWeek);
      setPeriods((prev) => [created, ...prev.filter((p) => p.week_start !== created.week_start)]);
      return created;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not open this week");
      return null;
    }
  }

  async function handleGenerate() {
    const p = await ensurePeriod();
    if (!p) return;
    setGenerating(true);
    try {
      const result = await generateRota(p.id);
      setSummary(result);
      setPeriods((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: result.status } : x)));
      showToast(result.warnings.length ? result.warnings[0] : "Rota generated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not generate rota");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd(dayIndex: number, shiftId: string, staffId: string) {
    const p = await ensurePeriod();
    if (!p) return;
    try {
      const result = await editAssignment(p.id, {
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
      setPeriods((prev) => prev.map((x) => (x.id === period.id ? { ...x, status: result.status } : x)));
      showToast("Rota published! Staff can now view it.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not publish rota");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <LoadingScreen base="Loading the rota…" />;
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[26px] font-bold text-ink md:text-[28px]">Rota Builder</div>
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
            disabled={publishing || !period || period.status === "published"}
            className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {period?.status === "published" ? "Published" : publishing ? "Publishing…" : "Publish Rota"}
          </button>
        </div>
      </div>

      {/* Week switcher — plan up to 2 weeks ahead */}
      <div className="mb-5 inline-flex rounded-[12px] border border-hairline bg-surface-card p-1">
        {WEEK_OPTIONS.map((opt) => {
          const active = opt.weekStart === selectedWeek;
          return (
            <button
              key={opt.weekStart}
              onClick={() => setSelectedWeek(opt.weekStart)}
              className={`rounded-[9px] px-3.5 py-2 text-[13px] font-semibold transition ${
                active ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 hidden font-normal sm:inline ${active ? "text-white/70" : "text-ink-faint"}`}>
                {formatWeekRange(opt.weekStart)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold text-ink-label">{formatWeekRange(selectedWeek)}</div>
        {period ? (
          <StatusBanner status={period.status} />
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-unset-bg px-3.5 py-1.5 text-xs font-semibold text-ink-muted">
            Not started
          </span>
        )}
        {summary && summary.conflicts > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-unavail-bg px-3.5 py-1.5 text-xs font-semibold text-unavail-text">
            <span className="h-1.5 w-1.5 rounded-full bg-unavail-border" />
            {summary.conflicts} conflict{summary.conflicts === 1 ? "" : "s"} — willing staff couldn&apos;t be
            scheduled
          </div>
        )}
      </div>

      {!period && (
        <div className="mb-5 rounded-panel border border-hairline bg-surface-card p-4 text-[13px] text-ink-muted">
          No rota started for this week yet. Hit <span className="font-semibold text-ink-label">Auto-fill</span> to
          open it and generate from whatever availability has come in.
        </div>
      )}

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

      <div className={rotaLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
        <div className="hidden md:block">
          <RotaGrid
            weekStart={selectedWeek}
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
      </div>

      <Toast message={toast} />
    </div>
  );
}
