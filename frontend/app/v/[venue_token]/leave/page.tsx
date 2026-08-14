"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Modal from "@/components/modal";
import Toast from "@/components/toast";
import BackButton from "@/components/staff/back-button";
import Icon, { IconName } from "@/components/staff/icon";
import MetricCard from "@/components/staff/metric-card";
import ModeToggle from "@/components/staff/mode-toggle";
import StaffScreen, { FootNote, ScreenTitle, SectionLabel, StaffTopBar } from "@/components/staff/screen";
import StatusBadge, { StatusTone } from "@/components/staff/status-badge";
import {
  ApiError,
  LeaveAllowance,
  LeaveRequest,
  authenticatePin,
  cancelLeaveRequest,
  myLeaveRequests,
  requestLeave,
} from "@/lib/api";
import {
  formatDays,
  formatLeaveDates,
  formatLeaveYear,
  formatRelativeTime,
  leaveDaysForRange,
  pinStorageKey,
} from "@/lib/utils";

// Entitlement, the leave year and what a range costs all come from the backend
// now (migration 021). They used to be guessed here — 28 days, a Jan-Dec year,
// and inclusive calendar days — with a per-device localStorage override
// standing in for a real figure.

const STATUS_VISUAL: Record<
  LeaveRequest["status"],
  { label: string; tone: StatusTone; icon: IconName }
