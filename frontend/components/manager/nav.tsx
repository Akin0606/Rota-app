"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Wordmark from "@/components/wordmark";

import ModeToggle from "./mode-toggle";

// All six manager destinations, styled as the reference's horizontal tab bar.
// The reference mockup shows four (Rota / Scheduler / Staff / Settings); the
// user asked to keep Dashboard and Leave too, so the bar scrolls horizontally
// on narrow screens rather than dropping anything.
const TABS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Rota", href: "/rota" },
  { label: "Scheduler", href: "/scheduler" },
  { label: "Staff", href: "/team" },
  { label: "Leave", href: "/leave" },
  { label: "Settings", href: "/settings" },
];

export default function ManagerNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 bg-surface-page">
      <div className="flex items-center justify-between border-b border-hairline px-5 pb-3 pt-[18px]">
        <Wordmark className="!font-semibold text-[17px]" />
        <ModeToggle />
      </div>
      <div className="scrollbar-none flex gap-0.5 overflow-x-auto px-4 pb-2 pt-3">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(`${t.href}/`);
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
      </div>
    </div>
  );
}
