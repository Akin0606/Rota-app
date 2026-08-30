"use client";

import { useEffect, useState } from "react";
import Mark from "@/components/mark";

// A loading indicator that, after a few seconds, honestly explains the Render
// free-tier cold start instead of looking frozen.
export default function LoadingScreen({
  base = "Loading…",
  className = "min-h-[60vh]",
}: {
  base?: string;
  className?: string;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${className}`}>
      <Mark spinning className="h-6 w-6 text-ink-faint" />
      <div className="text-sm text-ink-muted">{base}</div>
      {slow && (
        <div className="max-w-[320px] text-[13px] leading-relaxed text-ink-faint">
          Waking up your rota… this can take up to a minute the first time after a quiet spell.
        </div>
      )}
    </div>
  );
}
