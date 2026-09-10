"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminAudit, listAdminAudit } from "@/lib/admin-api";
import { formatRelativeTime } from "@/lib/utils";
import Mark from "@/components/mark";

function prettyAction(action: string): string {
  const label = action.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Tone by how sensitive the action is: comp/uncomp/trial are billing (accent),
// delete/impersonation are the high-risk ones (red), the rest neutral.
function dotClass(action: string): string {
  if (action === "venue_deleted" || action === "support_login_link") return "bg-unavail-text";
  if (action.startsWith("venue_comp") || action === "venue_uncomped" || action === "trial_end_changed")
    return "bg-accent";
  return "bg-ink-faint";
}

export default function AdminAuditPage() {
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    listAdminAudit(200)
      .then((res) => {
        if (!cancelled) setAudit(res);
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

  const actions = useMemo(
    () => Array.from(new Set(audit.map((a) => a.action))).sort(),
    [audit],
  );

  const filtered = audit.filter((a) => actionFilter === "all" || a.action === actionFilter);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Mark spinning className="h-6 w-6 text-ink-faint" />
        <div className="text-sm text-ink-muted">Loading admin log…</div>
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load the admin log.</div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-2">
        <div className="text-[13px] font-medium text-ink-faint">Admin actions, oldest survives a delete</div>
        <div className="font-display text-[26px] font-bold text-ink md:text-[28px]">Admin log</div>
      </div>
      <div className="mb-5 text-[13px] text-ink-muted">
        Comps, trial edits, exports, support logins and deletes. The only accountability trail while
        the console runs on a single shared key — it records what was done to which venue, not which
        admin.
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
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
        {audit.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No admin actions logged yet.</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">Nothing matches this filter.</div>
        ) : (
          filtered.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 px-5 py-3.5 ${
                i < filtered.length - 1 ? "border-b border-surface-page" : ""
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass(a.action)}`} />
              <div className="flex-1">
                <div className="text-[13px] text-ink-label">
                  <span className="font-semibold text-ink">
                    {a.target_venue_name ?? a.target_email ?? "Unknown venue"}
                  </span>
                  {" — "}
                  {a.detail ?? prettyAction(a.action)}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {prettyAction(a.action)} · {formatRelativeTime(a.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
