"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { ApiError, authenticatePin } from "@/lib/api";
import { pinStorageKey } from "@/lib/utils";

type Tile = {
  icon: string;
  label: string;
  description: string;
} & ({ href: string } | { comingSoon: true });

const TILES: Tile[] = [
  { icon: "📋", label: "Log Availability", description: "Tell us when you can work", href: "availability" },
  { icon: "📅", label: "View My Rota", description: "See your upcoming shifts", href: "rota" },
  { icon: "🔄", label: "Swap a Shift", description: "Trade a shift with a teammate", comingSoon: true },
  { icon: "🌴", label: "Request Time Off", description: "Ask for a day or week off", comingSoon: true },
  { icon: "❌", label: "Drop a Shift", description: "Give up a shift you can't work", comingSoon: true },
];

export default function StaffHubPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [name, setName] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!pin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    authenticatePin(venue_token, pin)
      .then((res) => {
        setName(res.staff.name.split(" ")[0]);
        setVenueName(res.venue_name);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(pinStorageKey(venue_token));
          router.replace(`/v/${venue_token}?expired=1`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error) return <CenteredMessage>{error}</CenteredMessage>;

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <div className="py-2 pb-6 text-center">
            <div className="text-[22px] font-bold text-ink">
              Hi {name} — {venueName}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {TILES.map((tile) =>
              "href" in tile ? (
                <Link
                  key={tile.label}
                  href={`/v/${venue_token}/${tile.href}`}
                  className="flex items-center gap-3.5 rounded-panel border border-hairline bg-surface-card px-4 py-3.5 transition active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-light text-xl">
                    {tile.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink">{tile.label}</div>
                    <div className="truncate text-xs text-ink-faint">{tile.description}</div>
                  </div>
                  <span className="shrink-0 text-ink-faint">›</span>
                </Link>
              ) : (
                <div
                  key={tile.label}
                  className="flex items-center gap-3.5 rounded-panel border border-hairline bg-surface-card px-4 py-3.5 opacity-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-unset-bg text-xl grayscale">
                    {tile.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink">{tile.label}</div>
                    <div className="truncate text-xs text-ink-faint">{tile.description}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-unset-bg px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                    Coming soon
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
