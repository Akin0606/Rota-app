"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { AdminActivity, listAdminActivity } from "@/lib/admin-api";
import { formatRelativeTime } from "@/lib/utils";

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAdminActivity(50)
      .then((res) => {
        if (!cancelled) setActivity(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load activity.</div>;
  }

  return (
    <div>
      <div className="mb-6 text-2xl font-bold text-ink">Activity (last {activity.length})</div>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {activity.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No activity yet.</div>
        ) : (
          activity.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 px-5 py-3.5 ${
                i < activity.length - 1 ? "border-b border-surface-page" : ""
              }`}
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="flex-1">
                <div className="text-[13px] text-ink-label">
                  <Link href={`/admin/venues/${a.venue_id}`} className="font-semibold text-accent">
                    {a.venue_name}
                  </Link>
                  {" — "}
                  {a.staff_name && <span className="font-semibold">{a.staff_name} </span>}
                  {a.detail ?? a.action}
                </div>
                <div className="text-[11px] text-ink-faint">{formatRelativeTime(a.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
