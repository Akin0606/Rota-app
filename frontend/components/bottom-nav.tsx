"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { key: "rota", label: "Rota", icon: "📅", href: "/rota" },
  { key: "team", label: "Team", icon: "👥", href: "/team" },
  { key: "scheduler", label: "Scheduler", icon: "⏱️", href: "/scheduler" },
  { key: "settings", label: "Settings", icon: "⚙️", href: "/settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-unset-border bg-surface-card pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link key={item.key} href={item.href} className="flex flex-col items-center gap-0.5 py-2.5">
            <span className="text-xl">{item.icon}</span>
            <span className={`text-[10px] ${active ? "font-bold text-accent" : "font-medium text-ink-faint"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
