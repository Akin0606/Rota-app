"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import ManagerIcon, { ManagerIconName } from "@/components/manager/icon";
import Wordmark from "@/components/wordmark";

import ModeToggle from "./mode-toggle";

// All six manager destinations. Responsive nav: on laptop/web the tabs sit in
// the top bar (a horizontal web nav); on mobile they drop to a fixed bottom tab
// bar (icon + label) that reads like a native app. The switch is at `md` — the
// same breakpoint every manager page already uses to drop its bottom-nav
// clearance (`pb-24 md:pb-8`) and widen its padding, so the two stay in lockstep.
const TABS: { label: string; href: string; icon: ManagerIconName }[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Rota", href: "/rota", icon: "table" },
  { label: "Scheduler", href: "/scheduler", icon: "calendar-bolt" },
  { label: "Staff", href: "/team", icon: "users" },
  { label: "Leave", href: "/leave", icon: "calendar-off" },
  { label: "Settings", href: "/settings", icon: "sliders" },
];

export default function ManagerNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <>
      {/* Top bar — wordmark always; tabs inline on laptop/web (md+). */}
      <div className="sticky top-0 z-30 border-b border-hairline bg-surface-page">
        <div className="flex items-center gap-6 px-5 py-3.5 md:px-8">
          <Wordmark className="!font-semibold text-[17px]" />
          <nav className="scrollbar-none hidden flex-1 items-center gap-0.5 overflow-x-auto md:flex">
            {TABS.map((t) => {
              const active = isActive(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    active ? "bg-accent text-white" : "text-ink-muted hover:!text-ink"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto md:ml-0">
            <ModeToggle />
          </div>
        </div>
      </div>

      {/* Bottom tab bar — mobile only; hidden on laptop/web (md+). */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface-page md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[460px] items-stretch justify-around">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-ink-faint hover:!text-ink"
                }`}
              >
                <ManagerIcon name={t.icon} size={22} strokeWidth={active ? 2 : 1.75} />
                <span className="leading-none">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
