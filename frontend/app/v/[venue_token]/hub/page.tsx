"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Icon from "@/components/staff/icon";
import ModeToggle from "@/components/staff/mode-toggle";
import StaffScreen, { StaffTopBar } from "@/components/staff/screen";
import NotificationBell from "@/components/notification-bell";
import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  ApiError,
  PinAuthData,
  StaffRota,
  StaffRotaAssignment,
  SwapForStaff,
  acceptGive,
  acceptSwap,
  authenticatePin,
  declineGive,
  declineSwap,
  getStaffRota,
} from "@/lib/api";
import {
  DAY_NAMES,
  formatHoursTotal,
  formatWeekOf,
  parseISODate,
  pinStorageKey,
  sumShiftHours,
  weeksFromThisWeek,
} from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function StaffHubPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [auth, setAuth] = useState<PinAuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | undefined>(undefined);

  const [rota, setRota] = useState<StaffRota | null>(null);

  const [acceptTarget, setAcceptTarget] = useState<StaffRotaAssignment | null>(null);
  const [resolving, setResolving] = useState(false);
  const [acceptSwapTarget, setAcceptSwapTarget] = useState<SwapForStaff | null>(null);
  const [resolvingSwap, setResolvingSwap] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    authenticatePin(venue_token, storedPin, { onRevalidate: setAuth })
      .then(setAuth)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(pinStorageKey(venue_token));
          router.replace(`/v/${venue_token}?expired=1`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    // Feeds the next-shift glance, the This-week card, the pending give/swap
    // banners, and the in-flight row — a nice-to-have, not something the hub
    // should fail to render over. Leave now lives on its own nav tab, so the
    // hub no longer fetches it (one fewer request on the flaky pool).
    getStaffRota(venue_token, storedPin, { onRevalidate: setRota })
      .then(setRota)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  function showToast(msg: string, tone?: "success") {
    setToast(msg);
    setToastTone(tone);
    setTimeout(() => setToast(null), 3000);
  }

  async function confirmAccept() {
    if (!pin || !acceptTarget) return;
    setResolving(true);
    try {
      const result = await acceptGive(venue_token, pin, acceptTarget.id);
      if (result.rota) setRota(result.rota);
      setAcceptTarget(null);
      if (result.status === "approved") {
        showToast("You're on this shift!", "success");
      } else {
        showToast(`Sent for manager approval${result.reason ? ` (${result.reason})` : ""}`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not accept this shift");
    } finally {
      setResolving(false);
    }
  }

  async function handleDecline(a: StaffRotaAssignment) {
    if (!pin) return;
    setResolving(true);
    try {
      setRota(await declineGive(venue_token, pin, a.id));
      showToast("Declined — the shift stays with them");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not decline this shift");
    } finally {
      setResolving(false);
    }
  }

  async function confirmAcceptSwap() {
    if (!pin || !acceptSwapTarget) return;
    setResolvingSwap(true);
    try {
      const result = await acceptSwap(venue_token, pin, acceptSwapTarget.id);
      if (result.rota) setRota(result.rota);
      setAcceptSwapTarget(null);
      if (result.status === "approved") {
        showToast("Swap complete — you're on the new shift!", "success");
      } else {
        showToast(`Sent for manager approval${result.reason ? ` (${result.reason})` : ""}`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not accept this swap");
    } finally {
      setResolvingSwap(false);
    }
  }

  async function handleDeclineSwap(swap: SwapForStaff) {
    if (!pin) return;
    setResolvingSwap(true);
    try {
      setRota(await declineSwap(venue_token, pin, swap.id));
      showToast("Declined — both shifts stay as they are");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not decline this swap");
    } finally {
      setResolvingSwap(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error || !auth) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  const firstName = auth.staff.name.split(" ")[0];
  const availPeriod = auth.period;
  // The strip labels the week the tiles below are counting — the published
  // rota. The availability period is often a different (later) week, and it
  // states its own week in the primary tile's copy, so leading with it here
  // would caption "3 shifts / 4+ hrs" with the wrong dates.
  const weekLabel = rota?.period
    ? formatWeekOf(rota.period.week_start)
    : availPeriod
      ? formatWeekOf(availPeriod.week_start)
      : null;

  // ---- Requests waiting on this person ----
  const pendingGive = rota?.assignments.find(
    (a) => a.target_staff_id === rota.staff_id && a.drop_status === "pending_pickup",
  );
  const giveShift = pendingGive ? rota?.shifts.find((s) => s.id === pendingGive.shift_id) : null;
  const giverName = pendingGive ? rota?.team.find((t) => t.id === pendingGive.staff_id)?.name : null;

  const pendingSwap = rota?.pending_swaps.find((s) => s.role === "recipient" && s.status === "pending_response");
  const swapTheirShift = pendingSwap ? rota?.shifts.find((s) => s.id === pendingSwap.their_shift.shift_id) : null;
  const swapMyShift = pendingSwap ? rota?.shifts.find((s) => s.id === pendingSwap.my_shift.shift_id) : null;
  // Per-day times for the offered shifts, resolved from the matching assignment
  // so a per-day shift shows the right hours in the give/swap banner.
  const giveTimes = pendingGive
    ? rota?.assignments.find((a) => a.shift_id === pendingGive.shift_id && a.day_index === pendingGive.day_index)
    : null;
  const swapTheirTimes = pendingSwap
    ? rota?.assignments.find((a) => a.id === pendingSwap.their_shift.assignment_id)
    : null;

  // ---- Tile badges ----
  const hasRota = Boolean(rota?.period);
  const myAssignments = rota
    ? rota.assignments.filter((a) => a.staff_id === rota.staff_id && a.shift_id)
    : [];

  const shiftsById = new Map((rota?.shifts ?? []).map((s) => [s.id, s]));
  const myShifts = myAssignments
    // Resolve each shift's real per-day hours so the hours badge is correct for
    // a per-day shift, not the shift-level representative.
    .map((a) => {
      const base = a.shift_id ? shiftsById.get(a.shift_id) : undefined;
      return base
        ? { ...base, start_time: a.start_time ?? base.start_time, end_time: a.end_time ?? base.end_time }
        : undefined;
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const { hours, unmeasured } = sumShiftHours(myShifts);
  const hoursBadge = `${formatHoursTotal(hours, unmeasured, "")} hrs`;

  // Anything of this person's that's mid-flight: their own drops and claims,
  // shifts offered to them, and either side of a swap.
  const inFlight = rota
    ? rota.assignments.filter(
        (a) =>
          Boolean(a.drop_status) &&
          (a.staff_id === rota.staff_id || a.target_staff_id === rota.staff_id || a.claim_staff_id === rota.staff_id),
      ).length + rota.pending_swaps.length
    : 0;

  // ---- Availability tile state ----
  const collecting = availPeriod?.status === "collecting";
  const alreadySubmitted = auth.submissions.length > 0;
  const weeksAhead = availPeriod ? weeksFromThisWeek(availPeriod.week_start) : null;
  const whichWeek =
    weeksAhead === 0 ? "this week" : weeksAhead === 1 ? "next week" : `w/c ${formatWeekOf(availPeriod!.week_start)}`;

  // ---- Home glance: next shift + availability status ----
  // The nav owns navigation now, so Home stops being a launcher grid and
  // becomes a glance — the biggest thing being "when am I next in?", front and
  // centre, which the old tile layout never surfaced.
  const nowUTC = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  let nextShift: { whenLabel: string; name: string; times: string; withNames: string[] } | null = null;
  if (rota?.period) {
    const weekMs = parseISODate(rota.period.week_start).getTime();
    const items = myAssignments
      .map((a) => {
        const base = a.shift_id ? shiftsById.get(a.shift_id) : undefined;
        return base ? { a, base, ms: weekMs + a.day_index * 86_400_000 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((x, y) => x.ms - y.ms);
    const up = items.find((it) => it.ms >= nowUTC);
    if (up) {
      const diff = Math.round((up.ms - nowUTC) / 86_400_000);
      const d = new Date(up.ms);
      const whenLabel =
        diff === 0
          ? "Today"
          : diff === 1
            ? "Tomorrow"
            : `${DAY_NAMES[up.a.day_index]} ${d.getUTCDate()} ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;
      const withNames = rota.assignments
        .filter(
          (o) =>
            o.day_index === up.a.day_index &&
            o.shift_id === up.a.shift_id &&
            o.staff_id &&
            o.staff_id !== rota.staff_id,
        )
        .map((o) => rota.team.find((t) => t.id === o.staff_id)?.name.split(" ")[0])
        .filter((n): n is string => Boolean(n));
      nextShift = {
        whenLabel,
        name: up.base.name,
        times: `${up.a.start_time ?? up.base.start_time} – ${up.a.end_time ?? up.base.end_time}`,
        withNames,
      };
    }
  }

  const availValue = !availPeriod
    ? "None open"
    : !collecting
      ? "Closed"
      : alreadySubmitted
        ? "Submitted"
        : "Not sent";
  const availMeta = availPeriod ? `for ${whichWeek}` : "nothing open right now";

  return (
    <StaffScreen>
      <StaffTopBar
        left={
          <>
            <div className="mb-1 text-[13px] text-ink-muted transition-colors duration-[350ms]">{greeting()}</div>
            <div className="truncate text-[26px] font-medium tracking-[-0.6px] text-ink">
              Hi, {firstName}
              <span className="text-accent">.</span>
            </div>
          </>
        }
        right={
          <>
            {pin && <NotificationBell venueToken={venue_token} pin={pin} />}
            <ModeToggle venueToken={venue_token} />
          </>
        }
      />

      <div className="cp-hairline mb-3 mt-5 flex items-center gap-2 rounded-cp-panel bg-surface-card px-3.5 py-3 transition-all duration-[350ms]">
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full bg-cp-green"
          style={{ boxShadow: "0 0 6px rgba(46,204,113,0.6)" }}
        />
        <span className="truncate text-[13px] font-medium text-ink">{auth.venue_name}</span>
        {weekLabel && (
          <span className="ml-auto shrink-0 text-[12px] text-ink-muted transition-colors duration-[350ms]">
            Week of {weekLabel}
          </span>
        )}
      </div>

      {/* Next shift — the single most-asked question, made the hero of Home. */}
      <Link
        href={`/v/${venue_token}/rota`}
        className="mb-3 block rounded-cp-card border-[0.5px] border-[rgba(255,77,0,0.25)] bg-accent-light p-[18px] transition-transform duration-150 active:scale-[0.99]"
      >
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">Next shift</div>
        {nextShift ? (
          <>
            <div className="mt-1.5 text-[19px] font-medium tracking-[-0.4px] text-ink">
              {nextShift.whenLabel} · {nextShift.name}
            </div>
            <div className="mt-1 text-[12px] text-ink-muted">
              {nextShift.times}
              {nextShift.withNames.length > 0 && ` · with ${nextShift.withNames.join(", ")}`}
            </div>
          </>
        ) : (
          <>
            <div className="mt-1.5 text-[19px] font-medium tracking-[-0.4px] text-ink">
              {hasRota ? "No upcoming shifts" : "No shifts published yet"}
            </div>
            <div className="mt-1 text-[12px] text-ink-muted">
              {hasRota ? "You're all caught up this week" : "Your rota appears here once it's published"}
            </div>
          </>
        )}
      </Link>

      {auth.auto_submitted && (
        <Link
          href={`/v/${venue_token}/availability`}
          className="cp-hairline mb-3 flex items-start gap-2.5 rounded-cp-panel bg-accent-light px-3.5 py-3 transition-transform duration-150 active:scale-[0.99]"
        >
          <Icon name="info-circle" size={16} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-left text-[13px] leading-[1.45] text-accent">
            We auto-submitted your usual availability this week — <span className="font-medium">still right?</span> Tap to check.
          </span>
        </Link>
      )}

      {pendingGive && giveShift && giverName && (
        <ActionBanner
          title={`${giverName} wants to give you a shift`}
          desc={`${DAY_NAMES[pendingGive.day_index]} · ${giveShift.name} · ${giveTimes?.start_time ?? giveShift.start_time} – ${giveTimes?.end_time ?? giveShift.end_time}`}
          busy={resolving}
          onAccept={() => setAcceptTarget(pendingGive)}
          onDecline={() => handleDecline(pendingGive)}
        />
      )}

      {pendingSwap && swapTheirShift && swapMyShift && (
        <ActionBanner
          title={`${pendingSwap.counterpart_name} wants to swap with you`}
          desc={`You'd take ${DAY_NAMES[pendingSwap.their_shift.day_index]} ${swapTheirTimes?.start_time ?? swapTheirShift.start_time} – ${swapTheirTimes?.end_time ?? swapTheirShift.end_time}, they'd take your ${DAY_NAMES[pendingSwap.my_shift.day_index]} ${swapMyShift.name}`}
          busy={resolvingSwap}
          onAccept={() => setAcceptSwapTarget(pendingSwap)}
          onDecline={() => handleDeclineSwap(pendingSwap)}
        />
      )}

      {/* Glance row — the two questions worth answering at a glance. Everything
          else is one tap away on the bottom nav. */}
      <div className="flex gap-2.5">
        <Link
          href={`/v/${venue_token}/availability`}
          className="cp-hairline flex-1 rounded-cp-panel bg-surface-card px-4 py-3.5 transition-transform duration-150 active:scale-[0.99]"
        >
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">Availability</div>
          <div className="mt-1 text-[15px] font-medium text-ink">{availValue}</div>
          <div className="mt-0.5 text-[12px] text-ink-muted">{availMeta}</div>
        </Link>

        <Link
          href={`/v/${venue_token}/hours`}
          className="cp-hairline flex-1 rounded-cp-panel bg-surface-card px-4 py-3.5 transition-transform duration-150 active:scale-[0.99]"
        >
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">This week</div>
          <div className="mt-1 text-[15px] font-medium text-ink">{hasRota ? hoursBadge : "—"}</div>
          <div className="mt-0.5 text-[12px] text-ink-muted">
            {hasRota ? `${myAssignments.length} shift${myAssignments.length === 1 ? "" : "s"}` : "no rota yet"}
          </div>
        </Link>
      </div>

      {inFlight > 0 && (
        <Link
          href={`/v/${venue_token}/drop`}
          className="cp-hairline mt-2.5 flex items-center gap-2.5 rounded-cp-panel bg-surface-card px-4 py-3 transition-transform duration-150 active:scale-[0.99]"
        >
          <Icon name="arrows-exchange" size={16} className="shrink-0 text-accent" />
          <span className="text-[13px] font-medium text-ink">
            {inFlight} drop/swap{inFlight === 1 ? "" : "s"} pending
          </span>
          <Icon name="chevron-right" size={16} className="ml-auto shrink-0 text-ink-muted" />
        </Link>
      )}

      <Modal open={acceptTarget !== null} onClose={() => setAcceptTarget(null)} title="Accept this shift?">
        {acceptTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              If it&apos;s compliant with your hours and rest, you&apos;re on this shift right away. If it would
              breach a rule, it goes to your manager for approval instead.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setAcceptTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmAccept}
                disabled={resolving}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resolving ? "Accepting…" : "Accept shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={acceptSwapTarget !== null} onClose={() => setAcceptSwapTarget(null)} title="Accept this swap?">
        {acceptSwapTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              Both shifts trade at once — never just one side. If it&apos;s compliant with everyone&apos;s hours
              and rest, the swap happens right away. If it would breach a rule on either side, it goes to your
              manager for approval instead.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setAcceptSwapTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmAcceptSwap}
                disabled={resolvingSwap}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resolvingSwap ? "Accepting…" : "Accept swap"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} tone={toastTone} />
    </StaffScreen>
  );
}

// A request waiting on this person. Amber, like every other "pending" surface
// in the design — but this one is actionable, so it carries buttons.
function ActionBanner({
  title,
  desc,
  busy,
  onAccept,
  onDecline,
}: {
  title: string;
  desc: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="mb-4 rounded-cp-tile border-[0.5px] border-[rgba(255,193,7,0.3)] bg-cp-amber-soft p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-cp-slot bg-[rgba(255,193,7,0.18)] text-cp-amber">
          <Icon name="clock" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink">{title}</div>
          <div className="mt-0.5 text-[12px] leading-[1.45] text-ink-muted transition-colors duration-[350ms]">
            {desc}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex-1 rounded-cp-slot bg-accent py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="cp-hairline flex-1 rounded-cp-slot bg-surface-card py-3 text-[13px] font-medium text-ink-muted transition-colors disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff flex min-h-screen items-center justify-center bg-surface-page px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
