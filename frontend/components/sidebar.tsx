"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Wordmark from "@/components/wordmark";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { key: "rota", label: "Rota", icon: "📅", href: "/rota" },
  { key: "team", label: "Team", icon: "👥", href: "/team" },
  { key: "leave", label: "Leave", icon: "🌴", href: "/leave" },
  { key: "scheduler", label: "Scheduler", icon: "⏱️", href: "/scheduler" },
  { key: "settings", label: "Settings", icon: "⚙️", href: "/settings" },
];

type SidebarProps = {
  venueName?: string;
  managerEmail?: string;
};

export default function Sidebar({ venueName, managerEmail }: SidebarProps) {
  const pathname = usePathname();
  const initials = managerEmail?.[0]?.toUpperCase() ?? "M";

  return (
    <div className="hidden w-60 shrink-0 flex-col gap-1 border-r border-hairline bg-surface-card px-5 py-7 md:flex">
      <div className="mb-7 flex items-center gap-2.5">
        <div>
          <Wordmark className="text-[19px]" />
          <div className="text-[11px] text-ink-faint">{venueName}</div>
        </div>
      </div>

      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-sm ${
              active ? "bg-accent-light font-semibold text-accent" : "font-medium text-ink-muted"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      <div className="flex-1" />

      {managerEmail ? (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-surface-subtle px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-light text-xs font-bold text-accent">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{managerEmail}</div>
            <div className="text-[11px] text-ink-faint">Manager</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
