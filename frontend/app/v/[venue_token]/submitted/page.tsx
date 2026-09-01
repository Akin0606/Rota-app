"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { formatWeekRange } from "@/lib/utils";

export default function SubmittedPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  // A6 — the week comes from the submit that got us here. This used to re-fetch
  // /auth purely to name it, which named the server's *current* period instead:
  // submit the "Next week" tab and the confirmation congratulated you on this
  // week. The page has no other use for that payload, so the call is gone.
  const [week, setWeek] = useState<string | null>(null);

  useEffect(() => {
    setWeek(new URLSearchParams(window.location.search).get("week"));
  }, []);

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
          {week
            ? `Your availability for ${formatWeekRange(week)} has been sent. You'll get a notification when the rota is published.`
            : "Your availability has been sent. You'll get a notification when the rota is published."}
        </div>
        <Link
          href={`/v/${venue_token}/availability${week ? `?week=${week}` : ""}`}
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
