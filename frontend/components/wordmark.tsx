/**
 * The Rotally wordmark — "rotally" with the seven-segment wheel standing in for
 * the o, and the "lly" in the accent.
 *
 * Polarity is automatic and must stay that way: the letters take `--c-ink` and
 * the accent takes `--c-accent`, both of which already flip per theme, so the
 * mark is dark-on-light and light-on-dark without any caller having to choose.
 * The wheel's unfilled track is `currentColor` at low opacity for the same
 * reason — a hardcoded grey would be wrong in one theme or the other.
 *
 * The wheel is one arc of seven. Seven segments = the days of a week; `rota` is
 * Latin for wheel. Sized in `em` so it scales with whatever font-size is set.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="rotally"
      className={`inline-flex items-center whitespace-nowrap font-mark font-bold tracking-[-0.05em] leading-none text-ink ${className}`}
    >
      r
      <svg
        aria-hidden="true"
        viewBox="0 0 512 512"
        className="mx-[-0.06em] block h-[0.86em] w-[0.86em]"
      >
        <g transform="rotate(-90 256 256)" fill="none">
          <circle
            cx="256"
            cy="256"
            r="170"
            stroke="currentColor"
            strokeOpacity="0.28"
            strokeWidth="62"
            strokeDasharray="112.59 40"
          />
          <circle
            cx="256"
            cy="256"
            r="170"
            stroke="var(--c-accent)"
            strokeWidth="62"
            strokeDasharray="112.59 955.55"
            strokeDashoffset="-610.37"
          />
        </g>
      </svg>
      ta<span className="text-accent">lly</span>
    </span>
  );
}
