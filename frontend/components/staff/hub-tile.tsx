import Link from "next/link";

import Icon, { IconName } from "./icon";
import StatusBadge, { StatusTone } from "./status-badge";

type HubTileProps = {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  badge?: string;
  badgeTone?: StatusTone;
};

export function HubTile({ href, icon, title, desc, badge, badgeTone = "accent" }: HubTileProps) {
  return (
    <Link
      href={href}
      className="group cp-hairline relative flex min-h-[128px] flex-col gap-3.5 overflow-hidden rounded-cp-card bg-surface-card p-[18px] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,77,0,0.4)] hover:bg-surface-subtle active:translate-y-0"
    >
      <span className="flex h-[42px] w-[42px] items-center justify-center rounded-cp-control bg-cp-icon text-accent transition-colors duration-[350ms]">
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-medium tracking-[-0.2px] text-ink">{title}</span>
        <span className="mt-[3px] block text-[12px] leading-[1.45] text-ink-muted transition-colors duration-[350ms]">
          {desc}
        </span>
      </span>
      <span className="mt-auto flex items-center gap-1.5">
        {badge && <StatusBadge tone={badgeTone}>{badge}</StatusBadge>}
        <span className="ml-auto text-ink-faint transition-[color,transform] duration-200 group-hover:translate-x-[3px] group-hover:text-accent">
          <Icon name="arrow-right" size={16} />
        </span>
      </span>
    </Link>
  );
}

type PrimaryHubTileProps = {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  /** Small accent line under the description — the availability deadline. */
  note?: React.ReactNode;
  noteIcon?: IconName;
  noteTone?: "accent" | "green";
};

export function PrimaryHubTile({
  href,
  icon,
  title,
  desc,
  note,
  noteIcon = "clock",
  noteTone = "accent",
}: PrimaryHubTileProps) {
  return (
    <Link
      href={href}
      className="group col-span-2 flex items-center gap-3.5 overflow-hidden rounded-cp-card border-[0.5px] border-[rgba(255,77,0,0.25)] bg-accent-light p-[18px] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0"
    >
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-cp-control bg-accent text-white">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium tracking-[-0.2px] text-ink">{title}</span>
        <span className="mt-[3px] block text-[12px] leading-[1.45] text-ink-muted transition-colors duration-[350ms]">
          {desc}
        </span>
        {note && (
          <span
            className={`mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium ${
              noteTone === "green" ? "text-cp-green" : "text-accent"
            }`}
          >
            <Icon name={noteIcon} size={12} />
            {note}
          </span>
        )}
      </span>
      <span className="ml-auto shrink-0 text-accent transition-transform duration-200 group-hover:translate-x-1">
        <Icon name="arrow-right" size={20} />
      </span>
    </Link>
  );
}
