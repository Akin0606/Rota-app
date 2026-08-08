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
};

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
}: RotaImageViewProps) {
  if (!open) return null;

  const statusLabel = (STATUS_CONFIG[status] ?? STATUS_CONFIG.collecting).label;
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const activeStaff = staff.filter((s) => s.is_active);

  function assignmentFor(staffId: string, dayIndex: number): AssignmentOut | undefined {
    return assignments.find((a) => a.staff_id === staffId && a.day_index === dayIndex);
  }

  function CellContent({ staffId, dayIndex }: { staffId: string; dayIndex: number }) {
    const a = assignmentFor(staffId, dayIndex);
    const shift = a?.shift_id ? shiftsById.get(a.shift_id) : undefined;
    if (!shift) return <div className="min-h-[40px]" />;
    return (
      <div
        className="rounded-md px-2 py-1.5 text-[11px] font-semibold leading-tight"
        style={{ background: `${shift.color}22`, color: shift.color }}
      >
        {shift.name} {compactTimeRange(shift.start_time, shift.end_time)}
      </div>
    );
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
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-[100px_repeat(7,minmax(90px,1fr))] border-b border-surface-page">
                  <div />
                  {DAY_LABELS.map((d, i) => (
                    <div key={d} className="border-l border-surface-page px-1.5 py-2 text-center">
                      <div className="text-[10px] font-semibold uppercase text-ink-faint">{d}</div>
                      <div className="text-sm font-bold text-ink">{dateForDay(weekStart, i)}</div>
                    </div>
                  ))}
                </div>
                {activeStaff.map((member, ri) => (
                  <div
                    key={member.id}
                    className={`grid grid-cols-[100px_repeat(7,minmax(90px,1fr))] ${ri < activeStaff.length - 1 ? "border-b border-surface-page" : ""}`}
                  >
                    <div className="flex flex-col justify-center p-2">
                      <div className="truncate text-xs font-semibold text-ink-label">{member.name}</div>
                      <div className="truncate text-[10px] text-ink-faint">{member.role}</div>
                    </div>
                    {DAY_LABELS.map((_, di) => (
                      <div key={di} className="flex min-h-[44px] flex-col justify-center border-l border-surface-page p-1">
                        <CellContent staffId={member.id} dayIndex={di} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${120 + activeStaff.length * 110}px` }}>
                <div
                  className="grid border-b border-surface-page"
                  style={{ gridTemplateColumns: `100px repeat(${activeStaff.length}, minmax(90px, 1fr))` }}
                >
                  <div />
                  {activeStaff.map((member) => (
                    <div key={member.id} className="border-l border-surface-page px-1.5 py-2 text-center">
                      <div className="truncate text-xs font-semibold text-ink-label">{member.name}</div>
                      <div className="truncate text-[10px] text-ink-faint">{member.role}</div>
                    </div>
                  ))}
                </div>
                {DAY_LABELS.map((d, di) => (
                  <div
                    key={d}
                    className={`grid ${di < DAY_LABELS.length - 1 ? "border-b border-surface-page" : ""}`}
                    style={{ gridTemplateColumns: `100px repeat(${activeStaff.length}, minmax(90px, 1fr))` }}
                  >
                    <div className="flex items-center gap-1.5 p-2">
                      <div className="text-[10px] font-semibold uppercase text-ink-faint">{d}</div>
                      <div className="text-sm font-bold text-ink">{dateForDay(weekStart, di)}</div>
                    </div>
                    {activeStaff.map((member) => (
                      <div key={member.id} className="flex min-h-[44px] flex-col justify-center border-l border-surface-page p-1">
                        <CellContent staffId={member.id} dayIndex={di} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
