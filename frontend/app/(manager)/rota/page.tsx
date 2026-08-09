"use client";

import { useEffect, useState } from "react";

import AvailabilityPanel from "@/components/availability-panel";
import ClaimsPanel from "@/components/claims-panel";
import LoadingScreen from "@/components/loading-screen";
import PublishPanel from "@/components/publish-panel";
import RotaDayView from "@/components/rota-day-view";
import RotaGrid, { RotaOrientation } from "@/components/rota-grid";
import RotaImageView from "@/components/rota-image-view";
import StatusBanner from "@/components/status-banner";
import SwapsPanel from "@/components/swaps-panel";
import Toast from "@/components/toast";
import {
  ApiError,
  Claim,
  EmailDelivery,
  Period,
  RotaSummary,
  Shift,
  StaffManager,
  SubmissionEntry,
  Swap,
  approveClaim,
  approveSwap,
  clearSubmission,
  createPeriod,
  editAssignment,
  copyPreviousRota,
  generateRota,
  getClaims,
  getPeriodSubmissions,
  getRota,
  getSwaps,
  getVenue,
  listPeriods,
  listShifts,
  listStaff,
  publishRota,
  rejectClaim,
  rejectSwap,
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
  const [submissions, setSubmissions] = useState<SubmissionEntry[]>([]);
  const [clearTarget, setClearTarget] = useState<{ staffId: string; staffName: string } | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimBusyId, setClaimBusyId] = useState<string | null>(null);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [claimRiskOpen, setClaimRiskOpen] = useState(false);
  const [claimRiskReason, setClaimRiskReason] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const [pendingApproveSwapId, setPendingApproveSwapId] = useState<string | null>(null);
  const [swapRiskOpen, setSwapRiskOpen] = useState(false);
  const [swapRiskReason, setSwapRiskReason] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>(WEEK_OPTIONS[0].weekStart);
  const [orientation, setOrientation] = useState<RotaOrientation>("staff-rows");
  const [loading, setLoading] = useState(true);
  const [rotaLoading, setRotaLoading] = useState(false);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<EmailDelivery | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [imageViewOpen, setImageViewOpen] = useState(false);
  const [venueName, setVenueName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingAdd, setPendingAdd] = useState<{
    dayIndex: number;
    shiftId: string;
    staffId: string;
  } | null>(null);
  const [addRiskOpen, setAddRiskOpen] = useState(false);
  const [addRiskReason, setAddRiskReason] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

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
        const [periodsRes, shiftsRes, staffRes, venueRes] = await Promise.all([
          listPeriods(),
          listShifts(),
          listStaff(),
          getVenue(),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes);
        setShifts(shiftsRes);
        setStaff(staffRes);
        setVenueName(venueRes.name);

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
        setSubmissions([]);
        setClaims([]);
        setSwaps([]);
        return;
      }
      setRotaLoading(true);
      try {
        const [rotaRes, subsRes, claimsRes, swapsRes] = await Promise.all([
          getRota(period.id),
          getPeriodSubmissions(period.id),
          getClaims(period.id),
          getSwaps(period.id),
        ]);
        if (cancelled) return;
        setSummary(rotaRes);
        setSubmissions(subsRes.submissions);
        setClaims(claimsRes.claims);
        setSwaps(swapsRes.swaps);
      } catch {
        if (!cancelled) {
          setSummary(null);
          setSubmissions([]);
          setClaims([]);
          setSwaps([]);
        }
      } finally {
        if (!cancelled) setRotaLoading(false);
      }
    }
    loadRota();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.id]);

  function requestClearSubmission(staffId: string, staffName: string) {
    setClearTarget({ staffId, staffName });
  }

  async function confirmClearSubmission() {
    if (!period || !clearTarget) return;
    const { staffId } = clearTarget;
    setClearingId(staffId);
    try {
      const result = await clearSubmission(period.id, staffId);
      setSummary(result);
      setSubmissions((prev) => prev.filter((s) => s.staff_id !== staffId));
      setClearTarget(null);
      showToast("Availability submission cleared");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not clear submission");
    } finally {
      setClearingId(null);
    }
  }

  async function submitApproveClaim(assignmentId: string, confirm: boolean) {
    if (!period) return;
    setClaimBusyId(assignmentId);
    try {
      const result = await approveClaim(period.id, assignmentId, confirm);
      if (result.status === "needs_confirm") {
        setPendingApproveId(assignmentId);
        setClaimRiskReason(result.reason ?? null);
        setClaimRiskOpen(true);
        return;
      }
      if (result.summary) setSummary(result.summary);
      setClaims(result.claims);
      setClaimRiskOpen(false);
      setPendingApproveId(null);
      showToast("Claim approved");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not approve claim");
    } finally {
      setClaimBusyId(null);
    }
  }

  function handleApproveClaim(assignmentId: string) {
    submitApproveClaim(assignmentId, false);
  }

  function handleConfirmApproveClaim() {
    if (!pendingApproveId) return;
    submitApproveClaim(pendingApproveId, true);
  }

  async function handleRejectClaim(assignmentId: string) {
    if (!period) return;
    setClaimBusyId(assignmentId);
    try {
      const result = await rejectClaim(period.id, assignmentId);
      if (result.summary) setSummary(result.summary);
      setClaims(result.claims);
      showToast("Claim rejected — shift stays open in the pool");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reject claim");
    } finally {
      setClaimBusyId(null);
    }
  }

  async function submitApproveSwap(swapId: string, confirm: boolean) {
    if (!period) return;
    setSwapBusyId(swapId);
    try {
      const result = await approveSwap(period.id, swapId, confirm);
      if (result.status === "needs_confirm") {
        setPendingApproveSwapId(swapId);
        setSwapRiskReason(result.reason ?? null);
        setSwapRiskOpen(true);
        return;
      }
      if (result.summary) setSummary(result.summary);
      setSwaps(result.swaps);
      setSwapRiskOpen(false);
      setPendingApproveSwapId(null);
      showToast("Swap approved");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not approve swap");
    } finally {
      setSwapBusyId(null);
    }
  }

  function handleApproveSwap(swapId: string) {
    submitApproveSwap(swapId, false);
  }

  function handleConfirmApproveSwap() {
    if (!pendingApproveSwapId) return;
    submitApproveSwap(pendingApproveSwapId, true);
  }

  async function handleRejectSwap(swapId: string) {
    if (!period) return;
    setSwapBusyId(swapId);
    try {
      const result = await rejectSwap(period.id, swapId);
      if (result.summary) setSummary(result.summary);
      setSwaps(result.swaps);
      showToast("Swap rejected — both shifts stay with their original owners");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reject swap");
    } finally {
      setSwapBusyId(null);
    }
  }

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

  async function handleCopyPrevious() {
    const p = await ensurePeriod();
    if (!p) return;
    setCopying(true);
    try {
      const result = await copyPreviousRota(p.id);
      setSummary(result);
      setPeriods((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: result.status } : x)));
      showToast(result.warnings.length ? result.warnings[0] : "Copied last week's rota");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not copy the previous rota");
    } finally {
      setCopying(false);
    }
  }

  async function submitAdd(dayIndex: number, shiftId: string, staffId: string, confirm: boolean) {
    const p = await ensurePeriod();
    if (!p) return;
    setAddSaving(true);
    try {
      const result = await editAssignment(p.id, {
        staff_id: staffId,
        day_index: dayIndex,
        shift_id: shiftId,
        action: "add",
        confirm,
      });
      if (result.status === "needs_confirm") {
        setPendingAdd({ dayIndex, shiftId, staffId });
        setAddRiskReason(result.reason ?? null);
        setAddRiskOpen(true);
        return;
      }
      if (result.summary) setSummary(result.summary);
      setAddRiskOpen(false);
      setPendingAdd(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update rota");
    } finally {
      setAddSaving(false);
    }
  }

  async function handleAdd(dayIndex: number, shiftId: string, staffId: string) {
    submitAdd(dayIndex, shiftId, staffId, false);
  }

  function handleConfirmAdd() {
    if (!pendingAdd) return;
    submitAdd(pendingAdd.dayIndex, pendingAdd.shiftId, pendingAdd.staffId, true);
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
      if (result.summary) setSummary(result.summary);
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
      // Persist the delivery outcome so email failures are never silent — a
      // transient toast alone hid the fact that no staff emails were going out.
      setPublishResult(result.email ?? { sent: 0, failed: 0, skipped_no_email: 0, errors: [] });
      // Open the options panel so the manager can download/share the rota.
      setPanelOpen(true);
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
  // Under-covered: below the shift's min_staff (but not empty). Grouped as
  // "Day (2/3)" so the manager sees how short each slot is.
  const underCoveredByShift = new Map<string, { day: number; assigned: number; required: number }[]>();
  for (const u of summary?.under_covered ?? []) {
    const list = underCoveredByShift.get(u.shift_id) ?? [];
    list.push({ day: u.day_index, assigned: u.assigned, required: u.required });
    underCoveredByShift.set(u.shift_id, list);
  }
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[26px] font-bold text-ink md:text-[28px]">Rota Builder</div>
        <div className="flex flex-wrap items-center gap-2.5">
          {(summary?.assignments.length ?? 0) === 0 && (
            <button
              onClick={handleCopyPrevious}
              disabled={copying}
              className="rounded-[10px] border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-medium text-ink-muted disabled:opacity-60"
            >
              {copying ? "Copying…" : "Copy last week"}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-[10px] border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-medium text-ink-muted disabled:opacity-60"
          >
            {generating ? "Generating…" : "Auto-fill"}
          </button>
          {period?.status === "published" || period?.status === "confirmed" ? (
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Share / Export
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing || !period}
              className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish Rota"}
            </button>
          )}
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
            {summary.conflicts} coverage conflict{summary.conflicts === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {publishResult && (
        <div
          className={`mb-5 rounded-panel border p-4 ${
            publishResult.failed > 0
              ? "border-unavail-border bg-unavail-bg"
              : "border-hairline bg-surface-card"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={`text-[13px] font-semibold ${
                  publishResult.failed > 0 ? "text-unavail-text" : "text-ink-label"
                }`}
              >
                Rota published.{" "}
                {publishResult.sent > 0 && `${publishResult.sent} staff emailed. `}
                {publishResult.failed > 0 && `${publishResult.failed} email${publishResult.failed === 1 ? "" : "s"} failed. `}
                {publishResult.skipped_no_email > 0 &&
                  `${publishResult.skipped_no_email} ${publishResult.skipped_no_email === 1 ? "has" : "have"} no email on file.`}
              </div>
              {publishResult.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-unavail-text">
                  {publishResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setPublishResult(null)}
              className="shrink-0 text-[13px] text-ink-faint hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!period && (
        <div className="mb-5 rounded-panel border border-hairline bg-surface-card p-4 text-[13px] text-ink-muted">
          No rota started for this week yet. Hit <span className="font-semibold text-ink-label">Auto-fill</span> to
          open it and generate from whatever availability has come in.
        </div>
      )}

      {summary && uncoveredByShift.size > 0 && (
        <div className="mb-5 rounded-panel border border-unavail-border bg-unavail-bg p-4">
          <div className="mb-1 text-[13px] font-semibold text-unavail-text">Uncovered shifts</div>
          <div className="mb-2 text-[12px] text-unavail-text">
            Willing staff couldn&apos;t be scheduled — nobody assigned.
          </div>
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

      {summary && underCoveredByShift.size > 0 && (
        <div className="mb-5 rounded-panel border border-warn-dot bg-warn-bg p-4">
          <div className="mb-1 text-[13px] font-semibold text-warn-text">Under-staffed shifts</div>
          <div className="mb-2 text-[12px] text-warn-text">
            Below the minimum staffing you set — not enough available staff to reach it.
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(underCoveredByShift.entries()).map(([shiftId, slots]) => {
              const shift = shiftsById.get(shiftId);
              if (!shift) return null;
              return (
                <span
                  key={shiftId}
                  className="rounded-lg bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-warn-text"
                >
                  {shift.name}:{" "}
                  {slots
                    .map((s) => `${DAY_LABELS[s.day]} (${s.assigned}/${s.required})`)
                    .join(", ")}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {summary && summary.warnings.length > 0 && (
        <div className="mb-5 rounded-panel border border-unavail-border bg-unavail-bg p-4">
          <div className="mb-1 text-[13px] font-semibold text-unavail-text">Under-18 availability not usable</div>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-unavail-text">
            {summary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {summary && summary.info.length > 0 && (
        <div className="mb-5 rounded-panel border border-hairline bg-surface-card p-4">
          <div className="mb-1 text-[13px] font-semibold text-ink-label">Notes</div>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-ink-faint">
            {summary.info.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <ClaimsPanel
        claims={claims}
        shifts={shifts}
        busyId={claimBusyId}
        onApprove={handleApproveClaim}
        onReject={handleRejectClaim}
      />

      <SwapsPanel
        swaps={swaps}
        shifts={shifts}
        busyId={swapBusyId}
        onApprove={handleApproveSwap}
        onReject={handleRejectSwap}
      />

      {period && (
        <AvailabilityPanel
          shifts={shifts}
          submissions={submissions}
          clearingId={clearingId}
          onRequestClear={requestClearSubmission}
        />
      )}

      {/* Axis toggle — desktop grid only (mobile uses the day view) */}
      <div className="mb-3 hidden items-center gap-2 md:flex">
        <span className="text-[12px] font-medium text-ink-faint">Layout</span>
        <div className="inline-flex rounded-[10px] border border-hairline bg-surface-card p-0.5">
          {(
            [
              { value: "staff-rows", label: "Staff × Days" },
              { value: "day-rows", label: "Days × Staff" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOrientation(opt.value)}
              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition ${
                orientation === opt.value ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={rotaLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
        <div className="hidden md:block">
          <RotaGrid
            weekStart={selectedWeek}
            shifts={shifts}
            staff={staff}
            assignments={summary?.assignments ?? []}
            orientation={orientation}
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

      <PublishPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        periodId={period?.id ?? null}
        orientation={orientation}
        weekLabel={formatWeekRange(selectedWeek)}
        publishResult={publishResult}
        onViewImage={() => setImageViewOpen(true)}
      />

      <RotaImageView
        open={imageViewOpen}
        onClose={() => setImageViewOpen(false)}
        venueName={venueName}
        weekStart={selectedWeek}
        status={period?.status ?? "collecting"}
        orientation={orientation}
        shifts={shifts}
        staff={staff}
        assignments={summary?.assignments ?? []}
      />

      {/* Risk popup: adult rule flagged by a manual add (rest gap / day-off-in-7) */}
      {addRiskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-warn-dot bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">This assignment breaks a rest rule</div>
            <div className="mb-4 text-sm text-ink-muted">
              {addRiskReason ?? "This assignment falls short of the venue's rest requirements."} Assign
              anyway only if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setAddRiskOpen(false);
                  setPendingAdd(null);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={addSaving}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {addSaving ? "Saving…" : "Assign anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk popup: adult rule flagged by approving a shift claim */}
      {claimRiskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-warn-dot bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">This claim breaks a rest rule</div>
            <div className="mb-4 text-sm text-ink-muted">
              {claimRiskReason ?? "This reassignment falls short of the venue's rest requirements."} Approve
              anyway only if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setClaimRiskOpen(false);
                  setPendingApproveId(null);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproveClaim}
                disabled={claimBusyId !== null}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {claimBusyId ? "Saving…" : "Approve anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk popup: adult rule flagged by approving a shift swap */}
      {swapRiskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-warn-dot bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">This swap breaks a rest rule</div>
            <div className="mb-4 text-sm text-ink-muted">
              {swapRiskReason ?? "One side of this swap falls short of the venue's rules."} Approve anyway only
              if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setSwapRiskOpen(false);
                  setPendingApproveSwapId(null);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApproveSwap}
                disabled={swapBusyId !== null}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {swapBusyId ? "Saving…" : "Approve anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm popup: clearing a staff member's whole submission for this period */}
      {clearTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-unavail-border bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">Clear this submission?</div>
            <div className="mb-4 text-sm text-ink-muted">
              This removes all of <span className="font-semibold text-ink-label">{clearTarget.staffName}</span>
              &apos;s submitted availability for this week. They&apos;ll need to resubmit — this can&apos;t be
              undone.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setClearTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearSubmission}
                disabled={clearingId !== null}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {clearingId ? "Clearing…" : "Clear submission"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
