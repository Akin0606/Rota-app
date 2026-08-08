"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  ApiError,
  StaffRota,
  StaffRotaAssignment,
  SwapForStaff,
  acceptGive,
  acceptSwap,
  authenticatePin,
  declineGive,
  declineSwap,
  getStaffRota,
} from "@/lib/api";
import { DAY_NAMES, pinStorageKey } from "@/lib/utils";

type Tile = {
  icon: string;
  label: string;
  description: string;
} & ({ href: string } | { comingSoon: true });

const TILES: Tile[] = [
  { icon: "📋", label: "Log Availability", description: "Tell us when you can work", href: "availability" },
  { icon: "📅", label: "View My Rota", description: "See your upcoming shifts", href: "rota" },
  { icon: "🌴", label: "Request Time Off", description: "Ask for a day or week off", comingSoon: true },
  // Drop, Give, and Swap all live on the Drop page — one entry tile covers
  // all three, same as Give never got its own tile.
  { icon: "❌", label: "Drop or Swap a Shift", description: "Give up, give away, or trade a shift", href: "drop" },
];

export default function StaffHubPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [rota, setRota] = useState<StaffRota | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<StaffRotaAssignment | null>(null);
  const [resolving, setResolving] = useState(false);

  const [acceptSwapTarget, setAcceptSwapTarget] = useState<SwapForStaff | null>(null);
  const [resolvingSwap, setResolvingSwap] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    authenticatePin(venue_token, storedPin)
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

    // Best-effort: a pending give banner is a nice-to-have, not core to the
    // hub loading — no published rota yet just means no banner.
    getStaffRota(venue_token, storedPin)
      .then(setRota)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function confirmAccept() {
    if (!pin || !acceptTarget) return;
    setResolving(true);
    try {
      const result = await acceptGive(venue_token, pin, acceptTarget.id);
      if (result.rota) setRota(result.rota);
      setAcceptTarget(null);
      if (result.status === "approved") {
        showToast("You're on this shift!");
      } else {
        showToast(`Sent for manager approval${result.reason ? ` (${result.reason})` : ""}`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not accept this shift");
    } finally {
      setResolving(false);
    }
  }

  async function handleDecline(a: StaffRotaAssignment) {
    if (!pin) return;
    setResolving(true);
    try {
      const result = await declineGive(venue_token, pin, a.id);
      setRota(result);
      showToast("Declined — the shift stays with them");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not decline this shift");
    } finally {
      setResolving(false);
    }
  }

  async function confirmAcceptSwap() {
    if (!pin || !acceptSwapTarget) return;
    setResolvingSwap(true);
    try {
      const result = await acceptSwap(venue_token, pin, acceptSwapTarget.id);
      if (result.rota) setRota(result.rota);
      setAcceptSwapTarget(null);
      if (result.status === "approved") {
        showToast("Swap complete — you're on the new shift!");
      } else {
        showToast(`Sent for manager approval${result.reason ? ` (${result.reason})` : ""}`);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not accept this swap");
    } finally {
      setResolvingSwap(false);
    }
  }

  async function handleDeclineSwap(swap: SwapForStaff) {
    if (!pin) return;
    setResolvingSwap(true);
    try {
      const result = await declineSwap(venue_token, pin, swap.id);
      setRota(result);
      showToast("Declined — both shifts stay as they are");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not decline this swap");
    } finally {
      setResolvingSwap(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error) return <CenteredMessage>{error}</CenteredMessage>;

  const pendingGive = rota?.assignments.find(
    (a) => a.target_staff_id === rota.staff_id && a.drop_status === "pending_pickup",
  );
  const giveShift = pendingGive ? rota?.shifts.find((s) => s.id === pendingGive.shift_id) : null;
  const giverName = pendingGive ? rota?.team.find((t) => t.id === pendingGive.staff_id)?.name : null;

  const pendingSwap = rota?.pending_swaps.find((s) => s.role === "recipient" && s.status === "pending_response");
  const pendingSwapTheirShift = pendingSwap ? rota?.shifts.find((s) => s.id === pendingSwap.their_shift.shift_id) : null;
  const pendingSwapMyShift = pendingSwap ? rota?.shifts.find((s) => s.id === pendingSwap.my_shift.shift_id) : null;

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <div className="py-2 pb-6 text-center">
            <div className="text-[22px] font-bold text-ink">
              Hi {name} — {venueName}
            </div>
          </div>

          {pendingGive && giveShift && giverName && (
            <div className="mb-5 rounded-panel border border-accent-border bg-accent-light p-4">
              <div className="mb-1 text-sm font-bold text-ink">
                {giverName} wants to give you their {DAY_NAMES[pendingGive.day_index]} {giveShift.name} shift
              </div>
              <div className="mb-3 text-xs text-ink-muted">
                {giveShift.start_time} – {giveShift.end_time}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAcceptTarget(pendingGive)}
                  disabled={resolving}
                  className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(pendingGive)}
                  disabled={resolving}
                  className="flex-1 rounded-lg border border-hairline bg-surface-card py-2 text-center text-[13px] font-semibold text-ink-muted disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {pendingSwap && pendingSwapTheirShift && pendingSwapMyShift && (
            <div className="mb-5 rounded-panel border border-accent-border bg-accent-light p-4">
              <div className="mb-1 text-sm font-bold text-ink">
                {pendingSwap.counterpart_name} wants to swap their {DAY_NAMES[pendingSwap.their_shift.day_index]}{" "}
                {pendingSwapTheirShift.name} shift for your {DAY_NAMES[pendingSwap.my_shift.day_index]}{" "}
                {pendingSwapMyShift.name} shift
              </div>
              <div className="mb-3 text-xs text-ink-muted">
                You&apos;d get: {pendingSwapTheirShift.start_time} – {pendingSwapTheirShift.end_time}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAcceptSwapTarget(pendingSwap)}
                  disabled={resolvingSwap}
                  className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDeclineSwap(pendingSwap)}
                  disabled={resolvingSwap}
                  className="flex-1 rounded-lg border border-hairline bg-surface-card py-2 text-center text-[13px] font-semibold text-ink-muted disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

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

      <Modal open={acceptTarget !== null} onClose={() => setAcceptTarget(null)} title="Accept this shift?">
        {acceptTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              If it&apos;s compliant with your hours and rest, you&apos;re on this shift right away. If it would
              breach a rule, it goes to your manager for approval instead.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setAcceptTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmAccept}
                disabled={resolving}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resolving ? "Accepting…" : "Accept shift"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={acceptSwapTarget !== null} onClose={() => setAcceptSwapTarget(null)} title="Accept this swap?">
        {acceptSwapTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              Both shifts trade at once — never just one side. If it&apos;s compliant with everyone&apos;s hours
              and rest, the swap happens right away. If it would breach a rule on either side, it goes to your
              manager for approval instead.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setAcceptSwapTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmAcceptSwap}
                disabled={resolvingSwap}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {resolvingSwap ? "Accepting…" : "Accept swap"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} />
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
