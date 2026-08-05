"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import StepProgress from "@/components/step-progress";
import Toast from "@/components/toast";
import {
  ApiError,
  StaffManager,
  Venue,
  createShift,
  createStaff,
  createVenue,
  getVenue,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { END_TIMES, SHIFT_COLORS, START_TIMES, STAFF_ROLES } from "@/lib/constants";

type LocalShift = {
  name: string;
  start_time: string;
  end_time: string;
  color: string;
};

const DEFAULT_SHIFTS: LocalShift[] = [
  { name: "Morning", start_time: "7:00am", end_time: "2:00pm", color: "#60a5fa" },
  { name: "Afternoon", start_time: "12:00pm", end_time: "6:00pm", color: "#fbbf24" },
  { name: "Evening", start_time: "5:00pm", end_time: "close", color: "#a78bfa" },
];

const NEW_SHIFT_COLORS = SHIFT_COLORS;
const ROLES = STAFF_ROLES;

export default function OnboardingPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [venueName, setVenueName] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);

  const [shifts, setShifts] = useState<LocalShift[]>(DEFAULT_SHIFTS);
  const [editingShift, setEditingShift] = useState<number | null>(null);

  const [teamMembers, setTeamMembers] = useState<StaffManager[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("Server");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      getVenue()
        .then(() => router.replace("/dashboard"))
        .catch(() => setChecking(false));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleStep1Continue() {
    if (!venueName.trim()) {
      showToast("Please enter your venue name");
      return;
    }
    setBusy(true);
    try {
      const created = await createVenue(venueName.trim());
      setVenue(created);
      setStep(2);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const existing = await getVenue();
        setVenue(existing);
        setStep(2);
      } else {
        showToast(err instanceof ApiError ? err.message : "Could not create venue");
      }
    } finally {
      setBusy(false);
    }
  }

  function updateShift(index: number, patch: Partial<LocalShift>) {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addShift() {
    const color = NEW_SHIFT_COLORS[shifts.length % NEW_SHIFT_COLORS.length];
    setShifts((prev) => [...prev, { name: "New Shift", start_time: "9:00am", end_time: "5:00pm", color }]);
    setEditingShift(shifts.length);
  }

  function deleteShift(index: number) {
    setShifts((prev) => prev.filter((_, i) => i !== index));
    setEditingShift(null);
  }

  async function handleStep2Continue() {
    setBusy(true);
    try {
      for (let i = 0; i < shifts.length; i++) {
        const s = shifts[i];
        await createShift({
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          color: s.color,
          sort_order: i,
        });
      }
      setStep(3);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save shifts");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember() {
    const name = newName.trim();
    if (!name) {
      showToast("Please enter a name");
      return;
    }
    setBusy(true);
    try {
      const created = await createStaff({
        name,
        email: newEmail.trim() || null,
        role: newRole,
      });
      setTeamMembers((prev) => [...prev, created]);
      setNewName("");
      setNewEmail("");
      setNewRole("Server");
      showToast(`${name.split(" ")[0]} added — PIN ${created.pin}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not add team member");
    } finally {
      setBusy(false);
    }
  }

  const venueLink = venue ? `${window.location.origin}/v/${venue.link_token}` : "";

  function copyLink() {
    navigator.clipboard.writeText(venueLink);
    showToast("Link copied!");
  }

  if (checking) {
    return (
      <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-6">
          <StepProgress total={4} current={step} />

          {step === 1 && (
            <div>
              <div className="mb-1.5 text-[22px] font-bold text-ink">What&apos;s your venue called?</div>
              <div className="mb-7 text-sm text-ink-faint">This is how your team will see it</div>
              <div className="mb-4">
                <div className="mb-1.5 text-[13px] font-semibold text-ink-label">Venue name</div>
                <input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStep1Continue()}
                  placeholder="e.g. The Rose &amp; Crown"
                  autoFocus
                  className="w-full rounded-input border-2 border-accent bg-surface-card px-4 py-3.5 text-[15px] text-ink outline-none"
                />
              </div>
              <button
                onClick={handleStep1Continue}
                disabled={busy}
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Creating…" : "Continue"}
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-1.5 text-[22px] font-bold text-ink">Define your shifts</div>
              <div className="mb-6 text-sm text-ink-faint">
                We&apos;ve added common ones — edit or add your own
              </div>

              <div className="mb-3 flex flex-col gap-2">
                {shifts.map((sh, i) =>
                  editingShift === i ? (
                    <div key={i} className="rounded-xl border-2 border-accent bg-accent-light p-3.5">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-7 w-1 rounded-sm" style={{ background: sh.color }} />
                        <input
                          value={sh.name}
                          onChange={(e) => updateShift(i, { name: e.target.value })}
                          className="flex-1 rounded-lg border-[1.5px] border-accent-border px-2.5 py-2 text-sm font-semibold outline-none"
                        />
                      </div>
                      <div className="mb-2 flex items-center gap-1.5">
                        <select
                          value={sh.start_time}
                          onChange={(e) => updateShift(i, { start_time: e.target.value })}
                          className="flex-1 rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-2 text-[13px] outline-none"
                        >
                          {START_TIMES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <span className="text-[13px] text-ink-muted">→</span>
                        <select
                          value={sh.end_time}
                          onChange={(e) => updateShift(i, { end_time: e.target.value })}
                          className="flex-1 rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-2 text-[13px] outline-none"
                        >
                          {END_TIMES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingShift(null)}
                          className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-white"
                        >
                          Done
                        </button>
                        {shifts.length > 1 && (
                          <button
                            onClick={() => deleteShift(i)}
                            className="rounded-lg border border-unavail-border bg-surface-subtle px-3 py-2 text-[13px] font-semibold text-unavail-text"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card p-3.5"
                    >
                      <div className="h-7 w-1 rounded-sm" style={{ background: sh.color }} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-ink">{sh.name}</div>
                        <div className="text-xs text-ink-faint">
                          {sh.start_time} – {sh.end_time}
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingShift(i)}
                        className="text-[13px] font-medium text-accent"
                      >
                        Edit
                      </button>
                    </div>
                  ),
                )}
              </div>

              <button
                onClick={addShift}
                className="mb-5 w-full rounded-xl border-2 border-dashed border-unset-border py-3 text-center text-sm font-semibold text-accent"
              >
                + Add another shift
              </button>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-control bg-unset-bg py-4 text-center text-sm font-semibold text-ink-muted"
                >
                  Back
                </button>
                <button
                  onClick={handleStep2Continue}
                  disabled={busy}
                  className="flex-1 rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Continue"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="mb-1.5 text-[22px] font-bold text-ink">Add your team</div>
              <div className="mb-5 text-sm text-ink-faint">You can always add more later</div>

              {teamMembers.length > 0 ? (
                <div className="mb-4 flex flex-col gap-1.5">
                  {teamMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-border text-[10px] font-bold text-accent">
                        {m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-ink">{m.name}</div>
                        <div className="text-[11px] text-ink-faint">{m.role}</div>
                      </div>
                      <div className="rounded-md bg-surface-page px-2 py-1 text-[11px] font-bold tracking-wide text-ink-label">
                        PIN {m.pin}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-4 rounded-xl bg-surface-subtle p-5 text-center text-[13px] text-ink-faint">
                  No team members yet — add someone below
                </div>
              )}

              <div className="mb-5 rounded-2xl bg-surface-subtle p-4">
                <div className="mb-2.5">
                  <div className="mb-1 text-xs font-semibold text-ink-label">Name</div>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full rounded-[10px] border-[1.5px] border-unset-border bg-surface-subtle px-3.5 py-2.5 text-sm outline-none"
                  />
                </div>
                <div className="mb-2.5 flex gap-2">
                  <div className="flex-1">
                    <div className="mb-1 text-xs font-semibold text-ink-label">Email</div>
                    <input
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full rounded-[10px] border-[1.5px] border-unset-border bg-surface-subtle px-3.5 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 text-xs font-semibold text-ink-label">Role</div>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full rounded-[10px] border-[1.5px] border-unset-border bg-surface-subtle px-3.5 py-2.5 text-sm outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleAddMember}
                  disabled={busy}
                  className="w-full rounded-[10px] bg-accent py-2.5 text-center text-sm font-semibold text-white disabled:opacity-60"
                >
                  Add to team
                </button>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-control bg-unset-bg py-4 text-center text-sm font-semibold text-ink-muted"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 rounded-control bg-accent py-4 text-center text-base font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="py-5 text-center">
              <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-avail-bg text-[32px]">
                🎉
              </div>
              <div className="mb-2 text-2xl font-bold text-ink">You&apos;re all set!</div>
              <div className="mb-6 text-sm leading-relaxed text-ink-muted">
                Share this link with your team so they can submit their availability
              </div>
              <div className="mb-5 flex items-center gap-2 rounded-xl bg-surface-page px-4 py-3.5">
                <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[13px] text-ink-label">
                  {venueLink}
                </div>
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Copy
                </button>
              </div>
              <div className="mb-6 text-[13px] text-ink-faint">
                PINs have been generated for {teamMembers.length} staff member
                {teamMembers.length === 1 ? "" : "s"}
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
