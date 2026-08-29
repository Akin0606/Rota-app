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
 *
 * Two things here are measured against Archivo's real metrics, not guessed:
 *
 * 1. The viewBox is cropped to the circle's true bounds (55..457 of the 512
 *    grid). A full-grid viewBox carries 10.7% dead padding a side, which reads
 *    as "r o tally"; cancelling that with a negative margin stacks with the
 *    container's -0.05em tracking and the r collides with the wheel. Cropped,
 *    the mark has honest metrics and takes a normal positive sidebearing.
 * 2. `align-items: center` centres the wheel on the line box, but a lowercase
 *    o lives on the x-height band — measured 0.0625em higher than it should
 *    be. translateY seats it without disturbing the line box.
 *
 * The sidebearings are asymmetric on purpose: r and t have different right/left
 * sidebearings, so equal margins produce unequal optical gaps. 0.025em left /
 * 0.02em right lands both ink gaps on 0.030em.
 *
 * All three constants are Archivo-specific (x-height 0.529em) and assume the
 * leading-none line-height set below. Re-measure if either changes.
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
        viewBox="55 55 402 402"
        className="ml-[0.025em] mr-[0.02em] block h-[0.675em] w-[0.675em] translate-y-[0.0625em]"
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
