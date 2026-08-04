"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import StatusBanner from "@/components/status-banner";
import { AdminVenue, listAdminVenues } from "@/lib/admin-api";

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAdminVenues()
      .then((res) => {
        if (!cancelled) setVenues(res);
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
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load venues.</div>;
  }

  return (
    <div>
      <div className="mb-6 text-2xl font-bold text-ink">Venues ({venues.length})</div>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {venues.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No venues yet.</div>
        ) : (
          venues.map((v, i) => (
            <Link
              key={v.id}
              href={`/admin/venues/${v.id}`}
              className={`flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-subtle ${
                i < venues.length - 1 ? "border-b border-surface-page" : ""
              }`}
            >
              <div className="min-w-[180px] flex-1">
                <div className="text-sm font-semibold text-ink">{v.name}</div>
                <div className="text-xs text-ink-faint">{v.manager_email}</div>
              </div>
              <div className="w-32 text-xs text-ink-muted">
                {new Date(v.created_at).toLocaleDateString()}
              </div>
              <div className="w-20 text-xs text-ink-muted">{v.staff_count} staff</div>
              <div className="w-40">
                {v.period_status ? (
                  <StatusBanner status={v.period_status} />
                ) : (
                  <span className="text-xs text-ink-faint">No period</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
