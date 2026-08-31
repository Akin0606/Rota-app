"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Modal from "@/components/modal";
import BackButton from "@/components/staff/back-button";
import StaffLoading from "@/components/staff/staff-loading";
import CalendarBlock from "@/components/staff/calendar-block";
import Icon, { IconName } from "@/components/staff/icon";
import ModeToggle from "@/components/staff/mode-toggle";
import StaffScreen, { FootNote, ScreenTitle, SectionLabel, StaffTopBar } from "@/components/staff/screen";
import StatusBadge from "@/components/staff/status-badge";
import Toast from "@/components/toast";
import {
  ApiError,
  StaffRota,
  StaffRotaAssignment,
  SwapSide,
  claimShift,
  dropShift,
  getStaffRota,
  giveShift,
  proposeSwap,
} from "@/lib/api";
import { DAY_LABELS, DAY_NAMES, addDays, parseISODate, pinStorageKey } from "@/lib/utils";
import Waiting from "@/components/waiting";

type ActionKey = "drop" | "give" | "swap";

const ACTIONS: { key: ActionKey; icon: IconName; title: string; desc: string }[] = [
  { key: "drop", icon: "arrow-back-up", title: "Drop", desc: "Hand it back to your manager" },
  { key: "give", icon: "user-share", title: "Give", desc: "Offer it to a specific teammate" },
  { key: "swap", icon: "arrows-exchange", title: "Swap", desc: "Trade for one of theirs" },
];

