"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AvailabilityPanel from "@/components/availability-panel";
import LoadingScreen from "@/components/loading-screen";
import ApprovalsRow from "@/components/manager/approvals-row";
import CoverageSummary, { type CoverageSlot } from "@/components/manager/coverage-summary";
import GenerateOverlay from "@/components/manager/generate-overlay";
import ManagerIcon from "@/components/manager/icon";
import ManagerRotaMatrix from "@/components/manager/rota-matrix";
import ManagerRotaReview from "@/components/manager/rota-review";
import RotaMoreSheet from "@/components/manager/rota-more-sheet";
import RotaRiskModal from "@/components/manager/rota-risk-modal";
import U18LegalBlock from "@/components/manager/u18-legal-block";
import PublishPanel from "@/components/publish-panel";
import { RotaOrientation } from "@/components/rota-grid";
import RotaImageView from "@/components/rota-image-view";
import StatusBanner, { STATUS_CONFIG } from "@/components/status-banner";
import Toast from "@/components/toast";
import {
  ApiError,
  AssignmentOut,
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
  cancelOpenShift,
  clearSubmission,
  createPeriod,
  editAssignment,
  copyPreviousRota,
  fetchRotaExport,
  generateRota,
  getClaims,
  getPeriodSubmissions,
  getRota,
  getSwaps,
  getVenue,
  listPeriods,
  listShifts,
  listStaff,
  postOpenShift,
  publishRota,
  rejectClaim,
  rejectSwap,
} from "@/lib/api";
import { STAFF_ROLES } from "@/lib/constants";
import { formatWeekRange } from "@/lib/utils";

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
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const [pendingApproveSwapId, setPendingApproveSwapId] = useState<string | null>(null);
  // One unified risk modal for the three confirm paths (add / claim / swap).
  const [risk, setRisk] = useState<{ kind: "add" | "claim" | "swap"; reason: string | null } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>(WEEK_OPTIONS[0].weekStart);
  const [orientation, setOrientation] = useState<RotaOrientation>("staff-rows");
  const [view, setView] = useState<"review" | "matrix">("review");
  const [reviewDay, setReviewDay] = useState(0);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [exportingFmt, setExportingFmt] = useState<"pdf" | "xlsx" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotaLoading, setRotaLoading] = useState(false);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genOverlayOpen, setGenOverlayOpen] = useState(false);
  const [genResult, setGenResult] = useState<RotaSummary | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [postingKey, setPostingKey] = useState<string | null>(null);
  const [postingRole, setPostingRole] = useState("");
  const [posting, setPosting] = useState(false);
  const [cancelingOpenId, setCancelingOpenId] = useState<string | null>(null);
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
        setRisk({ kind: "claim", reason: result.reason ?? null });
        return;
      }
      if (result.summary) setSummary(result.summary);
      setClaims(result.claims);
      setRisk(null);
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
        setRisk({ kind: "swap", reason: result.reason ?? null });
        return;
      }
      if (result.summary) setSummary(result.summary);
      setSwaps(result.swaps);
      setRisk(null);
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
    // Open the animated overlay first, then run the solver. The overlay shows a
    // stepped solving animation while `genResult`/`genError` are null, then the
    // honest result (filled / gaps / gap reasons) when the request resolves.
    setGenResult(null);
    setGenError(null);
    setGenOverlayOpen(true);
    setGenerating(true);
    try {
      const result = await generateRota(p.id);
      setSummary(result);
      setPeriods((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: result.status } : x)));
      setGenResult(result);
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Could not generate rota. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  const router = useRouter();

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

  function openPostPicker(shiftId: string, dayIndex: number) {
    setPostingKey(`${shiftId}:${dayIndex}`);
    setPostingRole("");
  }

  async function handlePostOpen(dayIndex: number, shiftId: string) {
    const p = await ensurePeriod();
    if (!p) return;
    setPosting(true);
    try {
      const result = await postOpenShift(p.id, dayIndex, shiftId, postingRole || null);
      setSummary(result);
      setPostingKey(null);
      showToast("Posted as an open shift");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not post this shift");
    } finally {
      setPosting(false);
    }
  }

  async function handleCancelOpen(assignmentId: string) {
    if (!period) return;
    setCancelingOpenId(assignmentId);
    try {
      const result = await cancelOpenShift(period.id, assignmentId);
      setSummary(result);
      showToast("Open shift withdrawn");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not withdraw this open shift");
    } finally {
      setCancelingOpenId(null);
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
        setRisk({ kind: "add", reason: result.reason ?? null });
        return;
      }
      if (result.summary) setSummary(result.summary);
      setRisk(null);
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

  function cancelRisk() {
    setRisk(null);
    setPendingAdd(null);
    setPendingApproveId(null);
    setPendingApproveSwapId(null);
  }

  function confirmRisk() {
    if (!risk) return;
    if (risk.kind === "add") handleConfirmAdd();
    else if (risk.kind === "claim") handleConfirmApproveClaim();
    else handleConfirmApproveSwap();
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

  async function handleExport(fmt: "pdf" | "xlsx") {
    if (!period) return;
    setExportingFmt(fmt);
    try {
      const { blob, filename } = await fetchRotaExport(period.id, fmt, orientation);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMoreOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not export the rota");
    } finally {
      setExportingFmt(null);
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
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-accent-on"
        >
          Try again
        </button>
      </div>
    );
  }

  if (shifts.length === 0) {
    return <div className="p-10 text-center text-sm text-ink-muted">Add some shifts in Settings first.</div>;
  }

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  // Manager-posted open shifts (no owner yet) — keyed by shift+day so a gap slot
  // can show "already posted" instead of the post control once one exists.
  const openPostsByKey = new Map<string, AssignmentOut>();
  for (const a of summary?.assignments ?? []) {
    if (!a.staff_id && a.shift_id) {
      openPostsByKey.set(`${a.shift_id}:${a.day_index}`, a);
    }
  }

  // The single source of truth for the coverage line, publish gate and sticky
  // bar: the solver's own uncovered (nobody) + under-covered (short of minimum)
  // slots. One problem slot = one "gap".
  const coverageSlots: CoverageSlot[] = [];
  for (const u of summary?.uncovered ?? []) {
    const shift = shiftsById.get(u.shift_id);
    coverageSlots.push({
      key: `unc-${u.shift_id}-${u.day_index}`,
      shiftName: shift?.name ?? "Shift",
      dayIndex: u.day_index,
      assigned: 0,
      required: shift?.min_staff ?? 1,
      severity: "uncovered",
    });
  }
  for (const u of summary?.under_covered ?? []) {
    const shift = shiftsById.get(u.shift_id);
    coverageSlots.push({
      key: `und-${u.shift_id}-${u.day_index}`,
      shiftName: shift?.name ?? "Shift",
      dayIndex: u.day_index,
      assigned: u.assigned,
      required: u.required,
      severity: "short",
    });
  }
  coverageSlots.sort((a, b) => a.dayIndex - b.dayIndex || a.shiftName.localeCompare(b.shiftName));
  const gapSlots = coverageSlots.length;

  const hasAssignments = (summary?.assignments.filter((a) => a.staff_id).length ?? 0) > 0;
  const isLive = period?.status === "published" || period?.status === "confirmed";
  const statusLabel = period ? (STATUS_CONFIG[period.status]?.label ?? period.status) : "Not started";

  function renderOpenSlotControl(shiftId: string, dayIndex: number) {
    const key = `${shiftId}:${dayIndex}`;
    const posted = openPostsByKey.get(key);
    if (posted) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-2.5 py-1.5">
          <span className="text-[12px] font-medium text-ink-muted">
            Posted{posted.required_role ? ` — needs ${posted.required_role}` : " — any role"}
          </span>
          <button
            onClick={() => handleCancelOpen(posted.id)}
            disabled={cancelingOpenId === posted.id}
            className="text-[12px] font-semibold text-unavail-text disabled:opacity-60"
          >
            {cancelingOpenId === posted.id ? "…" : "Withdraw"}
          </button>
        </div>
      );
    }
    if (postingKey === key) {
      return (
        <div className="flex items-center gap-1.5 rounded-lg bg-surface-subtle px-2 py-1.5">
          <select
            value={postingRole}
            onChange={(e) => setPostingRole(e.target.value)}
            className="rounded-md border border-hairline bg-surface-card px-1.5 py-1 text-[12px] outline-none"
          >
            <option value="">Any role</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={() => handlePostOpen(dayIndex, shiftId)}
            disabled={posting}
            className="rounded-md bg-accent px-2 py-1 text-[12px] font-semibold text-accent-on disabled:opacity-60"
          >
            {posting ? "…" : "Post"}
          </button>
          <button onClick={() => setPostingKey(null)} className="text-[12px] text-ink-faint">
            ✕
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => openPostPicker(shiftId, dayIndex)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-accent"
      >
        <ManagerIcon name="plus" size={13} /> Post as open
      </button>
    );
  }

  return (
    <div className="animate-fadeIn px-4 pb-28 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[23px] font-medium tracking-[-0.5px] text-ink">Rota</div>
        {/* Auto-fill / Copy stay prominent only on an empty week; on a built
            week they move behind More (B5). */}
        {period && !hasAssignments && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPrevious}
              disabled={copying}
              className="cp-hairline rounded-[9px] bg-surface-card px-3 py-2 text-[12px] font-medium text-ink-muted disabled:opacity-60"
            >
              {copying ? "Copying…" : "Copy last week"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-[9px] bg-accent px-3 py-2 text-[12px] font-medium text-accent-on disabled:opacity-60"
            >
              {generating ? "Generating…" : "Auto-fill"}
            </button>
          </div>
        )}
      </div>

      {/* Week switcher — plan up to 2 weeks ahead */}
      <div className="scrollbar-none mb-4 flex gap-1">
        {WEEK_OPTIONS.map((opt) => {
          const active = opt.weekStart === selectedWeek;
          return (
            <button
              key={opt.weekStart}
              onClick={() => setSelectedWeek(opt.weekStart)}
              className={`whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12px] font-medium transition ${
                active ? "bg-accent text-white" : "cp-hairline bg-surface-card text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-[13px] font-medium text-ink-label">
          {venueName ? `${venueName} · ` : ""}
          {formatWeekRange(selectedWeek)}
        </div>
        {period ? (
          <StatusBanner status={period.status} />
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-subtle px-3 py-1 text-[11px] font-medium text-ink-muted">
            Not started
          </span>
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

      {!period && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mb-5 w-full rounded-[11px] bg-accent px-4 py-3 text-[13px] font-medium text-accent-on disabled:opacity-60"
        >
          {generating ? "Generating…" : "Auto-fill this week"}
        </button>
      )}

      {/* Approvals action-row — someone is waiting on you (B2) */}
      {period && (
        <ApprovalsRow
          claims={claims}
          swaps={swaps}
          shifts={shifts}
          claimBusyId={claimBusyId}
          swapBusyId={swapBusyId}
          onApproveClaim={handleApproveClaim}
          onRejectClaim={handleRejectClaim}
          onApproveSwap={handleApproveSwap}
          onRejectSwap={handleRejectSwap}
        />
      )}

      {/* One honest coverage line (B1) — replaces the three stacked cards */}
      {period && summary && <CoverageSummary slots={coverageSlots} />}

      {/* Under-18 legal block, its own distinct treatment (B4) */}
      {period && summary && <U18LegalBlock warnings={summary.warnings} />}

      {period && view === "matrix" && (
        <button
          onClick={() => setView("review")}
          className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-accent"
        >
          <ManagerIcon name="arrow-left" size={14} /> Back to day view
        </button>
      )}

      {period && (
        <div className={rotaLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
          {view === "review" ? (
            <ManagerRotaReview
              weekStart={selectedWeek}
              shifts={shifts}
              staff={staff}
              assignments={summary?.assignments ?? []}
              leave={summary?.leave ?? {}}
              selectedDay={reviewDay}
              onSelectDay={setReviewDay}
              onAdd={handleAdd}
              onRemove={handleRemove}
              renderGapActions={renderOpenSlotControl}
            />
          ) : (
            <ManagerRotaMatrix
              weekStart={selectedWeek}
              shifts={shifts}
              staff={staff}
              assignments={summary?.assignments ?? []}
              leave={summary?.leave ?? {}}
              orientation={orientation}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          )}
        </div>
      )}

      {/* Secondary bar: the whole-week grid is a demoted secondary, tools behind More */}
      {period && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {view === "review" && (
            <button
              onClick={() => setView("matrix")}
              className="cp-hairline flex items-center gap-1.5 rounded-[9px] bg-surface-card px-3 py-2 text-[12px] font-medium text-ink-muted"
            >
              <ManagerIcon name="table" size={14} /> See the whole week
            </button>
          )}
          <button
            onClick={() => setMoreOpen(true)}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-medium text-ink-faint"
          >
            More <ManagerIcon name="dots" size={16} />
          </button>
        </div>
      )}

      {/* Demoted panels — revealed on demand from the More sheet (B5) */}
      {period && showAvailability && (
        <div className="mt-4">
          <AvailabilityPanel
            shifts={shifts}
            submissions={submissions}
            clearingId={clearingId}
            onRequestClear={requestClearSubmission}
          />
        </div>
      )}

      {period && showNotes && summary && summary.info.length > 0 && (
        <div className="mt-4 rounded-panel border border-hairline bg-surface-card p-4">
          <div className="mb-1 text-[13px] font-semibold text-ink-label">Solver notes</div>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-ink-faint">
            {summary.info.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

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
        leave={summary?.leave ?? {}}
      />

      <RotaMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onExport={handleExport}
        exportingFmt={exportingFmt}
        onViewImage={() => setImageViewOpen(true)}
        onRegenerate={handleGenerate}
        generating={generating}
        onCopyPrevious={handleCopyPrevious}
        copying={copying}
        canCopy={!hasAssignments}
        orientation={orientation}
        onToggleOrientation={() =>
          setOrientation((o) => (o === "staff-rows" ? "day-rows" : "staff-rows"))
        }
        onToggleAvailability={() => setShowAvailability((v) => !v)}
        availabilityOpen={showAvailability}
        onToggleNotes={() => setShowNotes((v) => !v)}
        notesOpen={showNotes}
        notesCount={summary?.info.length ?? 0}
      />

      {/* One unified risk modal — names the rule that fired (B7) */}
      <RotaRiskModal
        open={risk !== null}
        kind={risk?.kind ?? "add"}
        reason={risk?.reason ?? null}
        busy={
          risk?.kind === "add"
            ? addSaving
            : risk?.kind === "claim"
              ? claimBusyId !== null
              : swapBusyId !== null
        }
        onCancel={cancelRisk}
        onConfirm={confirmRisk}
      />

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

      {/* Publish confirm: never silently publish an incomplete rota */}
      {publishConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] cp-hairline rounded-card bg-surface-card p-6">
            <div className="mb-2 text-lg font-medium text-ink">
              Publish with {gapSlots} gap{gapSlots === 1 ? "" : "s"}?
            </div>
            <div className="mb-4 text-sm text-ink-muted">
              {gapSlots} shift{gapSlots === 1 ? " is" : "s are"} still unfilled. You can publish now and
              fill {gapSlots === 1 ? "it" : "them"} later, but staff will see an incomplete rota.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setPublishConfirmOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPublishConfirmOpen(false);
                  handlePublish();
                }}
                disabled={publishing}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-on disabled:opacity-60"
              >
                {publishing ? "Publishing…" : "Publish anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky publish bar */}
      {period && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-hairline bg-surface-card px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
              {gapSlots === 0 ? (
                <>
                  <ManagerIcon name="circle-check" size={14} className="text-cp-green" /> All shifts covered
                </>
              ) : (
                <>
                  <ManagerIcon name="alert-triangle" size={14} className="text-cp-amber" /> {gapSlots} gap
                  {gapSlots === 1 ? "" : "s"} to fill
                </>
              )}
            </div>
            <div className="mt-px truncate text-[11px] text-ink-muted">{statusLabel}</div>
          </div>
          {isLive ? (
            <button
              onClick={() => setPanelOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-on"
            >
              <ManagerIcon name="send" size={15} /> Share / Export
            </button>
          ) : (
            <button
              onClick={() => (gapSlots > 0 ? setPublishConfirmOpen(true) : handlePublish())}
              disabled={publishing}
              className="flex shrink-0 items-center gap-1.5 rounded-[11px] bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-50"
            >
              <ManagerIcon name="send" size={15} /> {publishing ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      )}

      <GenerateOverlay
        open={genOverlayOpen}
        result={genResult}
        error={genError}
        shifts={shifts}
        onAdjustRules={() => router.push("/scheduler")}
        onReviewRota={() => setGenOverlayOpen(false)}
        onClose={() => setGenOverlayOpen(false)}
      />

      <Toast message={toast} />
    </div>
  );
}
