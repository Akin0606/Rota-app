import Link from "next/link";

import Icon from "./icon";

export default function BackButton({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      // hover:!text-accent because globals.css has a bare `a:hover` rule that
      // ties on specificity and wins on source order.
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-[color,transform] duration-150 active:scale-[0.96] hover:!text-accent"
    >
      <Icon name="arrow-left" size={15} />
      {label}
    </Link>
  );
}