> = {
  pending: { label: "Pending", tone: "amber", icon: "clock" },
  approved: { label: "Approved", tone: "green", icon: "beach" },
  rejected: { label: "Rejected", tone: "neutral", icon: "circle-x" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "circle-x" },
};

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export default function StaffLeavePage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [allowance, setAllowance] = useState<LeaveAllowance | null>(null);

  const [requesting, setRequesting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    Promise.all([
      authenticatePin(venue_token, storedPin),
      // Safe to refresh in the background: every mutation on this screen
      // already writes its own result into `requests`, and any staff write
      // drops the cached copy, so a revalidate can only ever bring newer data.
      myLeaveRequests(venue_token, storedPin, {
        onRevalidate: (res) => {
          setRequests(res.requests);
          setAllowance(res.allowance);
        },
      }),
    ])
      .then(([auth, mine]) => {
        setVenueName(auth.venue_name);
        setRequests(mine.requests);
        setAllowance(mine.allowance);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(pinStorageKey(venue_token));
          router.replace(`/v/${venue_token}?expired=1`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function openRequest() {
    setStartDate("");
    setEndDate("");
    setReason("");
    setRequesting(true);
  }

  async function submitRequest() {
    if (!pin || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const created = await requestLeave(venue_token, pin, startDate, endDate, reason.trim() || null);
      setRequests((prev) => [created, ...prev]);
      // The write invalidated the cached copy, so this re-reads rather than
      // doing allowance arithmetic a second time on the client.
      myLeaveRequests(venue_token, pin)
        .then((res) => setAllowance(res.allowance))
        .catch(() => {});
      setRequesting(false);
      showToast("Leave requested — your manager will review it");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not submit this request");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancel() {
    if (!pin || !cancelTarget) return;
    setCancelling(true);
    try {
      const updated = await cancelLeaveRequest(venue_token, pin, cancelTarget.id);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      myLeaveRequests(venue_token, pin)
        .then((res) => setAllowance(res.allowance))
        .catch(() => {});
      setCancelTarget(null);
      showToast("Request cancelled");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not cancel this request");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error) return <CenteredMessage>{error}</CenteredMessage>;

  const today = todayISO();

  // What a range costs this person depends on how many days a week they work,
  // which only the backend knows — so the estimate in the request modal asks
  // for the same arithmetic rather than reimplementing it.
  const perWeek = allowance?.working_days_per_week ?? 5;
  const estimateDays = (start: string, end: string) => leaveDaysForRange(start, end, perWeek);

  const canCancel = (r: LeaveRequest) =>
    r.status === "pending" || (r.status === "approved" && r.start_date >= today);

  // Anything still to come reads top-down in the order it will happen; anything
  // finished falls below it, most recent first.
  const sorted = [...requests].sort((a, b) => {
    const aUpcoming = a.end_date >= today;
    const bUpcoming = b.end_date >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date);
  });

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />

      <div className="mb-5 mt-4">
        <ScreenTitle title="Time off" sub={venueName ? `Request holiday or a day away · ${venueName}` : "Request holiday or a day away"} />
      </div>

      <div className="mb-[22px] flex gap-2.5">
        <MetricCard
          label="Days remaining"
          value={allowance ? formatDays(allowance.remaining_days) : "—"}
          suffix={allowance ? `of ${formatDays(allowance.entitlement_days)}` : undefined}
          accent
        />
        <MetricCard
          label="Booked"
          value={allowance ? formatDays(allowance.booked_days) : "—"}
          suffix="days"
        />
        <MetricCard
          label="Pending"
          value={allowance ? formatDays(allowance.pending_days) : "—"}
          suffix="days"
        />
      </div>

      <button
        onClick={openRequest}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-cp-panel bg-accent p-3.5 text-[14px] font-medium tracking-[-0.1px] text-white transition-opacity duration-150 hover:opacity-90"
      >
        <Icon name="plus" size={17} />
        Request time off
      </button>

      <SectionLabel>Your requests</SectionLabel>
      {sorted.length === 0 ? (
        <div className="cp-hairline rounded-cp-card bg-surface-card p-6 text-center">
          <div className="text-[15px] font-medium text-ink">No time off booked</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink-muted">
            Ask for a day away and your manager will see it here.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {sorted.map((r) => (
            <RequestRow key={r.id} request={r} onCancel={canCancel(r) ? () => setCancelTarget(r) : undefined} />
          ))}
        </div>
      )}

      <FootNote>Requests need manager approval before they&apos;re confirmed</FootNote>
      {allowance && (
        <FootNote>
          {formatLeaveYear(allowance.leave_year_start, allowance.leave_year_end)} · a week off costs{" "}
          {formatDays(allowance.working_days_per_week)} days. Ask your manager if that&apos;s wrong
        </FootNote>
      )}

      <Modal open={requesting} onClose={() => setRequesting(false)} title="Request time off">
        <div className="mb-4 flex gap-3">
          {/* min-w-0: a bare flex-1 won't shrink below a date input's
              intrinsic width, which overflows the card at 375px. */}
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-[12px] text-ink-muted">From</span>
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-[12px] text-ink-muted">To</span>
            <input
              type="date"
              value={endDate}
              min={startDate || today}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
        <label className="mb-2 block">
          <span className="mb-1.5 block text-[12px] text-ink-muted">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. family holiday"
            className="w-full resize-none rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
        </label>
        <div className="mb-5 text-[12px] text-ink-muted">
          {startDate && endDate && endDate >= startDate
            ? `${formatDays(estimateDays(startDate, endDate))} day${
                estimateDays(startDate, endDate) === 1 ? "" : "s"
              } off your allowance — you work ${formatDays(perWeek)} days a week`
            : "Pick both dates to see how many days this uses."}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setRequesting(false)}
            className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={submitRequest}
            disabled={submitting || !startDate || !endDate}
            className="rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send request"}
          </button>
        </div>
      </Modal>

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} title="Cancel this request?">
        {cancelTarget && (
          <>
            <div className="mb-5 text-[13px] leading-[1.55] text-ink-muted">
              {formatLeaveDates(cancelTarget.start_date, cancelTarget.end_date)} will no longer be held as
              time off.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              >
                Keep it
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                className="rounded-cp-control bg-cp-icon px-5 py-2.5 text-[13px] font-medium text-ink disabled:opacity-60"
              >
                {cancelling ? "Cancelling…" : "Cancel request"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} />
    </StaffScreen>
  );
}

function RequestRow({ request, onCancel }: { request: LeaveRequest; onCancel?: () => void }) {
  const visual = STATUS_VISUAL[request.status] ?? STATUS_VISUAL.pending;
  const days = request.days;

  // The reference uses a beach for a holiday and a calendar tick for a single
  // day away — the same distinction our data supports, since a one-day request
  // is almost never a holiday.
  const icon: IconName = request.status === "approved" && days === 1 ? "calendar-check" : visual.icon;
  const iconTone =
    visual.tone === "green"
      ? "bg-cp-green-soft text-cp-green"
      : visual.tone === "amber"
        ? "bg-cp-amber-soft text-cp-amber"
        : "bg-cp-icon text-ink-muted";

  // Pending requests lead with how long they've been waiting (the reference's
  // "requested 2 days ago"); settled ones lead with why, when a reason exists.
  const meta =
    request.status === "pending"
      ? `${days} day${days === 1 ? "" : "s"} · requested ${formatRelativeTime(
          request.created_at,
        ).toLowerCase()}`
      : `${days} day${days === 1 ? "" : "s"}${request.reason ? ` · ${request.reason}` : ""}`;

  const body = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-cp-control transition-colors duration-[350ms] ${iconTone}`}
      >
        <Icon name={icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-ink">
          {formatLeaveDates(request.start_date, request.end_date)}
        </div>
        <div className="truncate text-[12px] text-ink-muted transition-colors duration-[350ms]">{meta}</div>
        {/* No slot for this in the reference, but a rejection without its
            reason is the one thing on this screen worth reading. */}
        {request.manager_note && (
          <div className="mt-1 text-[11px] leading-[1.4] text-ink-faint">“{request.manager_note}”</div>
        )}
      </div>
      <StatusBadge tone={visual.tone}>{visual.label}</StatusBadge>
      {onCancel && <Icon name="chevron-right" size={15} className="-mr-1 text-ink-faint" />}
    </>
  );

  const className =
    "cp-hairline flex w-full items-center gap-3.5 rounded-cp-tile bg-surface-card px-4 py-[15px] text-left transition-all duration-[350ms]";

  if (!onCancel) return <div className={className}>{body}</div>;
  return (
    <button onClick={onCancel} className={className}>
      {body}
    </button>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff min-h-screen bg-surface-page">
      <div className="mx-auto flex max-w-[440px] items-center justify-center px-6 py-24 text-center text-[13px] text-ink-muted">
        {children}
      </div>
    </div>
  );
}
