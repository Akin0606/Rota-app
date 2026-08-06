"use client";

import type { AdminVenueRota } from "@/lib/admin-api";
import { DAY_LABELS, compactTimeRange } from "@/lib/utils";

// Read-only rota grid for the admin console: staff (rows) × days (columns),
// each cell showing the assigned shift name + time range. No editing controls.
export default function AdminRotaView({ rota }: { rota: AdminVenueRota }) {
  const { shifts, staff, summary } = rota;
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const assignments = summary?.assignments ?? [];

  // Map "staffId:dayIndex" -> shiftId for quick lookup.
  const cell = new Map<string, string>();
  for (const a of assignments) {
    if (a.shift_id) cell.set(`${a.staff_id}:${a.day_index}`, a.shift_id);
  }

  if (staff.length === 0) {
    return <div className="p-6 text-center text-sm text-ink-faint">No active staff to show.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface-card px-3 py-2 text-left font-semibold text-ink-label">
              Staff
            </th>
            {DAY_LABELS.map((d, i) => (
              <th key={i} className="px-2 py-2 text-center font-semibold text-ink-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id} className="border-t border-surface-page">
              <td className="sticky left-0 z-10 bg-surface-card px-3 py-2 font-medium text-ink">
                {member.name}
              </td>
              {DAY_LABELS.map((_, dayIndex) => {
                const shiftId = cell.get(`${member.id}:${dayIndex}`);
                const shift = shiftId ? shiftById.get(shiftId) : undefined;
                return (
                  <td key={dayIndex} className="px-1.5 py-1.5 text-center">
                    {shift ? (
                      <span
                        className="inline-block rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                        style={{ background: shift.color }}
                      >
                        {shift.name} {compactTimeRange(shift.start_time, shift.end_time)}
                      </span>
                    ) : (
                      <span className="text-ink-faint">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