export default function DropShiftPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [data, setData] = useState<StaffRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | undefined>(undefined);

  // Progressive disclosure: the three action tiles stay dimmed and inert until
  // a shift is picked here.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Swap is a bottom-nav tab now, so it normally has no back button. The one
  // exception is the deep-link from My shifts (?assignment=…): there we keep a
  // contextual "‹ My shifts" so the round-trip is one tap. Set from the URL in
  // the mount effect, so it's resolved before the top bar ever renders.
  const [deepLinked, setDeepLinked] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<StaffRotaAssignment | null>(null);
  const [dropping, setDropping] = useState(false);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

  const [claimTarget, setClaimTarget] = useState<StaffRotaAssignment | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [giveTarget, setGiveTarget] = useState<StaffRotaAssignment | null>(null);
  const [giveeId, setGiveeId] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);

  const [swapTarget, setSwapTarget] = useState<StaffRotaAssignment | null>(null);
  const [swapColleagueId, setSwapColleagueId] = useState<string | null>(null);
  const [swapTheirAssignmentId, setSwapTheirAssignmentId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    // My shifts links through as ?assignment={id} so tapping a shift there
    // lands here with it already picked. Read straight off the URL rather than
    // useSearchParams so the page needs no Suspense boundary.
    const preselect = new URLSearchParams(window.location.search).get("assignment");
    setDeepLinked(!!preselect);

    // The background refresh only replaces the data, never the selection: if
    // the selected shift is gone from the fresh copy, `selected` resolves to
    // undefined and the actions dim themselves, which is the honest outcome.
    getStaffRota(venue_token, storedPin, { onRevalidate: setData })
      .then((rota) => {
        setData(rota);
        if (preselect && rota.assignments.some((a) => a.id === preselect && a.staff_id === rota.staff_id)) {
          setSelectedId(preselect);
        }
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

  function showToast(msg: string, tone?: "success") {
    setToast(msg);
    setToastTone(tone);
    setTimeout(() => setToast(null), 3000);
  }

  async function confirmDrop() {
    if (!pin || !confirmTarget) return;
    setDropping(true);
    try {
      const result = await dropShift(venue_token, pin, confirmTarget.id);
      setData(result);
      setJustDroppedId(confirmTarget.id);
      setConfirmTarget(null);
      setSelectedId(null);
      showToast("Drop requested — you're still on this shift until someone picks it up");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not drop this shift");
    } finally {
      setDropping(false);
    }
  }

  function openGive(a: StaffRotaAssignment) {
    setGiveTarget(a);
    setGiveeId(null);
  }

  async function confirmGive() {
    if (!pin || !giveTarget || !giveeId) return;
    setGiving(true);
    try {
      const result = await giveShift(venue_token, pin, giveTarget.id, giveeId);
      setData(result);
      const giveeName = data?.venue_staff.find((s) => s.id === giveeId)?.name ?? "them";
      setGiveTarget(null);
      setGiveeId(null);
      setSelectedId(null);
      showToast(`Offered to ${giveeName} — you're still on this shift until they respond`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not give away this shift");
    } finally {
      setGiving(false);
    }
  }

  function openSwap(a: StaffRotaAssignment) {
    setSwapTarget(a);
    setSwapColleagueId(null);
    setSwapTheirAssignmentId(null);
  }

  function closeSwap() {
    setSwapTarget(null);
    setSwapColleagueId(null);
    setSwapTheirAssignmentId(null);
  }

  async function confirmSwap() {
    if (!pin || !swapTarget || !swapColleagueId || !swapTheirAssignmentId) return;
    setSwapping(true);
    try {
      const result = await proposeSwap(venue_token, pin, swapTarget.id, swapColleagueId, swapTheirAssignmentId);
      setData(result);
      const colleagueName = data?.venue_staff.find((s) => s.id === swapColleagueId)?.name ?? "them";
      closeSwap();
      setSelectedId(null);
      showToast(`Swap offered to ${colleagueName} — nothing changes until they respond`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not propose this swap");
    } finally {
      setSwapping(false);
    }
  }

  async function confirmClaim() {
    if (!pin || !claimTarget) return;
    setClaiming(true);
    try {
      const result = await claimShift(venue_token, pin, claimTarget.id);
      if (result.rota) setData(result.rota);
      setClaimTarget(null);
      if (result.status === "approved") {
        showToast("You're on this shift!", "success");
      } else {
        showToast(`Claim sent for manager approval${result.reason ? ` (${result.reason})` : ""}`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not claim this shift");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) return <StaffLoading />;
  if (error || !data) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  if (!data.period) {
    return (
      <StaffScreen>
        <StaffTopBar
          left={deepLinked ? <BackButton href={`/v/${venue_token}/rota`} label="My shifts" /> : null}
          right={<ModeToggle venueToken={venue_token} />}
        />
        <div className="mb-5 mt-4">
          <ScreenTitle title="Manage a shift" sub={data.venue_name} />
        </div>
        <div className="cp-hairline rounded-cp-card bg-surface-card p-6 text-center">
          <div className="text-[15px] font-medium text-ink">Nothing to manage yet</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink-muted">
            There&apos;s nothing to drop, give or swap until a rota&apos;s been published for {data.venue_name}.
          </div>
        </div>
      </StaffScreen>
    );
  }

  const period = data.period;
  const weekStart = parseISODate(period.week_start);
  const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));
  const teamById = new Map(data.team.map((t) => [t.id, t]));
  const myRole = teamById.get(data.staff_id)?.role ?? null;

  const todayUTC = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  const myUpcomingShifts = data.assignments
    .filter((a) => a.staff_id === data.staff_id && a.shift_id)
    .filter((a) => addDays(weekStart, a.day_index).getTime() >= todayUTC)
    .sort((a, b) => a.day_index - b.day_index);

  // Targeted gives are private between giver and recipient — they never show
  // in the open pool, regardless of who's viewing.
  const openShifts = data.assignments
    .filter((a) => Boolean(a.drop_status) && a.shift_id && !a.target_staff_id)
    .sort((a, b) => a.day_index - b.day_index);

  // A shift already out for drop/give/swap can't be acted on again — it shows
  // its current state instead of a selection control.
  function inFlightBadge(a: StaffRotaAssignment): string | null {
    const mySwap = data!.pending_swaps.find(
      (s) => s.role === "initiator" && s.my_shift.assignment_id === a.id,
    );
    if (a.drop_status === "pending_approval") return "Claim pending approval";
    if (a.target_staff_id) {
      const name = data!.venue_staff.find((s) => s.id === a.target_staff_id)?.name;
      return name ? `Offered to ${name}` : "Offered";
    }
    if (mySwap?.status === "pending_approval") return "Swap pending approval";
    if (mySwap) return `Swap offered to ${mySwap.counterpart_name}`;
    if (a.drop_status || a.id === justDroppedId) return "Drop requested";
    return null;
  }

  const selected = selectedId ? myUpcomingShifts.find((a) => a.id === selectedId) ?? null : null;
  const actionsActive = selected !== null;

  function runAction(key: ActionKey) {
    if (!selected) return;
    if (key === "drop") setConfirmTarget(selected);
    if (key === "give") openGive(selected);
    if (key === "swap") openSwap(selected);
  }

  function shiftLine(a: StaffRotaAssignment): { time: string; role: string } | null {
    const shift = a.shift_id ? shiftsById.get(a.shift_id) : null;
    if (!shift) return null;
    return {
      // Prefer the assignment's real per-day hours over the shift-level time.
      time: `${a.start_time ?? shift.start_time} – ${a.end_time ?? shift.end_time}`,
      role: myRole ? `${myRole} · ${shift.name.toLowerCase()}` : shift.name,
    };
  }

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />

      <div className="mb-5 mt-4">
        <ScreenTitle title="Manage a shift" sub="Pick a shift you can't make, then choose what to do" />
      </div>

      <SectionLabel>Your upcoming shifts</SectionLabel>
      {myUpcomingShifts.length === 0 ? (
        <div className="cp-hairline rounded-cp-tile bg-surface-card p-4 text-center text-[13px] text-ink-muted">
          You have no upcoming shifts this week.
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {myUpcomingShifts.map((a) => {
            const line = shiftLine(a);
            if (!line) return null;
            const dayDate = addDays(weekStart, a.day_index);
            const badge = inFlightBadge(a);
            const isSelected = a.id === selectedId;

            const row = (
              <>
                <CalendarBlock dayIndex={a.day_index} dateNumber={dayDate.getUTCDate()} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{line.time}</div>
                  <div className="truncate text-[12px] text-ink-muted transition-colors duration-[350ms]">
                    {line.role}
                  </div>
                </div>
              </>
            );

            if (badge) {
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3.5 rounded-cp-tile border-[0.5px] border-hairline bg-surface-card px-4 py-[15px] opacity-70"
                >
                  {row}
                  <StatusBadge tone="amber" className="shrink-0">
                    {badge}
                  </StatusBadge>
                </div>
              );
            }

            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : a.id)}
                className={`flex w-full items-center gap-3.5 rounded-cp-tile border-[0.5px] px-4 py-[15px] text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.99] ${
                  isSelected
                    ? "border-accent bg-accent-light"
                    : "border-hairline bg-surface-card hover:border-ink-faint hover:bg-surface-subtle"
                }`}
              >
                {row}
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-accent-on transition-[border-color,background-color] duration-200 ${
                    isSelected ? "border-accent bg-accent" : "border-hairline"
                  }`}
                >
                  {isSelected && (
                    <span className="cp-pop-in inline-flex">
                      <Icon name="check" size={12} strokeWidth={2.5} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {myUpcomingShifts.length > 0 && (
        <>
          <SectionLabel className="mt-[22px]">What would you like to do?</SectionLabel>
          <div
            className={`grid grid-cols-3 gap-2.5 transition-opacity duration-300 ${
              actionsActive ? "opacity-100" : "pointer-events-none opacity-40"
            }`}
          >
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                disabled={!actionsActive}
                onClick={() => runAction(action.key)}
                className="cp-hairline rounded-cp-tile bg-surface-card px-3 py-[18px] text-center transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent active:scale-[0.97]"
              >
                <span className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-cp-control bg-cp-icon text-accent transition-colors duration-[350ms]">
                  <Icon name={action.icon} size={18} />
                </span>
                <span className="block text-[14px] font-medium text-ink">{action.title}</span>
                <span className="mt-1 block text-[11px] leading-[1.4] text-ink-muted transition-colors duration-[350ms]">
                  {action.desc}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {data.pending_swaps.length > 0 && (
        <div className="mt-5 flex flex-col gap-[9px]">
          {data.pending_swaps.map((swap) => {
            // my_shift is always the viewer's own side whichever role they
            // hold, so one phrasing works for both. Naming the two days is
            // clearer than naming the shifts — "your day, their day" is
            // ambiguous when both sides are the venue's "Day" shift.
            const side = (s: SwapSide) =>
              `${DAY_LABELS[s.day_index]} ${addDays(weekStart, s.day_index).getUTCDate()}`;
            const desc = `Your ${side(swap.my_shift)} for their ${side(swap.their_shift)}`;
            return (
              <div
                key={swap.id}
                className="flex items-center gap-3 rounded-cp-tile border-[0.5px] border-[rgba(255,193,7,0.3)] bg-cp-amber-soft px-4 py-3.5"
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-cp-slot bg-[rgba(255,193,7,0.18)] text-cp-amber">
                  <Icon name="clock" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">
                    Swap with {swap.counterpart_name}
                  </div>
                  <div className="truncate text-[12px] text-ink-muted transition-colors duration-[350ms]">
                    {desc}
                  </div>
                </div>
                <span className="shrink-0 rounded-cp-badge bg-[rgba(255,193,7,0.18)] px-2.5 py-1 text-[11px] font-medium text-cp-amber">
                  {swap.status === "pending_approval" ? "With manager" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <SectionLabel className="mt-[26px]">Open shifts</SectionLabel>
      {openShifts.length === 0 ? (
        <div className="cp-hairline rounded-cp-tile bg-surface-card p-4 text-center text-[13px] text-ink-muted">
          Nothing&apos;s been dropped this week.
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {openShifts.map((a) => {
            const shift = a.shift_id ? shiftsById.get(a.shift_id) : null;
            if (!shift) return null;
            const member = a.staff_id ? teamById.get(a.staff_id) : null;
            const dayDate = addDays(weekStart, a.day_index);
            const isMine = a.staff_id === data.staff_id;
            const isMyClaim = a.claim_staff_id === data.staff_id;
            const who = member
              ? `${member.name} · ${member.role}`
              : a.required_role
                ? `Open · needs ${a.required_role}`
                : "Open · any role";

            let footer: React.ReactNode;
            if (a.drop_status === "pending_approval") {
              footer = (
                <StatusBadge tone="amber" icon="clock">
                  {isMyClaim ? "Your claim is pending approval" : "Claim pending approval"}
                </StatusBadge>
              );
            } else if (isMine) {
              footer = <StatusBadge tone="neutral">Your dropped shift</StatusBadge>;
            } else {
              footer = (
                <button
                  onClick={() => setClaimTarget(a)}
                  className="w-full rounded-cp-control bg-accent py-3 text-center text-[13px] font-medium text-accent-on transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98]"
                >
                  Claim this shift
                </button>
              );
            }

            return (
              <div key={a.id} className="cp-hairline rounded-cp-tile bg-surface-card px-4 py-[15px]">
                <div className="flex items-center gap-3.5">
                  <CalendarBlock dayIndex={a.day_index} dateNumber={dayDate.getUTCDate()} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">
                      {a.start_time ?? shift.start_time} – {a.end_time ?? shift.end_time}
                    </div>
                    <div className="truncate text-[12px] text-ink-muted transition-colors duration-[350ms]">
                      {who}
                    </div>
                  </div>
                </div>
                <div className="mt-3">{footer}</div>
              </div>
            );
          })}
        </div>
      )}

      <FootNote>Nothing changes until someone picks it up or your manager approves it</FootNote>

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)} title="Drop this shift?">
        {confirmTarget && (
          <>
            <div className="mb-5 text-[13px] leading-[1.55] text-ink-muted">
              You&apos;ll still be on this shift until someone picks it up — this doesn&apos;t remove you
              straight away. Once dropped, it&apos;s visible to the rest of the team as open.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmDrop}
                disabled={dropping}
                className="rounded-cp-control bg-unavail-text px-5 py-2.5 text-[13px] font-medium text-status-on disabled:opacity-60"
              >
                {dropping ? <Waiting label="Dropping…" /> : "Drop shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={giveTarget !== null} onClose={() => setGiveTarget(null)} title="Give this shift to someone">
        {giveTarget && (
          <>
            <div className="mb-4 text-[13px] leading-[1.55] text-ink-muted">
              Pick a colleague to offer it to. You&apos;re still on this shift until they accept — nothing
              changes until then.
            </div>
            {data.venue_staff.length === 0 ? (
              <div className="mb-4 text-[13px] text-ink-muted">No other active staff to give this to.</div>
            ) : (
              <div className="mb-5 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                {data.venue_staff.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setGiveeId(s.id)}
                    className={`flex items-center justify-between rounded-cp-control border-[0.5px] px-3.5 py-2.5 text-left text-[13px] font-medium transition ${
                      giveeId === s.id
                        ? "border-accent bg-accent-light text-accent"
                        : "border-hairline bg-surface-card text-ink-label"
                    }`}
                  >
                    {s.name}
                    <span className="text-[11px] font-normal text-ink-faint">{s.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setGiveTarget(null)}
                className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmGive}
                disabled={giving || !giveeId}
                className="rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-50"
              >
                {giving ? <Waiting label="Sending…" /> : "Give shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={swapTarget !== null}
        onClose={closeSwap}
        title={swapColleagueId ? "Pick which of their shifts" : "Swap with someone"}
      >
        {swapTarget && !swapColleagueId && (
          <>
            <div className="mb-4 text-[13px] leading-[1.55] text-ink-muted">
              Pick a colleague, then pick one of their upcoming shifts to trade for. You&apos;re still on your
              shift until they accept — nothing changes until then.
            </div>
            {data.venue_staff.length === 0 ? (
              <div className="mb-4 text-[13px] text-ink-muted">No other active staff to swap with.</div>
            ) : (
              <div className="mb-5 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                {data.venue_staff.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSwapColleagueId(s.id)}
                    className="flex items-center justify-between rounded-cp-control border-[0.5px] border-hairline bg-surface-card px-3.5 py-2.5 text-left text-[13px] font-medium text-ink-label transition"
                  >
                    {s.name}
                    <span className="text-[11px] font-normal text-ink-faint">{s.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closeSwap}
                className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              >
                Cancel
              </button>
            </div>
          </>
        )}
        {swapTarget &&
          swapColleagueId &&
          (() => {
            const colleagueName = data.venue_staff.find((s) => s.id === swapColleagueId)?.name ?? "them";
            const theirShifts = data.assignments
              .filter((a) => a.staff_id === swapColleagueId && a.shift_id && !a.drop_status)
              .filter((a) => addDays(weekStart, a.day_index).getTime() >= todayUTC)
              .sort((a, b) => a.day_index - b.day_index);
            return (
              <>
                <div className="mb-4 text-[13px] leading-[1.55] text-ink-muted">
                  Offering your <span className="font-medium text-ink-label">{DAY_NAMES[swapTarget.day_index]}</span>{" "}
                  shift. Pick one of <span className="font-medium text-ink-label">{colleagueName}</span>
                  &apos;s upcoming shifts to ask for in return.
                </div>
                {theirShifts.length === 0 ? (
                  <div className="mb-4 text-[13px] text-ink-muted">
                    {colleagueName} has no upcoming shifts to swap for.
                  </div>
                ) : (
                  <div className="mb-5 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                    {theirShifts.map((a) => {
                      const shift = a.shift_id ? shiftsById.get(a.shift_id) : null;
                      if (!shift) return null;
                      const dayDate = addDays(weekStart, a.day_index);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSwapTheirAssignmentId(a.id)}
                          className={`flex items-center justify-between rounded-cp-control border-[0.5px] px-3.5 py-2.5 text-left text-[13px] font-medium transition ${
                            swapTheirAssignmentId === a.id
                              ? "border-accent bg-accent-light text-accent"
                              : "border-hairline bg-surface-card text-ink-label"
                          }`}
                        >
                          {DAY_NAMES[a.day_index]} {dayDate.getUTCDate()} · {shift.name}
                          <span className="text-[11px] font-normal text-ink-faint">
                            {a.start_time ?? shift.start_time}–{a.end_time ?? shift.end_time}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => {
                      setSwapColleagueId(null);
                      setSwapTheirAssignmentId(null);
                    }}
                    className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
                  >
                    ← Back
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={closeSwap}
                      className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmSwap}
                      disabled={swapping || !swapTheirAssignmentId}
                      className="rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-50"
                    >
                      {swapping ? <Waiting label="Sending…" /> : "Propose swap"}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
      </Modal>

      <Modal open={claimTarget !== null} onClose={() => setClaimTarget(null)} title="Claim this shift?">
        {claimTarget && (
          <>
            <div className="mb-5 text-[13px] leading-[1.55] text-ink-muted">
              If it&apos;s a straightforward like-for-like swap it&apos;s yours right away. If it needs a closer
              look (different role, or it&apos;d affect your hours/rest), it goes to your manager for approval
              instead.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setClaimTarget(null)}
                className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmClaim}
                disabled={claiming}
                className="rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-60"
              >
                {claiming ? <Waiting label="Claiming…" /> : "Claim shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} tone={toastTone} />
    </StaffScreen>
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
