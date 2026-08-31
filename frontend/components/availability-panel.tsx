"use client";

import { useState } from "react";

import type { Shift, SubmissionEntry } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

// These must stay in lockstep with the staff availability screen's three
// states, which is what the numbers actually mean to the person who submitted
// them. They used to disagree on both colour and word — a staff member tapped
// a green "Available" (3) and the manager saw a gold star, while an amber "If
// needed" (1) showed up here as the same green tick that means the *stronger*
// signal on the other side. The colours were, in effect, swapped.
//
// The token names below are historical: `preferred` is simply the amber tone
// and `unset` the muted one. Only the tone matters here, not the name.
const STATUS_STYLE: Record<number, { bg: string; border: string; text: string; label: string }> = {
  3: { bg: "bg-avail-bg", border: "border-avail-border", text: "text-avail-text", label: "Available" },
  1: {
    bg: "bg-preferred-bg",
    border: "border-preferred-border",
    text: "text-preferred-text",
    label: "If needed",
  },
  2: { bg: "bg-unset-bg", border: "border-unset-border", text: "text-unset-text", label: "Can't work" },
};

// Long shift names have to survive seven columns on one row, so the badge
// carries a short form and the full name stays in the tooltip.
function abbreviate(name: string): string {
  const clean = name.trim();
  return clean.length <= 4 ? clean : clean.slice(0, 3);
}

type AvailabilityPanelProps = {
  shifts: Shift[];
  submissions: SubmissionEntry[];
  clearingId: string | null;
  onRequestClear: (staffId: string, staffName: string) => void;
};

export default function AvailabilityPanel({
  shifts,
  submissions,
  clearingId,
  onRequestClear,
}: AvailabilityPanelProps) {
  const [open, setOpen] = useState(false);

  const byStaff = new Map<string, { name: string; entries: SubmissionEntry[] }>();
  for (const sub of submissions) {
    const entry = byStaff.get(sub.staff_id) ?? { name: sub.staff_name, entries: [] };
    entry.entries.push(sub);
    byStaff.set(sub.staff_id, entry);
  }
  const staffRows = Array.from(byStaff.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="mb-5 rounded-panel border border-hairline bg-surface-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-[13px] font-medium text-ink-label">
          Availability submissions
          {staffRows.length > 0 && (
            <span className="ml-2 font-normal text-ink-faint">
              {staffRows.length} staff member{staffRows.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="border-t border-hairline px-4 pb-4 pt-3.5">
          {staffRows.length === 0 ? (
            <div className="text-[13px] text-ink-faint">No availability submitted for this week yet.</div>
          ) : (
            <>
              {/* The staff screen has always had a legend; this side never did,
                  so three unexplained symbols were the manager's only guide. */}
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-faint">
                {[3, 1, 2].map((status) => {
                  const style = STATUS_STYLE[status];
                  return (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block h-3 w-3 rounded-[4px] border ${style.bg} ${style.border}`}
                      />
                      {style.label}
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-[4px] border border-dashed border-hairline" />
                  No answer
                </span>
                <span className="text-ink-faint/70">
                  One badge per shift ({shifts.map((s) => s.name).join(", ")})
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-ink-faint">
                      Staff
                    </th>
                    {DAY_LABELS.map((day) => (
                      <th key={day} className="px-2 py-1.5 text-center font-medium text-ink-faint">
                        {day}
                      </th>
                    ))}
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map(([staffId, { name, entries }]) => {
                    const byDay = new Map<number, SubmissionEntry[]>();
                    for (const e of entries) {
                      const list = byDay.get(e.day_index) ?? [];
                      list.push(e);
                      byDay.set(e.day_index, list);
                    }
                    return (
                      <tr key={staffId} className="border-t border-surface-page">
                        <td className="whitespace-nowrap px-2 py-2 font-medium text-ink-label">{name}</td>
                        {DAY_LABELS.map((_, dayIndex) => {
                          const dayEntries = byDay.get(dayIndex) ?? [];
                          const note = dayEntries.find((e) => e.note)?.note;
                          return (
                            <td key={dayIndex} className="px-2 py-2 text-center align-top">
                              {/* A deterministic column, not a wrap: shift one
                                  is always the top badge in every cell of the
                                  table, so a column can be read straight down.
                                  Wrapping put them side by side or stacked
                                  depending on available width. */}
                              <div className="flex flex-col items-center gap-1">
                                {/* Iterating the venue's shifts rather than the
                                    submitted rows keeps every cell in the same
                                    order and the same width, and gives a slot
                                    the staff member never answered somewhere to
                                    show as a dash — which is a different thing
                                    from an explicit "can't work". */}
                                {shifts.map((shift) => {
                                  const entry = dayEntries.find(
                                    (e) => e.shift_id === shift.id && e.status > 0,
                                  );
                                  const style = entry ? STATUS_STYLE[entry.status] : undefined;
                                  if (!entry || !style) {
                                    return (
                                      <span
                                        key={shift.id}
                                        title={`${shift.name} — no answer`}
                                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-dashed border-hairline px-1 text-[11px] text-ink-faint"
                                      >
                                        –
                                      </span>
                                    );
                                  }
                                  return (
                                    <span
                                      key={shift.id}
                                      title={`${shift.name} — ${style.label.toLowerCase()}`}
                                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border px-1.5 text-[10px] font-medium ${style.bg} ${style.border} ${style.text}`}
                                    >
                                      {abbreviate(shift.name)}
                                    </span>
                                  );
                                })}
                                {note && (
                                  <span
                                    title={note}
                                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-hairline bg-surface-subtle px-1 text-[11px] text-ink-faint"
                                  >
                                    📝
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => onRequestClear(staffId, name)}
                            disabled={clearingId === staffId}
                            className="whitespace-nowrap rounded-lg bg-surface-subtle px-2.5 py-1.5 text-[11px] font-medium text-unavail-text disabled:opacity-50"
                          >
                            {clearingId === staffId ? "Clearing…" : "Clear"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
