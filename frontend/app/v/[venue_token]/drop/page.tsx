"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Modal from "@/components/modal";
import ShiftBadge from "@/components/shift-badge";
import Toast from "@/components/toast";
import { ApiError, StaffRota, StaffRotaAssignment, dropShift, getStaffRota } from "@/lib/api";
import { DAY_NAMES, addDays, parseISODate, pinStorageKey } from "@/lib/utils";

export default function DropShiftPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [data, setData] = useState<StaffRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<StaffRotaAssignment | null>(null);
  const [dropping, setDropping] = useState(false);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    getStaffRota(venue_token, storedPin)
      .then(setData)
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

  async function confirmDrop() {
    if (!pin || !confirmTarget) return;
    setDropping(true);
    try {
      const result = await dropShift(venue_token, pin, confirmTarget.id);
      setData(result);
      setJustDroppedId(confirmTarget.id);
      setConfirmTarget(null);
      showToast("Drop requested — you're still on this shift until someone picks it up");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not drop this shift");
    } finally {
      setDropping(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  if (!data.period) {
    return (
      <div className="mx-auto max-w-[420px] py-4">
        <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-2 text-xl font-bold text-ink">No rota published yet</div>
            <div className="text-sm leading-relaxed text-ink-muted">
              There&apos;s nothing to drop until a rota&apos;s been published for {data.venue_name}.
            </div>
            <Link href={`/v/${venue_token}/hub`} className="mt-6 text-[13px] font-semibold text-accent">
              ← Hub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const period = data.period;
  const weekStart = parseISODate(period.week_start);
  const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));
  const teamById = new Map(data.team.map((t) => [t.id, t]));

  const todayUTC = (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  const myUpcomingShifts = data.assignments
    .filter((a) => a.staff_id === data.staff_id && a.shift_id)
    .filter((a) => addDays(weekStart, a.day_index).getTime() >= todayUTC)
    .sort((a, b) => a.day_index - b.day_index);

  const openShifts = data.assignments
    .filter((a) => a.drop_status === "pending_pickup" && a.shift_id)
    .sort((a, b) => a.day_index - b.day_index);

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <Link href={`/v/${venue_token}/hub`} className="text-[13px] font-semibold text-accent">
            ← Hub
          </Link>
          <div className="py-2 pb-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{data.venue_name}</div>
            <div className="mt-1 text-[22px] font-bold text-ink">Drop a Shift</div>
          </div>

          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Your upcoming shifts
          </div>
          {myUpcomingShifts.length === 0 ? (
            <div className="mb-6 rounded-panel border border-hairline bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              You have no upcoming shifts to drop.
            </div>
          ) : (
            <div className="mb-6 flex flex-col gap-2">
              {myUpcomingShifts.map((a) => {
                const shift = shiftsById.get(a.shift_id!);
                if (!shift) return null;
                const dayDate = addDays(weekStart, a.day_index);
                const dropped = Boolean(a.drop_status) || a.id === justDroppedId;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border-2 p-3.5"
                    style={{ borderColor: shift.color, background: `${shift.color}14` }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ink">
                        {DAY_NAMES[a.day_index]} {dayDate.getUTCDate()}
                      </div>
                      <ShiftBadge name={shift.name} time={`${shift.start_time} – ${shift.end_time}`} color={shift.color} />
                    </div>
                    {dropped ? (
                      <span className="shrink-0 rounded-full bg-warn-bg px-3 py-1.5 text-[11px] font-semibold text-warn-text">
                        Drop requested
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmTarget(a)}
                        className="shrink-0 rounded-lg border border-unavail-border bg-surface-card px-3 py-1.5 text-[12px] font-semibold text-unavail-text"
                      >
                        Drop shift
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Open shifts</div>
          {openShifts.length === 0 ? (
            <div className="rounded-panel border border-hairline bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              Nothing&apos;s been dropped this week.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {openShifts.map((a) => {
                const shift = shiftsById.get(a.shift_id!);
                const member = teamById.get(a.staff_id);
                if (!shift || !member) return null;
                const dayDate = addDays(weekStart, a.day_index);
                return (
                  <div
                    key={a.id}
                    className="rounded-panel border border-hairline bg-surface-card p-3.5"
                  >
                    <div className="mb-1 text-sm font-bold text-ink">
                      {DAY_NAMES[a.day_index]} {dayDate.getUTCDate()}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <ShiftBadge name={shift.name} time={`${shift.start_time} – ${shift.end_time}`} color={shift.color} />
                      <span className="text-[12px] text-ink-faint">
                        {member.name} · {member.role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)} title="Drop this shift?">
        {confirmTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              You&apos;ll still be on this shift until someone picks it up — this doesn&apos;t remove you
              straight away. Once dropped, it&apos;s visible to the rest of the team as open.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmDrop}
                disabled={dropping}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {dropping ? "Dropping…" : "Drop shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} />
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
