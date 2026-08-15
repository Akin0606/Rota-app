"use client";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import type { RotaOrientation } from "@/components/rota-grid";
import { STATUS_CONFIG } from "@/components/status-banner";
import { DAY_LABELS, compactTimeRange, formatWeekRange } from "@/lib/utils";

type RotaImageViewProps = {
  open: boolean;
  onClose: () => void;
  venueName: string;
  weekStart: string;
  status: string;
  orientation: RotaOrientation;
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  leave: Record<string, number[]>;
};

// Matches the PDF export: a fixed narrow label column, everything else split
// evenly across the remaining columns — never a per-column minimum, so the
// grid always fits its container width with no horizontal scroll.
const LABEL_COL = "52px";

function dateForDay(weekStart: string, dayIndex: number): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.getUTCDate();
}

export default function RotaImageView({
  open,
  onClose,
  venueName,
  weekStart,
  status,
  orientation,
  shifts,
  staff,
  assignments,
  leave,
}: RotaImageViewProps) {
  if (!open) return null;

  const statusLabel = (STATUS_CONFIG[status] ?? STATUS_CONFIG.collecting).label;
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const activeStaff = staff.filter((s) => s.is_active);

  // Same grouping as the on-screen matrix (rota-matrix.tsx) so a printed and
  // screenshotted rota read the same way — role label, U18 tag, dashed
  // "Leave" span for a leave-blocked day with no shift.
  const roleGroups = new Map<string, StaffManager[]>();
  for (const s of activeStaff) {
    const list = roleGroups.get(s.role) ?? [];
    list.push(s);
    roleGroups.set(s.role, list);
  }

  function assignmentFor(staffId: string, dayIndex: number): AssignmentOut | undefined {
    return assignments.find((a) => a.staff_id === staffId && a.day_index === dayIndex);
  }

  function NameLabel({ member }: { member: StaffManager }) {
    return (
      <div className="flex items-center gap-1 truncate text-[10px] font-semibold text-ink-label">
        <span className="truncate">{member.name}</span>
        {member.is_under_18 && (
          <span className="shrink-0 rounded bg-accent-light px-[4px] py-[1px] text-[7px] font-bold text-accent">
            U18
          </span>
        )}
      </div>
    );
  }

  function CellContent({ staffId, dayIndex }: { staffId: string; dayIndex: number }) {
    const a = assignmentFor(staffId, dayIndex);
    const shift = a?.shift_id ? shiftsById.get(a.shift_id) : undefined;
    if (shift) {
      return (
        <div
          className="truncate rounded-md px-1 py-1 text-center text-[10px] font-semibold leading-tight"
          style={{ background: `${shift.color}22`, color: shift.color }}
          title={`${shift.name} ${compactTimeRange(shift.start_time, shift.end_time)}`}
        >
          {shift.name} {compactTimeRange(shift.start_time, shift.end_time)}
        </div>
      );
    }
    if (leave[staffId]?.includes(dayIndex)) {
      return (
        <div className="rounded-md border border-dashed border-hairline px-1 py-1 text-center text-[9px] text-ink-faint">
          Leave
        </div>
      );
    }
    return <div className="min-h-[32px]" />;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface-page">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs text-ink-faint">Tip: take a screenshot to share this rota</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-card hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="rounded-card border border-hairline bg-surface-card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-ink">{venueName}</div>
              <div className="text-sm font-semibold text-ink-muted">{formatWeekRange(weekStart)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{statusLabel}</div>
              <div className="mt-1 text-sm font-bold text-accent">crewplan.</div>
            </div>
          </div>

          {orientation === "staff-rows" ? (
            <div>
              <div
                className="grid border-b border-surface-page"
                style={{ gridTemplateColumns: `${LABEL_COL} repeat(7, 1fr)` }}
              >
                <div />
                {DAY_LABELS.map((d, i) => (
                  <div key={d} className="min-w-0 border-l border-surface-page px-0.5 py-2 text-center">
                    <div className="truncate text-[9px] font-semibold uppercase text-ink-faint">{d}</div>
                    <div className="text-xs font-bold text-ink">{dateForDay(weekStart, i)}</div>
                  </div>
                ))}
              </div>
              {Array.from(roleGroups.entries()).map(([role, members]) => (
                <div key={role}>
                  <div className="px-0.5 pb-1 pt-2.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
                    {role}
                  </div>
                  {members.map((member, ri) => (
                    <div
                      key={member.id}
                      className="grid"
                      style={{ gridTemplateColumns: `${LABEL_COL} repeat(7, 1fr)` }}
                    >
                      <div className={`min-w-0 flex items-center p-1 ${ri < members.length - 1 ? "border-b border-surface-page" : ""}`}>
                        <NameLabel member={member} />
                      </div>
                      {DAY_LABELS.map((_, di) => (
                        <div
                          key={di}
                          className={`min-w-0 flex min-h-[34px] flex-col justify-center border-l border-surface-page p-0.5 ${ri < members.length - 1 ? "border-b border-surface-page" : ""}`}
                        >
                          <CellContent staffId={member.id} dayIndex={di} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div
                className="grid border-b border-surface-page"
                style={{ gridTemplateColumns: `${LABEL_COL} repeat(${activeStaff.length}, 1fr)` }}
              >
                <div />
                {activeStaff.map((member) => (
                  <div key={member.id} className="min-w-0 border-l border-surface-page px-0.5 py-2 text-center">
                    <div className="mx-auto flex w-fit items-center gap-1 truncate text-[10px] font-semibold text-ink-label">
                      <span className="truncate">{member.name}</span>
                      {member.is_under_18 && (
                        <span className="shrink-0 rounded bg-accent-light px-[4px] py-[1px] text-[7px] font-bold text-accent">
                          U18
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {DAY_LABELS.map((d, di) => (
                <div
                  key={d}
                  className="grid"
                  style={{ gridTemplateColumns: `${LABEL_COL} repeat(${activeStaff.length}, 1fr)` }}
                >
                  <div className={`min-w-0 flex items-center gap-1 p-1 ${di < DAY_LABELS.length - 1 ? "border-b border-surface-page" : ""}`}>
                    <div className="truncate text-[9px] font-semibold uppercase text-ink-faint">{d}</div>
                  </div>
                  {activeStaff.map((member) => (
                    <div
                      key={member.id}
                      className={`min-w-0 flex min-h-[34px] flex-col justify-center border-l border-surface-page p-0.5 ${di < DAY_LABELS.length - 1 ? "border-b border-surface-page" : ""}`}
                    >
                      <CellContent staffId={member.id} dayIndex={di} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
