"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PinAuthData, authenticatePin } from "@/lib/api";
import { formatWeekRange, pinStorageKey } from "@/lib/utils";

export default function SubmittedPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const [data, setData] = useState<PinAuthData | null>(null);

  useEffect(() => {
    const pin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!pin) return;
    authenticatePin(venue_token, pin)
      .then(setData)
      .catch(() => {});
  }, [venue_token]);

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 py-10 text-center">
          <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-avail-bg text-[32px]">
            ✓
          </div>
          <div className="mb-2 text-2xl font-bold text-ink">Submitted!</div>
          <div className="mb-8 text-sm leading-relaxed text-ink-muted">
            {data?.period
              ? `Your availability for ${formatWeekRange(data.period.week_start)} has been sent. You'll get a notification when the rota is published.`
              : "Your availability has been sent. You'll get a notification when the rota is published."}
          </div>
          <Link
            href={`/v/${venue_token}/availability`}
            className="block rounded-input border border-accent-border bg-surface-card py-3 text-center text-sm font-semibold text-accent"
          >
            Edit Availability
          </Link>
          <Link
            href={`/v/${venue_token}/hub`}
            className="mt-4 block text-center text-[13px] font-semibold text-ink-faint"
          >
            ← Hub
          </Link>
        </div>
      </div>
    </div>
  );
}
