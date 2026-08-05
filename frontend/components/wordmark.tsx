// The Crewplan wordmark — "crewplan" with an orange full stop, in the display
// font. Matches the marketing landing's logo.
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-[-0.03em] text-ink ${className}`}>
      crewplan<span className="text-accent">.</span>
    </span>
  );
}
