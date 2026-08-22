import StaffBottomNav from "./bottom-nav";
import Icon from "./icon";

// Layout chrome shared by all six authenticated staff screens. `.cp-staff` is
// what swaps the whole colour system over to the staff palette (see
// globals.css) — every staff page must render inside one. It also hosts the
// persistent bottom tab bar: rendering the nav here (rather than a route-group
// layout) is the only place that matches the client-side PIN auth model — the
// entry/PIN and forgot-pin screens hand-roll their own .cp-staff wrapper and
// never touch StaffScreen, so they stay nav-free by construction.
//
// `hideNav` is the escape hatch for a StaffScreen that is a confirmation/dead
// end rather than a tab surface (e.g. a post-submit screen).
export default function StaffScreen({
  children,
  hideNav = false,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="cp-staff min-h-screen bg-surface-page text-ink">
      {/* Bottom clearance = tab bar (56px) + a little breathing room + safe
          area, so the last card never sits under the fixed nav. */}
      <div className="mx-auto w-full max-w-[440px] px-[22px] pb-[calc(64px+env(safe-area-inset-bottom))] pt-6">
        <div className="cp-screen-enter pb-[26px]">{children}</div>
      </div>
      {!hideNav && <StaffBottomNav />}
    </div>
  );
}

// Left slot (back button, or a greeting on the hub) with the mode toggle
// pinned right.
export function StaffTopBar({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">{left}</div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint transition-colors duration-[350ms] ${className}`}
    >
      {children}
    </div>
  );
}

export function ScreenTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[23px] font-medium leading-tight tracking-[-0.5px] text-ink">{title}</div>
      {sub && (
        <div className="mt-1 text-[13px] text-ink-muted transition-colors duration-[350ms]">{sub}</div>
      )}
    </div>
  );
}

// The small centred hint that closes several screens ("Tap a shift to drop,
// give or swap it").
export function FootNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[18px] flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-muted transition-colors duration-[350ms]">
      <Icon name="info-circle" size={12} />
      <span>{children}</span>
    </div>
  );
}
