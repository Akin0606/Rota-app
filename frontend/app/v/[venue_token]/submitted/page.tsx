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
    <div className="cp-staff min-h-screen bg-surface-page text-ink">
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center px-[22px] py-10 text-center">
        {/* The earned beat — the success check pops in once when the screen
            lands, the same overshoot the onboarding solve uses. Reduced motion
            collapses it to a plain appearance (handled globally for .cp-staff). */}
        <div className="cp-pop-in mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-cp-green-soft text-cp-green">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5l10 -10" />
          </svg>
        </div>
        <div className="mb-2 text-2xl font-medium text-ink">Submitted</div>
        <div className="mb-8 max-w-[300px] text-sm leading-relaxed text-ink-muted">
          {data?.period
            ? `Your availability for ${formatWeekRange(data.period.week_start)} has been sent. You'll get a notification when the rota is published.`
            : "Your availability has been sent. You'll get a notification when the rota is published."}
        </div>
        <Link
          href={`/v/${venue_token}/availability`}
          className="cp-hairline block w-full max-w-[300px] rounded-cp-control py-3.5 text-center text-sm font-medium text-accent transition-transform duration-150 active:scale-[0.99]"
        >
          Edit availability
        </Link>
        <Link
          href={`/v/${venue_token}/hub`}
          className="mt-4 text-[13px] font-medium text-ink-muted transition-colors hover:!text-accent"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
