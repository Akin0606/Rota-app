"use client";

import { useState } from "react";

import type { Shift, SubmissionEntry } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

const STATUS_STYLE: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  1: { bg: "bg-avail-bg", border: "border-avail-border", text: "text-avail-text", icon: "✓" },
  2: { bg: "bg-unavail-bg", border: "border-unavail-border", text: "text-unavail-text", icon: "✕" },
  3: { bg: "bg-preferred-bg", border: "border-preferred-border", text: "text-preferred-text", icon: "★" },
};

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

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

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
        <span className="text-[13px] font-semibold text-ink-label">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-ink-faint">
                      Staff
                    </th>
                    {DAY_LABELS.map((day) => (
                      <th key={day} className="px-2 py-1.5 text-center font-semibold text-ink-faint">
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
                        <td className="whitespace-nowrap px-2 py-2 font-semibold text-ink-label">{name}</td>
                        {DAY_LABELS.map((_, dayIndex) => {
                          const dayEntries = byDay.get(dayIndex) ?? [];
                          const shiftEntries = dayEntries.filter((e) => e.shift_id && e.status > 0);
                          const note = dayEntries.find((e) => e.note)?.note;
                          return (
                            <td key={dayIndex} className="px-2 py-2 text-center align-top">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {shiftEntries.map((e) => {
                                  const shift = shiftsById.get(e.shift_id!);
                                  const style = STATUS_STYLE[e.status];
                                  if (!shift || !style) return null;
                                  return (
                                    <span
                                      key={e.shift_id}
                                      title={shift.name}
                                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border px-1 text-[11px] font-semibold ${style.bg} ${style.border} ${style.text}`}
                                    >
                                      {style.icon}
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
          )}
        </div>
      )}
    </div>
  );
}
