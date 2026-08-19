"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import OIcon, { OIconName } from "@/components/onboarding/icon";
import {
  ApiError,
  Period,
  activateOnboarding,
  createRole,
  createShift,
  createStaff,
  createVenue,
  generateRota,
  getVenue,
  listPeriods,
  listRoles,
  listShifts,
  listStaff,
  rotateJoinCode,
  saveSetupState,
  updateRules,
  updateScheduler,
  updateShift,
  updateVenue,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { SHIFT_COLORS } from "@/lib/constants";

// ── Venue type presets (the seed) ──────────────────────────────────────────
type VenueKey = "pub" | "bar" | "resto" | "cafe" | "hotel" | "other";
const VENUE_TYPES: Record<VenueKey, { label: string; foh: string[]; boh: string[]; desc: string; icon: OIconName }> = {
  pub: { label: "Pub", foh: ["Bar", "Floor"], boh: ["Kitchen", "Cellar"], desc: "Bar, floor, cellar", icon: "beer" },
  bar: { label: "Bar or nightclub", foh: ["Bar", "Floor", "Door"], boh: ["Glass and cellar"], desc: "Bar, floor, door", icon: "disco" },
  resto: { label: "Restaurant", foh: ["Host", "Waiting", "Bar"], boh: ["Kitchen", "Kitchen porter"], desc: "Host, waiting, kitchen", icon: "kitchen" },
  cafe: { label: "Café", foh: ["Barista", "Counter"], boh: ["Kitchen"], desc: "Barista, counter, kitchen", icon: "coffee" },
  hotel: { label: "Hotel F&B", foh: ["Reception", "Restaurant", "Bar"], boh: ["Kitchen", "Housekeeping"], desc: "Reception, restaurant, kitchen", icon: "building" },
  other: { label: "Something else", foh: ["Front of house"], boh: ["Back of house"], desc: "Set your own roles", icon: "dots" },
};

const TOTAL = 7; // steps 0–6 are numbered; step 7 is the solve payoff.
const ROTA_ROLE_ICONS: OIconName[] = ["glass", "users", "chef-hat"];

// "23:00" → "11:00pm", for the app's free-text shift times.
function fmtTime(t: string): string {
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw || 0);
  const suf = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${suf}` : `${hh}:00${suf}`;
}

type Team = { name: string; u18: boolean };
type WizState = {
  step: number;
  name: string;
  venue: VenueKey | null;
  foh: string[];
  boh: string[];
  hoursMode: "same" | "vary";
  open: string;
  close: string;
  coverage: Record<string, number>;
  rest: boolean;
};

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [checking, setChecking] = useState(true);
  const [resendWall, setResendWall] = useState(false);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);

  // Wizard state
  const [si, setSi] = useState(0);
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venue, setVenue] = useState<VenueKey | null>(null);
  const [foh, setFoh] = useState<string[]>([]);
  const [boh, setBoh] = useState<string[]>([]);
  const [hoursMode, setHoursMode] = useState<"same" | "vary">("same");
  const [open, setOpen] = useState("11:00");
  const [close, setClose] = useState("23:00");
  const [team, setTeam] = useState<Team[]>([]);
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [rest, setRest] = useState(true);

  // Manual-add reveal
  const [memOpen, setMemOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mU18, setMU18] = useState(false);

  // Join code panel
  const [joinPin, setJoinPin] = useState<string | null>(null);
  const [venueToken, setVenueToken] = useState<string | null>(null);

  // Transition machinery
  const [anim, setAnim] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hasU18 = team.some((m) => m.u18);
  const roles = foh.concat(boh);

  // Mirror of `si` for timers/closures that must read the live step.
  const siRef = useRef(si);
  siRef.current = si;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // ── Boot: activation landing (§1 / 3a) + save-and-resume ──────────────────
  useEffect(() => {
    async function boot() {
      const supabase = createClient();
      const token = searchParams.get("token");
      if (token) {
        try {
          const s = await activateOnboarding(token);
          await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
          setManagerEmail(s.email);
          window.history.replaceState({}, "", "/onboarding");
        } catch (err) {
          const { data: existing } = await supabase.auth.getSession();
          if (err instanceof ApiError && err.status === 410 && !existing.session) {
            setResendWall(true);
            setChecking(false);
            return;
          }
          if (!existing.session) {
            setChecking(false);
            setResendWall(true);
            return;
          }
          window.history.replaceState({}, "", "/onboarding");
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      if (!managerEmail) setManagerEmail(data.session.user.email ?? null);

      try {
        const v = await getVenue();
        setVenueName(v.name);
        setVenueToken(v.link_token);
        setJoinPin(v.join_pin);
        const st = v.setup_state as (WizState & Record<string, unknown>) | null;
        if (!st || st.completed) {
          router.replace("/dashboard");
          return;
        }
        // Rehydrate the wizard from the saved blob.
        setName(st.name ?? "");
        setVenue((st.venue as VenueKey) ?? null);
        setFoh(st.foh ?? []);
        setBoh(st.boh ?? []);
        setHoursMode(st.hoursMode ?? "same");
        setOpen(st.open ?? "11:00");
        setClose(st.close ?? "23:00");
        setCoverage(st.coverage ?? {});
        setRest(st.rest ?? true);
        const savedTeam = await listStaff().catch(() => []);
        setTeam(savedTeam.filter((m) => !m.pending).map((m) => ({ name: m.name, u18: m.is_under_18 })));
        setSi(typeof st.step === "number" ? st.step : 1);
        setChecking(false);
      } catch {
        setChecking(false); // no venue yet → fresh start at step 0
      }
    }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the whole wizard blob for resume. Best-effort.
  function persist(step: number, extra: Partial<WizState> = {}) {
    const blob: WizState = {
      step,
      name,
      venue,
      foh,
      boh,
      hoursMode,
      open,
      close,
      coverage,
      rest,
      ...extra,
    };
    void saveSetupState(blob as unknown as Record<string, unknown>).catch(() => {});
  }

  // ── Guarded directional transition (leave → swap → enter) ─────────────────
  function set(target: number) {
    if (busy || target === si) return;
    const dir = target >= si ? "fwd" : "back";
    setBusy(true);
    setAnim(`leave-${dir}`);
    timers.current.push(
      setTimeout(() => {
        setSi(target);
        setAnim(`enter-${dir}`);
        timers.current.push(
          setTimeout(() => {
            setAnim("");
            setBusy(false);
          }, 420),
        );
      }, 200),
    );
  }
  function advance() {
    if (si < 6) set(si + 1);
  }
  function goBack() {
    if (si >= 1 && si <= 6) set(si - 1);
  }

  // ── Step actions ──────────────────────────────────────────────────────────
  async function handleStart() {
    if (!venueName.trim()) {
      showToast("Enter your venue name");
      return;
    }
    setSaving(true);
    try {
      if (!venueToken) {
        const created = await createVenue(venueName.trim());
        setVenueToken(created.link_token);
      } else {
        await updateVenue(venueName.trim());
      }
      persist(1);
      set(1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Venue already exists for this account — adopt it and move on.
        const existing = await getVenue().catch(() => null);
        if (existing) setVenueToken(existing.link_token);
        persist(1);
        set(1);
      } else {
        showToast(err instanceof ApiError ? err.message : "Could not save your venue");
      }
    } finally {
      setSaving(false);
    }
  }

  function pickVenue(k: VenueKey) {
    const v = VENUE_TYPES[k];
    setVenue(k);
    setFoh(v.foh.slice());
    setBoh(v.boh.slice());
    // Auto-advance shortly after the selection confirms (reference: ~430ms).
    // set() no-ops if the user already moved; the ref guards a stale navigation.
    timers.current.push(
      setTimeout(() => {
        if (siRef.current === 1) set(2);
      }, 430),
    );
  }

  // Idempotently create the venue's roles (skip any that already exist by name).
  async function persistRoles() {
    const existing = await listRoles().catch(() => []);
    const have = new Set(existing.map((r) => r.name.toLowerCase()));
    for (const nm of roles) {
      if (have.has(nm.trim().toLowerCase())) continue;
      try {
        await createRole({ name: nm.trim(), icon: "users", staff_ids: [] });
        have.add(nm.trim().toLowerCase());
      } catch {
        /* clash/again — ignore, resume-safe */
      }
    }
  }

  // Two default shifts (Day / Evening) split at 17:00, from the entered hours —
  // the app schedules named shifts, not raw opening hours. Idempotent.
  async function persistShifts() {
    const existing = await listShifts().catch(() => []);
    if (existing.length > 0) return;
    await createShift({ name: "Day", start_time: fmtTime(open), end_time: "5:00pm", color: SHIFT_COLORS[0], sort_order: 0 });
    await createShift({ name: "Evening", start_time: "5:00pm", end_time: fmtTime(close), color: SHIFT_COLORS[2], sort_order: 1 });
  }

  async function handleRolesContinue() {
    setSaving(true);
    try {
      await persistRoles();
      persist(3);
      set(3);
    } catch {
      showToast("Could not save roles");
    } finally {
      setSaving(false);
    }
  }

  async function handleHoursContinue() {
    setSaving(true);
    try {
      await persistShifts();
      // Seed coverage defaults for the first three roles now that we're leaving.
      const base = [3, 2, 2];
      const cov: Record<string, number> = {};
      roles.slice(0, 3).forEach((r, i) => (cov[r] = coverage[r] ?? base[i] ?? 1));
      setCoverage(cov);
      persist(4, { coverage: cov });
      set(4);
    } catch {
      showToast("Could not save your hours");
    } finally {
      setSaving(false);
    }
  }

  async function handleShareJoin() {
    setSaving(true);
    try {
      let pin = joinPin;
      if (!pin) {
        const res = await rotateJoinCode();
        pin = res.join_pin;
        setJoinPin(pin);
      }
      const link = venueToken ? `${window.location.origin}/v/${venueToken}` : "";
      await navigator.clipboard.writeText(link).catch(() => {});
      showToast(`Join link copied · code ${pin}`);
    } catch {
      showToast("Could not create the join link");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    const nm = mName.trim() || "New member";
    setSaving(true);
    try {
      const role = roles[0] ?? "Staff";
      await createStaff({ name: nm, role, is_under_18: mU18 });
      setTeam((t) => [...t, { name: nm, u18: mU18 }]);
      setMName("");
      setMU18(false);
      setMemOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not add member");
    } finally {
      setSaving(false);
    }
  }

  function bump(role: string, d: number) {
    setCoverage((c) => ({ ...c, [role]: Math.max(0, (c[role] ?? 0) + d) }));
  }

  async function handleGenerate() {
    // Persist coverage (total evening cover → Evening shift min_staff) + rules,
    // then run the solver. Called once, from the solve screen's effect (the CTA
    // only advances to step 7), so there's no double-fire race on these writes.
    try {
      const total = roles.slice(0, 3).reduce((s, r) => s + (coverage[r] ?? 0), 0);
      const shifts = await listShifts().catch(() => []);
      const evening = shifts.find((s) => /evening/i.test(s.name)) ?? shifts[shifts.length - 1];
      if (evening && total > 0) {
        await updateShift(evening.id, { min_staff: total, max_staff: Math.max(total + 1, evening.max_staff) });
      }
      await updateRules({ min_rest_hours: 11 }).catch(() => {});
      await updateScheduler({ require_day_off: rest }).catch(() => {});
      const periods = await listPeriods().catch<Period[]>(() => []);
      const period = periods.find((p) => p.status === "collecting") ?? periods[0];
      if (period) await generateRota(period.id).catch(() => {});
    } catch {
      /* the landing tolerates an empty/sample rota */
    }
  }

  async function finishOnboarding() {
    await saveSetupState(null).catch(() => {});
    router.push("/dashboard");
  }

  // ── Renders ───────────────────────────────────────────────────────────────
  if (resendWall) return <ResendWall />;
  if (checking) return <Centered>Loading…</Centered>;

  return (
    <div className="cp-manager cp-onboarding">
      <div className="ob-shell">
        <div className="ob-rail">
          <div className="ob-fill" style={{ transform: `scaleX(${Math.min(1, si / (TOTAL - 1))})` }} />
        </div>
        <div className="ob-top">
          <button className={`ob-back ${si >= 1 && si <= 6 ? "show" : ""}`} onClick={goBack} aria-label="Back">
            <OIcon name="arrow-left" size={16} />
          </button>
          <span className="ob-stepn">{si <= 6 ? `Step ${si + 1} of ${TOTAL}` : ""}</span>
        </div>

        <div className="ob-wrap">
          {si < 7 && (
            <div className={`ob-step ${anim}`}>
              {/* Called as render functions, NOT mounted as <Components/>: these
                  closures are recreated every parent render, so mounting them as
                  elements gave each a new type identity on every keystroke →
                  React remounted the subtree → inputs lost focus/cursor. Calling
                  them inlines their JSX so inputs reconcile in place. (They hold
                  no hooks, so a plain call is safe.) */}
              {si === 0 && StepWelcome()}
              {si === 1 && StepVenue()}
              {si === 2 && StepRoles()}
              {si === 3 && StepHours()}
              {si === 4 && StepTeam()}
              {si === 5 && StepCoverage()}
              {si === 6 && StepDefaults()}
            </div>
          )}
          {si === 7 && <StepSolve onOpen={finishOnboarding} onGenerate={handleGenerate} />}
        </div>

        {si < 7 && <div className="ob-cta">{renderCta()}</div>}
      </div>
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="cp-onboarding rounded-xl border-[0.5px] border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--text)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            {toast}
          </div>
        </div>
      )}
    </div>
  );

  // CTA per step
  function renderCta() {
    if (si === 0)
      return (
        <button className="ob-btn" onClick={handleStart} disabled={saving}>
          {saving ? "Starting…" : "Start setup"} <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 1)
      return venue ? (
        <button className="ob-btn" onClick={advance}>
          Continue <OIcon name="arrow-right" size={17} />
        </button>
      ) : null;
    if (si === 2)
      return (
        <button className="ob-btn" onClick={handleRolesContinue} disabled={saving}>
          {saving ? "Saving…" : "Looks right"} <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 3)
      return (
        <button className="ob-btn" onClick={handleHoursContinue} disabled={saving}>
          {saving ? "Saving…" : "Continue"} <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 4)
      return team.length ? (
        <button className="ob-btn" onClick={() => { persist(5); set(5); }}>
          Continue with {team.length} <OIcon name="arrow-right" size={17} />
        </button>
      ) : (
        <button className="ob-btn ghost" onClick={() => { persist(5); set(5); }}>
          Skip — show me a sample rota
        </button>
      );
    if (si === 5)
      return (
        <button className="ob-btn" onClick={() => { persist(6); set(6); }}>
          Continue <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 6)
      return (
        <button className="ob-btn" onClick={() => set(7)}>
          <OIcon name="sparkles" size={17} /> Build my first rota
        </button>
      );
    return null;
  }

  // ── Step content components (closures over state) ─────────────────────────
  function StepWelcome() {
    return (
      <div>
        <div className="ob-eyebrow">Welcome</div>
        <div className="ob-h">Let&apos;s set up your venue</div>
        <div className="ob-p">A few quick questions and Crewplan builds your first rota automatically. Your progress saves as you go.</div>
        <div className="ob-field">
          <div className="ob-lbl">Your name</div>
          <input className="ob-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" />
        </div>
        <div className="ob-field">
          <div className="ob-lbl">Venue name</div>
          <input className="ob-in" value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="The Anchor" />
        </div>
        <div className="ob-field">
          <div className="ob-lbl">Work email</div>
          <input className="ob-in" value={managerEmail ?? ""} disabled readOnly />
          <div className="ob-hint"><OIcon name="check" size={12} /> Signed in — no password needed</div>
        </div>
      </div>
    );
  }

  function StepVenue() {
    return (
      <div>
        <div className="ob-eyebrow">Your venue</div>
        <div className="ob-h">What kind of place is it?</div>
        <div className="ob-p">Tap one — this seeds sensible roles, hours and staffing, and moves you straight on.</div>
        <div className="ob-cards">
          {(Object.keys(VENUE_TYPES) as VenueKey[]).map((k) => {
            const v = VENUE_TYPES[k];
            return (
              <button key={k} className={`ob-card ${venue === k ? "sel" : ""}`} onClick={() => pickVenue(k)}>
                <div className="ob-cic"><OIcon name={v.icon} size={20} /></div>
                <div>
                  <div className="ob-cn">{v.label}</div>
                  <div className="ob-cd">{v.desc}</div>
                </div>
                <div className="ob-ck"><OIcon name="check" size={13} /></div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function StepRoles() {
    const chip = (r: string, grp: "foh" | "boh", i: number) => (
      <div key={grp + i} className="ob-chip pop">
        <span className="lead"><OIcon name="point" size={12} /></span>
        {r}
        <span className="rm" onClick={() => (grp === "foh" ? setFoh((a) => a.filter((_, j) => j !== i)) : setBoh((a) => a.filter((_, j) => j !== i)))}>
          <OIcon name="x" size={14} />
        </span>
      </div>
    );
    return (
      <div>
        <div className="ob-eyebrow">Roles</div>
        <div className="ob-h">The jobs on a shift</div>
        <div className="ob-p">Pre-filled for a {venue ? VENUE_TYPES[venue].label.toLowerCase() : "venue"}, grouped how a venue actually runs. Remove any, add your own.</div>
        <div className="ob-group first">Front of house</div>
        <div className="ob-chips">
          {foh.map((r, i) => chip(r, "foh", i))}
          <button className="ob-add" onClick={() => setFoh((a) => [...a, "New role"])}><OIcon name="plus" size={14} /> Add</button>
        </div>
        <div className="ob-group">Back of house</div>
        <div className="ob-chips">
          {boh.map((r, i) => chip(r, "boh", i))}
          <button className="ob-add" onClick={() => setBoh((a) => [...a, "New role"])}><OIcon name="plus" size={14} /> Add</button>
        </div>
        <Why>The scheduler fills every role you list, on every shift that needs cover.</Why>
      </div>
    );
  }

  function StepHours() {
    return (
      <div>
        <div className="ob-eyebrow">Opening hours</div>
        <div className="ob-h">When are you open?</div>
        <div className="ob-p">Most places keep the same hours most days. Switch to &quot;varies&quot; only if you need to.</div>
        <div className="ob-seg">
          <button className={`ob-so ${hoursMode === "same" ? "on" : ""}`} onClick={() => setHoursMode("same")}>Same every day</button>
          <button className={`ob-so ${hoursMode === "vary" ? "on" : ""}`} onClick={() => setHoursMode("vary")}>Varies by day</button>
        </div>
        <div className="ob-timerow">
          <div className="ob-timecard"><label>Open</label><input type="time" className="ob-time" value={open} onChange={(e) => setOpen(e.target.value)} /></div>
          <div className="ob-timecard"><label>Close</label><input type="time" className="ob-time" value={close} onChange={(e) => setClose(e.target.value)} /></div>
        </div>
        <div className="ob-hint"><OIcon name="info-circle" size={12} /> You can change opening hours anytime in Settings.</div>
        <div className={`ob-reveal ${hoursMode === "vary" ? "open" : ""}`}>
          <div className="ob-group">Fri – Sat</div>
          <div className="ob-timerow">
            <div className="ob-timecard"><label>Open</label><input type="time" className="ob-time" defaultValue="11:00" /></div>
            <div className="ob-timecard"><label>Close</label><input type="time" className="ob-time" defaultValue="01:00" /></div>
          </div>
          <div className="ob-group">Sunday</div>
          <div className="ob-timerow">
            <div className="ob-timecard"><label>Open</label><input type="time" className="ob-time" defaultValue="12:00" /></div>
            <div className="ob-timecard"><label>Close</label><input type="time" className="ob-time" defaultValue="22:30" /></div>
          </div>
        </div>
      </div>
    );
  }

  function StepTeam() {
    return (
      <div>
        <div className="ob-eyebrow">Your team</div>
        <div className="ob-h">Bring in your crew</div>
        <div className="ob-p">Fastest way: share one join link and let staff register themselves. You approve and set roles after.</div>
        <button className="ob-join" onClick={handleShareJoin} disabled={saving}>
          <div className="ic"><OIcon name="link" size={18} /></div>
          <div style={{ flex: 1 }}>
            <div className="ob-rn">{joinPin ? `Join link + code ${joinPin}` : "Share a join link + venue PIN"}</div>
            <div className="ob-rt">staff add themselves — you approve</div>
          </div>
          <OIcon name="share" size={18} className="text-[var(--accent)]" />
        </button>
        <div className="ob-or">or add a few yourself</div>
        {team.map((m, i) => (
          <div key={i} className="ob-tm pop">
            <div className="ob-av">{m.name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div className="ob-rn">{m.name}{m.u18 && <span className="ob-u18">U18</span>}</div>
              <div className="ob-rt">pending — you&apos;ll set roles</div>
            </div>
            <span className="rm" onClick={() => setTeam((t) => t.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "var(--faint)" }}>
              <OIcon name="x" size={15} />
            </span>
          </div>
        ))}
        <button className="ob-tm" style={{ borderStyle: "dashed", background: "transparent", cursor: "pointer", width: "100%" }} onClick={() => setMemOpen((o) => !o)}>
          <div className="ob-av" style={{ background: "var(--icon-bg)", color: "var(--dim)" }}><OIcon name="plus" size={16} /></div>
          <div className="ob-rn" style={{ color: "var(--dim)" }}>Add someone manually</div>
        </button>
        <div className={`ob-reveal ${memOpen ? "open" : ""}`}>
          <div style={{ padding: "12px 0 2px" }}>
            <input className="ob-in" value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Name" style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 2 }}>
              <div>
                <div className="ob-rn">Under 18?</div>
                <div className="ob-rt">applies safe-hours rules</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`ob-swlabel ${mU18 ? "on" : ""}`}>{mU18 ? "Yes" : "No"}</span>
                <button className={`ob-sw ${mU18 ? "on" : ""}`} onClick={() => setMU18((u) => !u)} aria-label="Under 18" />
              </div>
            </div>
            <button className="ob-btn" style={{ marginTop: 12, padding: 12 }} onClick={handleAddMember} disabled={saving}>Add to team</button>
          </div>
        </div>
      </div>
    );
  }

  function StepCoverage() {
    const three = roles.slice(0, 3);
    return (
      <div>
        <div className="ob-eyebrow">Coverage</div>
        <div className="ob-h">How many on an evening?</div>
        <div className="ob-p">Your busiest shift. We set a typical level for a {venue ? VENUE_TYPES[venue].label.toLowerCase() : "venue"} — nudge to match your floor.</div>
        {three.map((r) => (
          <div key={r} className="ob-cov">
            <div className="ob-rn">{r}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="ob-mb" onClick={() => bump(r, -1)}>−</button>
              <span className="ob-mv">{coverage[r] ?? 1}</span>
              <button className="ob-mb" onClick={() => bump(r, 1)}>+</button>
            </div>
          </div>
        ))}
        <Why>This is the target the auto-scheduler fills. Quieter shifts scale down on their own.</Why>
      </div>
    );
  }

  function StepDefaults() {
    const sr = (t: string, s: string) => (
      <div className="ob-si">
        <span className="ic"><OIcon name="check" size={17} /></span>
        <div><div className="ob-sit">{t}</div><div className="ob-sis">{s}</div></div>
      </div>
    );
    return (
      <div>
        <div className="ob-eyebrow">Almost there</div>
        <div className="ob-h">We&apos;ve set safe defaults</div>
        <div className="ob-p">Standard UK working rules, applied for you. Fine-tune any of it in Settings.</div>
        <div className="ob-sum">
          {sr("11 hours rest between shifts", "Working Time Regulations")}
          {sr("Max 10-hour shifts", "no accidental doubles")}
          {sr("72 hours notice", "Employment Rights Act 2025")}
          {hasU18 && (
            <div className="ob-si u18">
              <span className="ic"><OIcon name="shield-check" size={17} /></span>
              <div><div className="ob-sit">Under-18 rules — locked on</div><div className="ob-sis">You added under-18 staff, so 5 hard limits always apply</div></div>
            </div>
          )}
        </div>
        <div className="ob-tm" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <div>
            <div className="ob-rn">Guarantee a day off each week</div>
            <div className="ob-rt">1 day off in 7</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`ob-swlabel ${rest ? "on" : ""}`}>{rest ? "On" : "Off"}</span>
            <button className={`ob-sw ${rest ? "on" : ""}`} onClick={() => setRest((r) => !r)} aria-label="Guarantee a day off" />
          </div>
        </div>
      </div>
    );
  }
}

function Why({ children }: { children: React.ReactNode }) {
  return (
    <div className="ob-why">
      <span className="ic"><OIcon name="bulb" size={15} /></span>
      <span>{children}</span>
    </div>
  );
}

// ── Step 7: stepped solver animation → rota landing + coach tour ────────────
const SOLVE_STEPS = ["Reading availability", "Matching roles to coverage", "Checking working-time rules", "Balancing hours fairly"];
const TOUR = [
  { t: "sched", n: "1 of 3", h: "Scheduler", p: "Set how many staff each shift needs and the rules the solver follows. Change these and regenerate anytime." },
  { t: "rota", n: "2 of 3", h: "Rota", p: "Review the auto-built rota and publish it. Gaps show in amber so nothing goes out half-filled." },
  { t: "team", n: "3 of 3", h: "Team", p: "Add crew or share your join link so staff register themselves — and send the availability link to sharpen the next rota.", cta: "Share availability link" },
];

function StepSolve({ onOpen, onGenerate }: { onOpen: () => void; onGenerate: () => void }) {
  const [done, setDone] = useState(-1); // index of last completed solve line
  const [finished, setFinished] = useState(false);
  const [showRota, setShowRota] = useState(false);
  const genFired = useRef(false);

  useEffect(() => {
    if (!genFired.current) {
      genFired.current = true;
      void onGenerate();
    }
    let k = 0;
    const iv = setInterval(() => {
      setDone(k);
      k += 1;
      if (k >= SOLVE_STEPS.length) {
        clearInterval(iv);
        setTimeout(() => setFinished(true), 460);
      }
    }, 600);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (showRota) return <RotaLanding onFinish={onOpen} />;

  return (
    <>
      <div className="ob-solve">
        <div className={`ob-ring ${finished ? "done" : ""}`}>
          {finished ? <OIcon name="check" size={32} /> : <span className="spin"><OIcon name="loader" size={32} /></span>}
        </div>
        <div className="ob-h" style={{ textAlign: "center" }}>{finished ? "Your rota is ready" : "Building your rota…"}</div>
        <div className="ob-p" style={{ textAlign: "center", marginBottom: 0 }}>
          {finished ? "Built with a sample crew so you can see it work" : "Fitting your crew to every shift"}
        </div>
        <div className="ob-slist">
          {SOLVE_STEPS.map((t, i) => (
            <div key={i} className={`ob-sl ${i <= done ? "done" : ""}`}>
              <span className="tick"><span className="ic"><OIcon name="check" size={11} /></span></span> {t}
            </div>
          ))}
        </div>
      </div>
      {finished && (
        <div className="ob-cta">
          <button className="ob-btn" onClick={() => setShowRota(true)}>
            Open my rota <OIcon name="arrow-right" size={17} />
          </button>
        </div>
      )}
    </>
  );
}

function RotaLanding({ onFinish }: { onFinish: () => void }) {
  const [tourStep, setTourStep] = useState(0);
  const [tourOn, setTourOn] = useState(false);
  const [activeTab, setActiveTab] = useState("rota");

  useEffect(() => {
    const t = setTimeout(() => setTourOn(true), 650);
    return () => clearTimeout(t);
  }, []);

  const cur = TOUR[tourStep];
  const last = tourStep === TOUR.length - 1;
  const spot = tourOn ? cur.t : null;

  const cells = [
    { role: "Bar · evening", icon: ROTA_ROLE_ICONS[0], crew: ["Priya", "Jess"], gap: true },
    { role: "Floor · evening", icon: ROTA_ROLE_ICONS[1], crew: ["Tom", "Leah"], gap: false },
    { role: "Kitchen · evening", icon: ROTA_ROLE_ICONS[2], crew: ["Sam", "Aday"], gap: false },
  ];

  function nextTour() {
    if (last) {
      setTourOn(false);
      onFinish();
      return;
    }
    setTourStep((s) => s + 1);
  }

  return (
    <div className="ob-rota show">
      <div className="ob-rnav ob-rise">
        <div className="ob-wm">crewplan<span>.</span></div>
        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>This week</div>
      </div>
      <div className="ob-rbody">
        <div className="ob-banner ob-rise" style={{ animationDelay: ".04s" }}>
          <span className="ic"><OIcon name="bulb" size={16} /></span>
          <div>
            <div className="t">This rota isn&apos;t optimised yet</div>
            <div className="s">It&apos;s built without your team&apos;s availability. Once your crew shares when they can work, regenerate for a much better fit.</div>
          </div>
        </div>
        {cells.map((c, i) => (
          <div key={i} className="ob-rrole ob-rise" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
            <div className="ob-rrh"><span className="ic"><OIcon name={c.icon} size={14} /></span> {c.role}</div>
            <div className="ob-rcell">
              {c.crew.map((n) => (
                <span key={n} className="ob-pill"><span className="ob-pa">{n[0]}</span>{n}</span>
              ))}
              {c.gap && <span className="ob-gap">Needs 1 more</span>}
            </div>
          </div>
        ))}
      </div>
      <div className={`ob-scrim ${tourOn ? "show" : ""}`} />
      <div className="ob-tabs">
        {[
          { t: "sched", label: "Scheduler", icon: "adjustments" as OIconName },
          { t: "rota", label: "Rota", icon: "calendar" as OIconName },
          { t: "team", label: "Team", icon: "users" as OIconName },
        ].map((tab) => (
          <div key={tab.t} className={`ob-tab ${activeTab === tab.t ? "active" : ""} ${spot === tab.t ? "spot" : ""}`}>
            <OIcon name={tab.icon} size={20} />
            {tab.label}
          </div>
        ))}
      </div>
      <div className={`ob-coach ${tourOn ? "show" : ""}`}>
        <div className="cn">{cur.n}</div>
        <div className="ch">{cur.h}</div>
        <div className="cp2">{cur.p}</div>
        <div className="crow">
          <div className="ob-dots">
            {TOUR.map((_, i) => (
              <span key={i} className={`ob-dot ${i === tourStep ? "on" : ""}`} />
            ))}
          </div>
          <button
            className="ob-cbtn"
            onClick={() => {
              if (last) setActiveTab("team");
              nextTour();
            }}
          >
            {last ? `${cur.cta} →` : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResendWall() {
  return (
    <div className="cp-manager cp-onboarding">
      <div className="ob-shell" style={{ justifyContent: "center", alignItems: "center", padding: "0 24px", textAlign: "center" }}>
        <div className="ob-ring" style={{ marginBottom: 20 }}><OIcon name="info-circle" size={30} /></div>
        <div className="ob-h">This link has expired</div>
        <div className="ob-p" style={{ maxWidth: 300 }}>
          Setup links work once and for 7 days. Ask your Crewplan contact to send a fresh one, and you&apos;ll be set up in a few minutes.
        </div>
        <a className="ob-btn" style={{ maxWidth: 300 }} href="mailto:hello@crewplan.app?subject=Resend%20my%20setup%20link">Request a new link</a>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-manager cp-onboarding">
      <div className="ob-shell" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="ob-p" style={{ margin: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <OnboardingWizard />
    </Suspense>
  );
}
