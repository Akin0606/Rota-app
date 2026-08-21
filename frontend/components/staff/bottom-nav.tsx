"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon, { IconName } from "./icon";

// Persistent bottom tab bar for the staff PWA — the app-style navigation the
// staff app moved to (replacing the old hub-and-spoke + BackButton model).
// Mirrors the manager bottom nav (components/manager/nav.tsx) on the .cp-staff
// palette. It must render inside a .cp-staff root (it does — StaffScreen hosts
// it) or the colour utilities resolve to the wrong palette.
//
// Five destinations, the app's whole task surface. Hours is deliberately NOT a
// tab (it's passive glance info, folded into Home); when the user is on /hours
// no tab is highlighted, which is correct.
const TABS: { label: string; segment: string; icon: IconName }[] = [
  { label: "Home", segment: "hub", icon: "home" },
  { label: "Shifts", segment: "rota", icon: "calendar-week" },
  { label: "Availability", segment: "availability", icon: "calendar-plus" },
  { label: "Swap", segment: "drop", icon: "arrows-exchange" },
  { label: "Time off", segment: "leave", icon: "beach" },
];

export default function StaffBottomNav() {
  const pathname = usePathname() ?? "";

  // Recover the venue token from the path — the same regex the pre-paint theme
  // script uses (app/layout.tsx). Everything hangs off the [venue_token]
  // dynamic segment, so hrefs and active state are both derived from it.
  const match = pathname.match(/^\/v\/([^/]+)/);
  if (!match) return null;
  const token = match[1];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface-page"
      style={{
        borderTop: "0.5px solid var(--c-hairline)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[440px] items-stretch justify-around">
        {TABS.map((t) => {
          const href = `/v/${token}/${t.segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={t.segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium leading-none transition-colors ${
                active ? "text-accent" : "text-ink-muted"
              }`}
            >
              <Icon name={t.icon} size={22} strokeWidth={active ? 2 : 1.75} />
              <span className="whitespace-nowrap">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
