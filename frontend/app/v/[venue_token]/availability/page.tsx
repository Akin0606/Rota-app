"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AvailabilityGrid from "@/components/availability-grid";
import Toast from "@/components/toast";
import {
  ApiError,
  PinAuthData,
  authenticatePin,
  getWeekAvailability,
  submitAvailability,
} from "@/lib/api";
import { DAY_LABELS, formatDeadline, formatWeekRange, pinStorageKey } from "@/lib/utils";

type Grid = Record<number, Record<string, number>>;

// This week's Monday and the following 3 weeks (a ~1-month planning window).
function mondayISO(offsetWeeks: number): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEK_OPTIONS = [0, 1, 2, 3].map((offset) => ({
  weekStart: mondayISO(offset),
  label: offset === 0 ? "This week" : offset === 1 ? "Next week" : `w/c ${formatWeekRange(mondayISO(offset)).split(" – ")[0]}`,
}));

export default function StaffAvailabilityPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [data, setData] = useState<PinAuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState<string>(WEEK_OPTIONS[0].weekStart);
  const [editable, setEditable] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);

  const [grid, setGrid] = useState<Grid>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteDay, setNoteDay] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Authenticate + load venue/staff/shifts/rules once.
  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    authenticatePin(venue_token, storedPin)
      .then((res) => {
        setData(res);
        if (res.period && WEEK_OPTIONS.some((w) => w.weekStart === res.period!.week_start)) {
          setSelectedWeek(res.period.week_start);
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

  // Load the selected week's saved availability.
  useEffect(() => {
    if (!pin || !data) return;
    let cancelled = false;
    setWeekLoading(true);
    getWeekAvailability(venue_token, pin, selectedWeek)
      .then((res) => {
        if (cancelled) return;
        const g: Grid = {};
        const n: Record<number, string> = {};
        for (const sub of res.submissions) {
          if (sub.shift_id) {
            g[sub.day_index] = { ...(g[sub.day_index] || {}), [sub.shift_id]: sub.status };
          } else if (sub.note) {
            n[sub.day_index] = sub.note;
          }
        }
        setGrid(g);
        setNotes(n);
        setEditable(res.editable);
      })
      .catch(() => {
        if (!cancelled) {
          setGrid({});
          setNotes({});
          setEditable(true);
        }
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, pin, data, venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function toggle(dayIndex: number, shiftId: string) {
    if (!editable) return;
    setGrid((prev) => {
      const current = prev[dayIndex]?.[shiftId] ?? 0;
      const next = (current + 1) % 4;
      return { ...prev, [dayIndex]: { ...(prev[dayIndex] || {}), [shiftId]: next } };
    });
  }

  function saveNote() {
    if (noteDay === null || !noteText.trim()) return;
    setNotes((prev) => ({ ...prev, [noteDay]: noteText.trim() }));
    setNoteDay(null);
    setNoteText("");
  }

  function removeNote(day: number) {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  async function handleSubmit() {
    if (!data || !pin) return;
    const hasAny = Object.values(grid).some((row) => Object.values(row).some((v) => v > 0));
    if (!hasAny) {
      showToast("Please set at least one slot");
      return;
    }

    const submissions: { day_index: number; shift_id: string | null; status: 0 | 1 | 2 | 3; note: string | null }[] = [];
    for (const [dayIndex, shifts] of Object.entries(grid)) {
      for (const [shiftId, status] of Object.entries(shifts)) {
        if (status > 0) {
          submissions.push({ day_index: Number(dayIndex), shift_id: shiftId, status: status as 0 | 1 | 2 | 3, note: null });
        }
      }
    }
    for (const [dayIndex, note] of Object.entries(notes)) {
      submissions.push({ day_index: Number(dayIndex), shift_id: null, status: 0, note });
    }

    setSubmitting(true);
    try {
      await submitAvailability(venue_token, pin, submissions, selectedWeek);
      router.push(`/v/${venue_token}/submitted`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not submit, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (error || !data) {
    return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;
  }

  const firstName = data.staff.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <div className="py-2 pb-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {data.venue_name}
            </div>
            <div className="mt-1 text-[22px] font-bold text-ink">Hi, {firstName}</div>
          </div>

          {/* Week switcher — plan up to a month ahead */}
          <div className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {WEEK_OPTIONS.map((opt) => {
              const active = opt.weekStart === selectedWeek;
              return (
                <button
                  key={opt.weekStart}
                  onClick={() => setSelectedWeek(opt.weekStart)}
                  className={`shrink-0 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${
                    active ? "bg-accent text-white" : "bg-surface-subtle text-ink-muted"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {editable ? (
            <div className="mb-5 flex justify-center">
              <div className="flex items-center gap-1.5 rounded-full bg-warn-bg px-3.5 py-1.5 text-xs font-semibold text-warn-text">
                <span className="h-1.5 w-1.5 rounded-full bg-warn-dot" />
                Submit by{" "}
                {formatDeadline(selectedWeek, data.rules.avail_closes_day, data.rules.avail_closes_time)}
              </div>
            </div>
          ) : (
            <div className="mb-5 flex justify-center">
              <div className="rounded-full bg-unset-bg px-3.5 py-1.5 text-xs font-semibold text-ink-muted">
                Availability for this week has closed
              </div>
            </div>
          )}

          <div className="mb-3 text-[13px] font-semibold text-ink-muted">
            Week of {formatWeekRange(selectedWeek)}
          </div>

          <div className={!editable || weekLoading ? "pointer-events-none opacity-60" : ""}>
            <AvailabilityGrid shifts={data.shifts} value={grid} onToggle={toggle} />
          </div>

          <div className="mt-3">
            <div className="mb-2 text-xs font-semibold text-ink-label">Notes (optional)</div>
            {DAY_LABELS.map((day, di) =>
              notes[di] ? (
                <div
                  key={di}
                  className="mb-1 flex items-center justify-between rounded-lg border border-unset-border bg-surface-subtle px-3 py-2"
                >
                  <div>
                    <div className="text-[11px] text-ink-faint">{day}</div>
                    <div className="text-[13px] text-ink-label">{notes[di]}</div>
                  </div>
                  {editable && (
                    <button onClick={() => removeNote(di)} className="text-xs text-ink-faint">
                      ✕
                    </button>
                  )}
                </div>
              ) : null,
            )}
            {editable &&
              (noteDay === null ? (
                <button
                  onClick={() => {
                    setNoteDay(0);
                    setNoteText("");
                  }}
                  className="mt-1 w-full rounded-[10px] border-2 border-dashed border-unset-border py-2.5 text-center text-[13px] font-semibold text-accent"
                >
                  + Add a note
                </button>
              ) : (
                <div className="mt-1 rounded-[10px] border border-unset-border bg-surface-subtle p-3">
                  <div className="mb-2 flex gap-2">
                    {DAY_LABELS.map((day, di) => (
                      <button
                        key={di}
                        onClick={() => setNoteDay(di)}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          noteDay === di ? "bg-accent text-white" : "bg-unset-bg text-ink-muted"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="e.g. Can stay late if needed"
                    className="w-full rounded-lg border-[1.5px] border-unset-border px-3 py-2.5 text-sm outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setNoteDay(null)}
                      className="flex-1 rounded-lg bg-unset-bg py-2 text-center text-[13px] text-ink-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveNote}
                      className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {editable && (
            <button
              onClick={handleSubmit}
              disabled={submitting || weekLoading}
              className="mt-5 w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit Availability"}
            </button>
          )}
        </div>
      </div>
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
