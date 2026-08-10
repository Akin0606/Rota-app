"use client";

import BackButton from "@/components/staff/back-button";
import ModeToggle from "@/components/staff/mode-toggle";
import StaffScreen, { ScreenTitle, StaffTopBar } from "@/components/staff/screen";

// Placeholder. The real "My hours" screen (hero total + pay estimate,
// progress-to-target, shift breakdown) lands in its own batch — this exists so
// the hub's fifth tile navigates somewhere real in the meantime.
export default function StaffHoursPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />
      <div className="mb-5 mt-4">
        <ScreenTitle title="Your hours" sub="Weekly total and pay estimate" />
      </div>
      <div className="cp-hairline rounded-cp-card bg-surface-card p-6 text-center">
        <div className="text-[15px] font-medium text-ink">Coming shortly</div>
        <div className="mt-1.5 text-[13px] leading-[1.45] text-ink-muted">
          This screen is being built. Your shifts are on the My shifts tab in the meantime.
        </div>
      </div>
    </StaffScreen>
  );
}
