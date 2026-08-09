"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AdminActivity, listAdminActivity } from "@/lib/admin-api";
import { formatRelativeTime, startsWithName } from "@/lib/utils";

function prettyAction(action: string): string {
  const label = action.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [venueFilter, setVenueFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    // Filters work over what's already fetched, so pull a deeper batch than
    // the unfiltered default view needs — the endpoint caps at 200.
    listAdminActivity(200)
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

  const venues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of activity) seen.set(a.venue_id, a.venue_name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [activity]);

  const actions = useMemo(() => {
    return Array.from(new Set(activity.map((a) => a.action))).sort();
  }, [activity]);

  const filtered = activity.filter((a) => {
    if (venueFilter !== "all" && a.venue_id !== venueFilter) return false;
    if (actionFilter !== "all" && a.action !== actionFilter) return false;
    return true;
  });

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

      <div className="mb-4 flex flex-wrap gap-2.5">
        <select
          value={venueFilter}
          onChange={(e) => setVenueFilter(e.target.value)}
          className="rounded-[10px] border-[1.5px] border-unset-border bg-surface-card px-3.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
        >
          <option value="all">All venues</option>
          {venues.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-[10px] border-[1.5px] border-unset-border bg-surface-card px-3.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {prettyAction(a)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {activity.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No activity yet.</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No activity matches these filters.</div>
        ) : (
          filtered.map((a, i) => {
            const text = a.detail ?? a.action;
            const showNamePrefix = a.staff_name && !startsWithName(text, a.staff_name);
            return (
              <div
                key={a.id}
                className={`flex items-start gap-3 px-5 py-3.5 ${
                  i < filtered.length - 1 ? "border-b border-surface-page" : ""
                }`}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div className="flex-1">
                  <div className="text-[13px] text-ink-label">
                    <Link href={`/admin/venues/${a.venue_id}`} className="font-semibold text-accent">
                      {a.venue_name}
                    </Link>
                    {" — "}
                    {showNamePrefix && <span className="font-semibold">{a.staff_name} </span>}
                    {text}
                  </div>
                  <div className="text-[11px] text-ink-faint">{formatRelativeTime(a.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
