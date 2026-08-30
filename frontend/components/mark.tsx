/**
 * The Rotally wheel — one arc of seven. Seven segments = the days of a week;
 * `rota` is Latin for wheel. This is the only place the brand orange appears.
 *
 * The viewBox is cropped to the circle's true bounds (55..457 of the 512 grid).
 * The full grid carries 10.7% dead padding a side, which forces callers into
 * negative margins that then collide with letter-spacing — see Wordmark.
 *
 * `spinning` rotates it as a loading indicator, which is what a wheel is for.
 */
export default function Mark({
  className = "",
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="55 55 402 402"
      className={`block ${spinning ? "cp-wheel-spin" : ""} ${className}`}
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
          stroke="var(--c-mark)"
          strokeWidth="62"
          strokeDasharray="112.59 955.55"
          strokeDashoffset="-610.37"
        />
      </g>
    </svg>
  );
}
