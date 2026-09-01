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
import RotaFrontDoor from "@/components/manager/rota-front-door";
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
  Role,
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
  listRoles,
  listShifts,
  listStaff,
  postOpenShift,
  publishRota,
  rejectClaim,
  rejectSwap,
  remindStaff,
  reopenAvailability,
  unpublishRota,
} from "@/lib/api";
import WeekScrubber, {
  ScrubberEdgeHint,
  buildWeekStops,
} from "@/components/manager/week-scrubber";
import {
  formatWeekRange,
  mondayISO,
  planningPeriod,
  todayIndexInWeek,
} from "@/lib/utils";
import Waiting from "@/components/waiting";

// The three This/Next/In-2-weeks pills are gone — see components/manager/
// week-scrubber.tsx. `mondayISO` moved to lib/utils so the scrubber, this
// page and Home all agree on which Monday "this week" is (and all resolve it
// through Europe/London rather than the device clock).

export default function RotaPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
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
  const [selectedWeek, setSelectedWeek] = useState<string>(mondayISO(0));
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
  // Only for the scrubber's left edge, and only as the fallback when a venue
  // has no periods at all — created_at is a timestamp, not a Monday.
  const [venueCreatedAt, setVenueCreatedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingAdd, setPendingAdd] = useState<{
    dayIndex: number;
    shiftId: string;
    staffId: string;
  } | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  // R3 — the chase state's own busy flags.
  const [settingUp, setSettingUp] = useState(false);
  const [remindingAll, setRemindingAll] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindedIds, setRemindedIds] = useState<string[]>([]);
  // R2 (iii) — rebuilding a live week has to pull it down from staff first.
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [reopening, setReopening] = useState(false);

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
        const [periodsRes, shiftsRes, staffRes, venueRes, rolesRes] = await Promise.all([
          listPeriods(),
          listShifts(),
          listStaff(),
          getVenue(),
          listRoles(),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes);
        setShifts(shiftsRes);
        setStaff(staffRes);
        setRoles(rolesRes);
        setVenueName(venueRes.name);
        setVenueCreatedAt(venueRes.created_at ?? null);

        // Land on the week the manager is actually being asked to build —
        // the same one Home's hero names, so following that button doesn't
        // drop them on a different week than the one they just read about.
        const plan = planningPeriod(periodsRes);
        if (plan) setSelectedWeek(plan.week_start);
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

  // Open the day view on today when the week being viewed is the current one,
  // and on Monday otherwise. A manager scrubbing to next week wants the start of
  // it; a manager on this week wants the day they're standing in.
  useEffect(() => {
    setReviewDay(todayIndexInWeek(selectedWeek) ?? 0);
  }, [selectedWeek]);

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
        // listStaff is re-fetched per period on purpose: `submitted` is only
        // populated when a period_id is passed, and the initial load can't know
        // one yet. Without this the readiness screen reads "0 of 7 in" on a week
        // where everybody has answered.
        const [rotaRes, subsRes, claimsRes, swapsRes, staffRes] = await Promise.all([
          getRota(period.id),
          getPeriodSubmissions(period.id),
          getClaims(period.id),
          getSwaps(period.id),
          listStaff(period.id),
        ]);
        if (cancelled) return;
        setSummary(rotaRes);
        setSubmissions(subsRes.submissions);
        setClaims(claimsRes.claims);
        setSwaps(swapsRes.swaps);
        setStaff(staffRes);
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

  async function handleGenerate(): Promise<boolean> {
    const p = await ensurePeriod();
    if (!p) return false;
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
      return true;
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Could not generate rota. Try again.");
      return false;
    } finally {
      setGenerating(false);
    }
  }

  async function handleSetUpWeek() {
    setSettingUp(true);
    try {
      const created = await ensurePeriod();
      if (created) {
        setPeriods((prev) => [created, ...prev.filter((x) => x.week_start !== created.week_start)]);
        showToast("Week opened — your team can send availability now");
      }
    } finally {
      setSettingUp(false);
    }
  }

  // A "closed" week whose solve found nothing to schedule stays closed forever —
  // run_solver_for_period early-returns without advancing the status. That is
  // exactly the quiet week a manager most needs to reopen and chase, and until
  // now there was no way back to "collecting" inside the app at all.
  async function handleReopen() {
    if (!period) return;
    setReopening(true);
    try {
      const after = await reopenAvailability(period.id);
      setSummary(after);
      setPeriods((prev) => prev.map((x) => (x.id === period.id ? { ...x, status: after.status } : x)));
      showToast("Availability reopened — your team can send their week again");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reopen availability");
    } finally {
      setReopening(false);
    }
  }

  async function handleRemindAll() {
    if (!period) return;
    setRemindingAll(true);
    try {
      const result = await remindStaff({ periodId: period.id });
      setRemindedIds(assignableStaff.filter((m) => !m.submitted).map((m) => m.id));
      showToast(
        result.reminded === 0
          ? "Everyone's already submitted"
          : result.email_sent
            ? `Reminded ${result.reminded} by email`
            : `Reminded ${result.reminded} — but no emails were delivered`,
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not send reminders");
    } finally {
      setRemindingAll(false);
    }
  }

  async function handleRemindOne(member: StaffManager) {
    setRemindingId(member.id);
    try {
      const result = await remindStaff({ staffId: member.id, periodId: period?.id });
      if (result.email_sent) setRemindedIds((prev) => [...prev, member.id]);
      showToast(
        result.email_sent
          ? `Reminder emailed to ${member.name.split(" ")[0]}`
          : member.email
            ? `Could not email ${member.name.split(" ")[0]} — check their email address`
            : `${member.name.split(" ")[0]} has no email on file — nothing sent`,
      );
    } catch {
      showToast("Could not send reminder");
    } finally {
      setRemindingId(null);
    }
  }

  // Rebuilding a published week is a real footgun: the solve deletes every
  // non-manual assignment and staff already have the current rota. The backend
  // refuses to generate over a live period at all, so this pulls it down first
  // — which also writes an activity_log row, so the trail shows the week came
  // down deliberately rather than a rota silently changing under people.
  async function handleRebuildLive() {
    if (!period) return;
    setRebuilding(true);
    try {
      const after = await unpublishRota(period.id);
      setSummary(after);
      setPeriods((prev) => prev.map((x) => (x.id === period.id ? { ...x, status: after.status } : x)));
      setRebuildConfirmOpen(false);
      const solved = await handleGenerate();
      if (!solved) {
        // The unpublish landed, so the week really is off the staff app now.
        // The generate overlay's own "couldn't generate" doesn't say that, and
        // it's the one thing the manager has to know — the state is recoverable,
        // but only if they realise they need to publish again.
        showToast("Rebuild failed — this week is now unpublished. Publish it again or retry.");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not unpublish this rota");
    } finally {
      setRebuilding(false);
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
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-on"
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

  // H1 — a hero that states status must state coverage too. Publishing with
  // gaps is allowed and sometimes right, so live is not the same as sorted:
  // the coverage line at the top of this very screen would otherwise stand in
  // flat contradiction to a hero claiming everyone has their shifts.
  const windowNote =
    period?.status === "confirmed"
      ? ""
      : " The availability window is still open, so this can still change.";
  const liveDetail =
    gapSlots > 0
      ? `${gapSlots} slot${gapSlots === 1 ? " still needs" : "s still need"} cover.${windowNote}`
      : period?.status === "confirmed"
        ? "Settled — everyone has their shifts for this week."
        : `Everyone's covered.${windowNote}`;
  const statusLabel = period ? (STATUS_CONFIG[period.status]?.label ?? period.status) : "Not started";

  // R1 — the scrubber's stops, and whether the week being viewed can still be
  // built. `create_period` (backend/routers/periods.py) refuses any week before
  // this Monday outright, so a past week is view-only by construction; every
  // control that routes through ensurePeriod is hidden rather than left to
  // surface a raw backend error string as UI copy.
  const weekStops = buildWeekStops(periods, venueCreatedAt);
  const selectedStop = weekStops.find((w) => w.weekStart === selectedWeek) ?? null;
  const isPastWeek = selectedStop?.isPast ?? false;

  // Approved, active staff — the roster the rota is actually built from. A
  // pending self-registrant can PIN in and submit availability but is never
  // schedulable, so counting them would make readiness read short forever.
  const assignableStaff = staff.filter((m) => m.is_active && !m.pending);

  // R2 — the entry state machine. Gate on state, never blanket: a manager who
  // taps back onto a week they published last Thursday and gets told to
  // "Generate" reads that as "your rota's gone".
  //   past      · read-only history, no controls that would 400 at the backend
  //   fresh     · the pre-generation front door (R3), not an empty grid
  //   draft     · the coverage-first day-view, immediately, no gate
  //   live      · the same body, read-first, Generate buried behind a confirm
  //
  // "fresh" is NOT simply "no assignments". A solve that placed nobody — which a
  // venue of mostly under-18s on late shifts really can produce — leaves the
  // period at "generated" with zero rows, and treating that as fresh sent the
  // manager back to the chase screen to email reminders pointing at an
  // availability link the backend had already closed (`editable` is
  // `status == "collecting"`). It also hid the coverage summary behind
  // `showsRota`, so the gaps the solve had just reported were invisible. A week
  // that has been solved shows its result, empty or not.
  //
  // Open posts count too: a week whose only remaining row is an unclaimed open
  // shift still needs its grid, or the Withdraw control it lives in is
  // unreachable while the post stays live in the staff claim pool.
  // `warnings` carries two different kinds of thing: under-18 notes, which are
  // hard legal blocks, and venue-level notices (a shift whose stored time won't
  // parse, staff skipped by copy-previous). Rendering the second kind under
  // "the law blocked these assignments · can't be overridden" is simply untrue,
  // and now that warnings arrive on every read rather than once after a solve,
  // an untrue one would sit there permanently. Classified on the marker the
  // solver itself writes — the same client-side classify the risk modal uses,
  // for the same reason: the strings are ours.
  const allWarnings = summary?.warnings ?? [];
  const legalWarnings = allWarnings.filter((w) => w.includes("(under 18)"));
  const otherWarnings = allWarnings.filter((w) => !w.includes("(under 18)"));

  const hasAnyRow = (summary?.assignments.length ?? 0) > 0;
  const wasSolved = period?.status === "generated";
  const entry: "past" | "fresh" | "draft" | "live" = isPastWeek
    ? "past"
    : isLive
      ? "live"
      : hasAssignments || hasAnyRow || wasSolved
        ? "draft"
        : "fresh";
  const showsRota = entry === "draft" || entry === "live" || (entry === "past" && hasAssignments);
  const canEdit = entry === "draft" || entry === "live";

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
            className="text-[12px] font-medium text-unavail-text disabled:opacity-60"
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
            {/* I7 — the venue's own roles, not a hardcoded list. The value is
                the role NAME on purpose: claim_shift compares required_role to
                staff_members.role as a string, so an id here would make every
                posted shift silently unclaimable by auto-approve. */}
            {roles.map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={() => handlePostOpen(dayIndex, shiftId)}
            disabled={posting}
            className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-on disabled:opacity-60"
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
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-hairline px-2.5 py-1.5 text-[12px] font-medium text-accent"
      >
        <ManagerIcon name="plus" size={13} /> Post as open
      </button>
    );
  }

  return (
    <div className="animate-fadeIn px-4 pb-28 pt-4">
      {/* Auto-fill and Copy no longer float here. They aren't navigation, they
          are the two ways to FILL a fresh week, so they live inside the front
          door below (R2 i) and behind More on a week that's already built. */}
      <div className="mb-3 text-[23px] font-medium tracking-[-0.5px] text-ink">Rota</div>

      {/* R1 — one bounded, snapping week-strip in place of the three pills.
          The week you're viewing takes the accent; the real current week keeps a
          "now" marker that never moves, so scrubbing never loses today. */}
      <WeekScrubber stops={weekStops} selected={selectedWeek} onSelect={setSelectedWeek} />
      <ScrubberEdgeHint stop={selectedStop} />

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
                className={`text-[13px] font-medium ${
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

      {/* R2 (i) + R3 — a fresh week opens on the chase, not an empty grid. */}
      {entry === "fresh" && (
        <RotaFrontDoor
          weekLabel={`w/c ${formatWeekRange(selectedWeek).split(" – ")[0]}`}
          hasPeriod={Boolean(period)}
          // The backend gates the availability grid on `status == "collecting"`
          // (availability.py), so anything else means the link staff would
          // follow is already read-only. Matching that exact predicate is what
          // stops a reminder being offered for a window that has shut.
          windowClosed={Boolean(period) && period?.status !== "collecting"}
          onReopen={handleReopen}
          reopening={reopening}
          staff={assignableStaff}
          onSetUpWeek={handleSetUpWeek}
          settingUp={settingUp}
          onGenerate={handleGenerate}
          generating={generating}
          onCopyPrevious={handleCopyPrevious}
          copying={copying}
          onRemindAll={handleRemindAll}
          remindingAll={remindingAll}
          onRemindOne={handleRemindOne}
          remindingId={remindingId}
          remindedIds={remindedIds}
        />
      )}

      {/* R2 (past) — a week that's been and gone. The backend refuses to create
          a period before this Monday, so there is nothing to build here; say so
          rather than offering controls that would 400. */}
      {entry === "past" && !hasAssignments && (
        <div className="mb-4 rounded-cp-card border-[0.5px] border-dashed border-hairline bg-surface-subtle px-4 py-6 text-center text-[13px] text-ink-muted">
          {/* `hasAssignments` is false while the week's rota is still in flight,
              so without this a historical week that DOES have one announces
              "nothing was built" for a beat before the grid arrives. */}
          {rotaLoading ? <Waiting label="Loading this week…" /> : "No rota was built for this week."}
        </div>
      )}

      {/* R2 (iii) — read-first. A live rota is what staff are working from, so
          it leads with a calm statement, not a call to action. */}
      {entry === "live" && (
        <div className="mb-3 flex items-center gap-2.5 rounded-cp-panel border-[0.5px] border-avail-border bg-avail-bg px-3.5 py-[13px]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-cp-slot bg-avail-bg text-cp-green">
            <ManagerIcon name="circle-check" size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-cp-green">Published · staff notified</div>
            <div className="mt-px text-[11.5px] text-ink-muted">{liveDetail}</div>
          </div>
        </div>
      )}

      {/* Approvals action-row — someone is waiting on you (B2) */}
      {period && entry !== "past" && (
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
      {showsRota && summary && <CoverageSummary slots={coverageSlots} />}

      {/* Under-18 legal block, its own distinct treatment (B4) */}
      {showsRota && summary && <U18LegalBlock warnings={legalWarnings} />}
      {showsRota && otherWarnings.length > 0 && (
        <div className="mb-3 flex gap-2.5 rounded-cp-panel border-[0.5px] border-cp-amber/40 bg-cp-amber-soft px-3.5 py-3">
          <span className="mt-px shrink-0 text-cp-amber">
            <ManagerIcon name="alert-triangle" size={16} />
          </span>
          <div className="text-[12px] leading-[1.5] text-ink-muted">
            {otherWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {showsRota && view === "matrix" && (
        <button
          onClick={() => setView("review")}
          className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-accent"
        >
          <ManagerIcon name="arrow-left" size={14} /> Back to day view
        </button>
      )}

      {showsRota && (
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
              onAdd={canEdit ? handleAdd : undefined}
              onRemove={canEdit ? handleRemove : undefined}
              renderGapActions={canEdit ? renderOpenSlotControl : undefined}
            />
          ) : (
            <ManagerRotaMatrix
              weekStart={selectedWeek}
              shifts={shifts}
              staff={staff}
              assignments={summary?.assignments ?? []}
              leave={summary?.leave ?? {}}
              orientation={orientation}
              onAdd={canEdit ? handleAdd : undefined}
              onRemove={canEdit ? handleRemove : undefined}
            />
          )}
        </div>
      )}

      {/* Secondary bar: the whole-week grid is a demoted secondary, tools behind More */}
      {showsRota && (
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
      {showsRota && showAvailability && (
        <div className="mt-4">
          <AvailabilityPanel
            shifts={shifts}
            submissions={submissions}
            clearingId={clearingId}
            onRequestClear={requestClearSubmission}
          />
        </div>
      )}

      {showsRota && showNotes && summary && summary.info.length > 0 && (
        <div className="mt-4 rounded-panel border border-hairline bg-surface-card p-4">
          <div className="mb-1 text-[13px] font-medium text-ink-label">Solver notes</div>
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
        onRegenerate={isLive ? () => setRebuildConfirmOpen(true) : handleGenerate}
        generating={generating}
        onCopyPrevious={handleCopyPrevious}
        copying={copying}
        canCopy={!hasAssignments && entry !== "past"}
        isLive={isLive}
        readOnly={entry === "past"}
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
            <div className="mb-2 text-lg font-medium text-ink">Clear this submission?</div>
            <div className="mb-4 text-sm text-ink-muted">
              This removes all of <span className="font-medium text-ink-label">{clearTarget.staffName}</span>
              &apos;s submitted availability for this week. They&apos;ll need to resubmit — this can&apos;t be
              undone.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setClearTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearSubmission}
                disabled={clearingId !== null}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-medium text-status-on disabled:opacity-60"
              >
                {clearingId ? <Waiting label="Clearing…" /> : "Clear submission"}
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
                {publishing ? <Waiting label="Publishing…" /> : "Publish anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rebuilding a live week: name what it costs before it happens. */}
      {rebuildConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="cp-hairline w-full max-w-[440px] rounded-card bg-surface-card p-6">
            <div className="mb-2 text-lg font-medium text-ink">Rebuild this week&apos;s rota?</div>
            <div className="mb-4 text-sm text-ink-muted">
              This rota is published — your team already has it. Rebuilding takes it down first, then
              solves the week again from scratch, so shifts people are expecting can change. Any
              shifts you placed by hand are kept.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setRebuildConfirmOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleRebuildLive}
                disabled={rebuilding || generating}
                className="rounded-xl bg-cp-red px-5 py-2.5 text-sm font-medium text-status-on disabled:opacity-60"
              >
                {rebuilding ? <Waiting label="Rebuilding…" /> : "Unpublish and rebuild"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky publish bar — never on a past week: there is nothing to
          publish and no gap that can still be filled. */}
      {showsRota && entry !== "past" && (
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
              <ManagerIcon name="send" size={15} /> {publishing ? <Waiting label="Publishing…" /> : "Publish"}
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
