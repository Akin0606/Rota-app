"use client";

import { useEffect, useState } from "react";

import Icon from "@/components/staff/icon";
import Modal from "@/components/modal";
import { Activity, getStaffActivity } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

function lastSeenKey(venueToken: string): string {
  // localStorage, not sessionStorage — the PIN itself clears per-session by
  // design, but a "last seen" marker needs to survive the session boundary
  // to mean anything (otherwise every fresh login would show "new").
  return `rota_activity_seen_${venueToken}`;
}

export default function NotificationBell({ venueToken, pin }: { venueToken: string; pin: string }) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (rows: Activity[]) => {
      if (cancelled) return;
      setActivity(rows);
      const lastSeen = localStorage.getItem(lastSeenKey(venueToken));
      const newest = rows[0]?.created_at;
      setHasNew(Boolean(newest) && (!lastSeen || newest > lastSeen));
    };
    // The cached copy paints the bell immediately; the background refresh runs
    // through the same handler, so a new entry still lights the badge.
    getStaffActivity(venueToken, pin, 20, { onRevalidate: apply })
      .then(apply)
      .catch(() => {
        // Best-effort — a failed fetch just means no bell badge, not a
        // blocking error for the rest of the hub.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueToken, pin]);

  function handleOpen() {
    setOpen(true);
    setHasNew(false);
    if (activity[0]) {
      localStorage.setItem(lastSeenKey(venueToken), activity[0].created_at);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label="Recent activity"
        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-accent"
      >
        <Icon name="bell" size={19} />
        {hasNew && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Recent activity">
        {activity.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-muted">Nothing yet.</div>
        ) : (
          <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div>
                  <div className="text-[13px] text-ink-label">{a.detail ?? a.action}</div>
                  <div className="text-[11px] text-ink-faint">{formatRelativeTime(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
