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
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-accent" />
        <div className="text-sm text-ink-muted">Loading activity…</div>
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load activity.</div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <div className="text-[13px] font-medium text-ink-faint">Across every venue</div>
        <div className="font-display text-[26px] font-bold text-ink md:text-[28px]">
          Activity (last {activity.length})
        </div>
      </div>
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
