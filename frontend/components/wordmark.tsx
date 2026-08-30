import Mark from "@/components/mark";

/**
 * The Rotally wordmark — "rotally" with the seven-segment wheel standing in for
 * the o, and the "lly" in the brand orange.
 *
 * Polarity is automatic and must stay that way: the letters take `--c-ink`,
 * which already flips per theme, so the mark is dark-on-light and light-on-dark
 * without any caller choosing. The wheel's unfilled track is `currentColor` at
 * low opacity for the same reason.
 *
 * Sidebearings are asymmetric on purpose — r and t have different sidebearings,
 * so equal margins give unequal optical gaps. The `max(…, 1px)` floor matters:
 * in em alone the gap is sub-pixel below ~18px and rounds away, which reads as
 * the r touching the wheel. Constants are Archivo-specific and assume the
 * leading-none line-height set here.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="rotally"
      className={`inline-flex items-center whitespace-nowrap font-mark font-bold tracking-[-0.05em] leading-none text-ink ${className}`}
    >
      r
      <Mark className="ml-[max(0.105em,2px)] mr-[max(0.09em,2px)] h-[0.675em] w-[0.675em] translate-y-[0.0625em]" />
      ta<span className="text-mark">lly</span>
    </span>
  );
}
