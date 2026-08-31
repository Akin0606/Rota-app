"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import OIcon, { OIconName } from "@/components/onboarding/icon";
import TimeWheel from "@/components/onboarding/time-wheel";
import {
  ApiError,
  activateOnboarding,
  createRole,
  createShift,
  createStaff,
  createVenue,
  deleteShift,
  getVenue,
  listRoles,
  listShifts,
  listStaff,
  rotateJoinCode,
  saveSetupState,
  setShiftSchedule,
  updateRules,
  updateScheduler,
  updateShift,
  updateVenue,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { SHIFT_COLORS, SUPPORT_EMAIL } from "@/lib/constants";
import Waiting from "@/components/waiting";

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

// Per-day opening hours (times as "HH:MM" 24h). The default screen edits these
// in three pub-rhythm groups; the per-day sheet edits individual days. The
// solver's per-day model consumes `days`; `open`/`close` stay as the
// representative weekday pair the current shift bridge still needs.
type DayHours = { open: string; close: string; closed: boolean };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_GROUPS: { label: string; sub: string; days: number[]; wknd?: boolean }[] = [
  { label: "Mon–Thu", sub: "the usual", days: [0, 1, 2, 3] },
  { label: "Fri–Sat", sub: "later close", days: [4, 5], wknd: true },
  { label: "Sunday", sub: "Sunday hours", days: [6], wknd: true },
];
function defaultDays(o: string, c: string): DayHours[] {
  return DAY_NAMES.map(() => ({ open: o, close: c, closed: false }));
}
function groupSummary(days: DayHours[], idxs: number[]) {
  const ds = idxs.map((i) => days[i]);
  if (ds.every((d) => d.closed)) return { closed: true, varies: false, open: "", close: "" };
  const anyClosed = ds.some((d) => d.closed);
  const openSame = ds.every((d) => d.open === ds[0].open);
  const closeSame = ds.every((d) => d.close === ds[0].close);
  return { closed: false, varies: anyClosed || !openSame || !closeSame, open: ds[0].open, close: ds[0].close };
}

type WizState = {
  step: number;
  name: string;
  venue: VenueKey | null;
  foh: string[];
  boh: string[];
  days: DayHours[];
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
  // An API/network failure while loading the venue — distinct from "no venue
  // yet". Shows a retry screen instead of silently starting re-setup.
  const [bootError, setBootError] = useState(false);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);

  // Wizard state
  const [si, setSi] = useState(0);
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venue, setVenue] = useState<VenueKey | null>(null);
  const [foh, setFoh] = useState<string[]>([]);
  const [boh, setBoh] = useState<string[]>([]);
  const [open, setOpen] = useState("11:00");
  const [close, setClose] = useState("23:00");
  const [days, setDays] = useState<DayHours[]>(() => defaultDays("11:00", "23:00"));
  const [picker, setPicker] = useState<{ target: number[]; field: "open" | "close"; value: string; label: string } | null>(null);
  const [daySheet, setDaySheet] = useState(false);
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
        setVenueToken(v.slug ?? v.link_token);
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
        setOpen(st.open ?? "11:00");
        setClose(st.close ?? "23:00");
        setDays(st.days ?? defaultDays(st.open ?? "11:00", st.close ?? "23:00"));
        setCoverage(st.coverage ?? {});
        setRest(st.rest ?? true);
        const savedTeam = await listStaff().catch(() => []);
        setTeam(savedTeam.filter((m) => !m.pending).map((m) => ({ name: m.name, u18: m.is_under_18 })));
        setSi(typeof st.step === "number" ? st.step : 1);
        setChecking(false);
      } catch (err) {
        // A 404 genuinely means "no venue for this account yet" → start
        // onboarding at step 0. Anything else — a 500/503 (backend down mid-
        // deploy), a network drop — is an API failure, NOT a missing venue.
        // Dropping a live manager into re-setup on a transient blip is the
        // exact trap that made an outage look like "start setup"; show a retry.
        if (err instanceof ApiError && err.status === 404) {
          setChecking(false);
        } else {
          setBootError(true);
          setChecking(false);
        }
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
      days,
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
        setVenueToken(created.slug ?? created.link_token);
      } else {
        await updateVenue(venueName.trim());
      }
      persist(1);
      set(1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Venue already exists for this account — adopt it and move on.
        const existing = await getVenue().catch(() => null);
        if (existing) setVenueToken(existing.slug ?? existing.link_token);
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

  // Two named shifts (Day / Evening) — the app schedules named shifts, not raw
  // opening hours — but their real per-day hours + closed days come from the
  // captured `days` and land in `shift_days` (the per-day model), not a single
  // hardcoded weekday pair. A closed day emits no row (the solver's existence
  // gate then never schedules it). The changeover boundary is venue-type-derived
  // (Dan's review): a restaurant/café turns over service late afternoon (17:00),
  // but a wet-led pub/bar/hotel doesn't change gear until the evening trade
  // builds (~18:00), so a 17:00 split would put prime early-evening trade on the
  // day crew. The manager can rename these or add more shifts in Settings.
  // Idempotent.
  async function persistShifts() {
    const existing = await listShifts().catch(() => []);
    if (existing.length > 0) return;

    const SPLIT = venue === "resto" || venue === "cafe" ? "17:00" : "18:00"; // Day/Evening boundary
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const splitMin = toMin(SPLIT);

    type Row = { day_index: number; start_time: string; end_time: string; min_staff: number; max_staff: number };
    const dayRows: Row[] = [];
    const eveRows: Row[] = [];
    days.forEach((d, i) => {
      if (d.closed) return;
      const openMin = toMin(d.open);
      const closeMin = toMin(d.close);
      const crossesMidnight = closeMin <= openMin; // e.g. close 01:00 after open 11:00
      const closesAfterSplit = crossesMidnight || closeMin > splitMin;
      // Day band: open .. 17:00 (or the real early close), when the venue opens
      // before 5pm.
      if (openMin < splitMin) {
        dayRows.push({
          day_index: i,
          start_time: fmtTime(d.open),
          end_time: fmtTime(closesAfterSplit ? SPLIT : d.close),
          min_staff: 1,
          max_staff: 2,
        });
      }
      // Evening band: 17:00 (or a later open) .. close, when the venue is open
      // past 5pm.
      if (closesAfterSplit) {
        eveRows.push({
          day_index: i,
          start_time: fmtTime(openMin >= splitMin ? d.open : SPLIT),
          end_time: fmtTime(d.close),
          min_staff: 1,
          max_staff: 2,
        });
      }
    });

    // Representative shift-level times (setShiftSchedule mirrors the first open
    // day onto shifts.* anyway; these are just sensible creation defaults).
    const rep = days.find((x) => !x.closed) ?? days[0];
    const dayShift = await createShift({ name: "Day", start_time: fmtTime(rep.open), end_time: fmtTime(SPLIT), color: SHIFT_COLORS[0], sort_order: 0 });
    const eveShift = await createShift({ name: "Evening", start_time: fmtTime(SPLIT), end_time: fmtTime(rep.close), color: SHIFT_COLORS[2], sort_order: 1 });

    // Write the real per-day schedule; drop a band no open day uses (e.g. an
    // evening-only venue keeps just Evening). At least one always survives.
    if (dayRows.length > 0) await setShiftSchedule(dayShift.id, dayRows);
    else await deleteShift(dayShift.id).catch(() => {});
    if (eveRows.length > 0) await setShiftSchedule(eveShift.id, eveRows);
    else await deleteShift(eveShift.id).catch(() => {});
  }

  async function handleRolesContinue() {
    // A venue with no roles leaves staff on a non-existent "Staff" fallback and
    // an empty coverage step — require at least one.
    if (roles.length === 0) {
      showToast("Add at least one role");
      return;
    }
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
    // A venue open zero days would leave persistShifts deleting both shifts —
    // a broken, unschedulable venue. Require at least one open day.
    if (days.every((d) => d.closed)) {
      showToast("Your venue needs to be open at least one day");
      return;
    }
    setSaving(true);
    try {
      // persistShifts writes the real per-day schedule (incl. closed days) into
      // shift_days. Keep a representative open/close in state + setup_state for
      // resume and the coverage-step copy.
      const rep = days.find((d) => !d.closed) ?? days[0];
      setOpen(rep.open);
      setClose(rep.close);
      await persistShifts();
      // Seed coverage defaults for the first three roles now that we're leaving.
      const base = [3, 2, 2];
      const cov: Record<string, number> = {};
      roles.slice(0, 3).forEach((r, i) => (cov[r] = coverage[r] ?? base[i] ?? 1));
      setCoverage(cov);
      persist(4, { coverage: cov, open: rep.open, close: rep.close });
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
      // A fresh venue has no availability yet, so the solve produces nothing —
      // the real payoff is the invite screen. Make sure a join PIN exists for it.
      if (!joinPin) {
        const res = await rotateJoinCode().catch(() => null);
        if (res) setJoinPin(res.join_pin);
      }
    } catch {
      /* setup writes are best-effort; the invite screen still works */
    }
  }

  // Copy the join link + venue PIN together — the one action that makes the
  // next rota real. Reuses the join primitive; adds the PIN to the copied text.
  async function copyInvite() {
    const link = venueToken ? `${window.location.origin}/v/${venueToken}` : "";
    const text = joinPin
      ? `Join our team on Rotally: ${link}\nVenue PIN: ${joinPin}`
      : link;
    await navigator.clipboard.writeText(text).catch(() => {});
    showToast("Link & PIN copied — paste it to your team");
  }

  async function finishOnboarding() {
    await saveSetupState(null).catch(() => {});
    router.push("/dashboard");
  }

  // ── Renders ───────────────────────────────────────────────────────────────
  if (resendWall) return <ResendWall />;
  if (bootError) return <BootError onRetry={() => window.location.reload()} />;
  if (checking) return <Centered><Waiting label="Loading…" /></Centered>;

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
          {si === 7 && (
            <StepSolve
              onFinish={finishOnboarding}
              onGenerate={handleGenerate}
              team={team}
              joinPin={joinPin}
              venueToken={venueToken}
              onCopy={copyInvite}
            />
          )}
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

      {/* Hours overlays — rendered at the root (outside the transformed .ob-step)
          so their fixed positioning is relative to the viewport, not the step. */}
      <div className={`ob-vscrim ${daySheet ? "open" : ""}`} onClick={() => setDaySheet(false)} />
      <div className={`ob-daysheet ${daySheet ? "open" : ""}`} role="dialog" aria-label="Set each day">
        <div className="ob-grab" />
        <div className="ob-dshead">
          <div>
            <div className="st">Set each day</div>
            <div className="ss">Overrides the group hours for that day</div>
          </div>
          <button className="ob-dsclose" onClick={() => setDaySheet(false)} aria-label="Close"><OIcon name="x" size={15} /></button>
        </div>
        <div className="ob-dsbody">
          {DAY_NAMES.map((dn, i) => {
            const d = days[i];
            return (
              <div key={dn} className={`ob-drow ${d.closed ? "closed" : ""} ${i >= 4 ? "wknd" : ""}`}>
                <div className="ob-dname">{dn}</div>
                {!d.closed && (
                  <div className="ob-dtimes">
                    <button className="ob-tpill" onClick={() => openTimePicker([i], "open", `${dn} — opens`)}>{fmtTime(d.open)}</button>
                    <span className="ob-tdash">to</span>
                    <button className="ob-tpill" onClick={() => openTimePicker([i], "close", `${dn} — closes`)}>{fmtTime(d.close)}</button>
                  </div>
                )}
                <div className="ob-dclosed">
                  <span>Closed</span>
                  <button
                    className={`ob-sw ${d.closed ? "on" : ""}`}
                    aria-label={`${dn} closed`}
                    onClick={() => setDays((prev) => prev.map((x, j) => (j === i ? { ...x, closed: !x.closed } : x)))}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="ob-dsfoot"><button className="ob-btn" onClick={() => setDaySheet(false)}>Done</button></div>
      </div>

      <TimeWheel
        open={!!picker}
        value={picker?.value ?? "11:00"}
        label={picker?.label ?? ""}
        onClose={() => setPicker(null)}
        onSet={(v) => {
          const p = picker;
          if (p) setDays((prev) => prev.map((d, i) => (p.target.includes(i) ? { ...d, [p.field]: v, closed: false } : d)));
          setPicker(null);
        }}
      />
    </div>
  );

  // CTA per step
  function renderCta() {
    if (si === 0)
      return (
        <button className="ob-btn" onClick={handleStart} disabled={saving}>
          {saving ? <Waiting label="Starting…" /> : "Start setup"} <OIcon name="arrow-right" size={17} />
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
          {saving ? <Waiting label="Saving…" /> : "Looks right"} <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 3)
      return (
        <button className="ob-btn" onClick={handleHoursContinue} disabled={saving}>
          {saving ? <Waiting label="Saving…" /> : "Continue"} <OIcon name="arrow-right" size={17} />
        </button>
      );
    if (si === 4)
      return team.length ? (
        <button className="ob-btn" onClick={() => { persist(5); set(5); }}>
          Continue with {team.length} <OIcon name="arrow-right" size={17} />
        </button>
      ) : (
        <button className="ob-btn ghost" onClick={() => { persist(5); set(5); }}>
          Skip — I&apos;ll invite them next
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
          <OIcon name="sparkles" size={17} /> Finish setup
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
        <div className="ob-p">A few quick questions and your venue&apos;s set up. Your progress saves as you go.</div>
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

  function openTimePicker(target: number[], field: "open" | "close", label: string) {
    const ref = days[target[0]];
    setPicker({ target, field, value: field === "open" ? ref.open : ref.close, label });
  }

  function StepHours() {
    return (
      <div>
        <div className="ob-eyebrow">Opening hours</div>
        <div className="ob-h">When are you open?</div>
        <div className="ob-p">Most pubs run on three rhythms. Set each — you can fine-tune any single day below.</div>
        {HOUR_GROUPS.map((g) => {
          const s = groupSummary(days, g.days);
          return (
            <div key={g.label} className={`ob-grp ${g.wknd ? "wknd" : ""}`}>
              <div>
                <div className="ob-glabel">{g.label}</div>
                <div className="ob-gsub">
                  {g.sub}
                  {s.varies && <span className="diff"> · varies</span>}
                </div>
              </div>
              {s.closed ? (
                <button className="ob-tpill" onClick={() => setDaySheet(true)}>Closed</button>
              ) : (
                <div className="ob-gtimes">
                  <button className="ob-tpill" onClick={() => openTimePicker(g.days, "open", `${g.label} — opens`)}>{fmtTime(s.open)}</button>
                  <span className="ob-tdash">to</span>
                  <button className="ob-tpill" onClick={() => openTimePicker(g.days, "close", `${g.label} — closes`)}>{fmtTime(s.close)}</button>
                </div>
              )}
            </div>
          );
        })}
        <button className="ob-note" onClick={() => setDaySheet(true)}>
          <span className="ob-nic"><OIcon name="calendar" size={15} /></span>
          <span className="ob-ntxt">
            <span className="ob-nt">Different hours on a certain day?</span>
            <span className="ob-ns">Set each day individually</span>
          </span>
          <span className="ob-nchev"><OIcon name="arrow-right" size={16} /></span>
        </button>
        <div className="ob-hint">
          <OIcon name="info-circle" size={12} /> Closing after midnight is fine — set 1:00am or 2:30am. Change hours anytime in Settings.
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

// ── Step 7: honest "setup saved" beat → invite-first landing ────────────────
// No fake rota / forced tour: a brand-new venue's first rota is necessarily
// empty (no availability yet), so the payoff is the one action that makes the
// NEXT rota real — sharing the join link + PIN so staff submit availability.
const SOLVE_STEPS = ["Saving your roles & shifts", "Applying your coverage levels", "Setting working-time rules", "Preparing your venue"];

function StepSolve({
  onFinish,
  onGenerate,
  team,
  joinPin,
  venueToken,
  onCopy,
}: {
  onFinish: () => void;
  onGenerate: () => void;
  team: Team[];
  joinPin: string | null;
  venueToken: string | null;
  onCopy: () => void;
}) {
  const [done, setDone] = useState(-1); // index of last completed setup line
  const [finished, setFinished] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
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
    }, 550);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (showInvite) return <InviteScreen team={team} joinPin={joinPin} venueToken={venueToken} onCopy={onCopy} onFinish={onFinish} />;

  return (
    <>
      <div className="ob-solve">
        <div className={`ob-ring ${finished ? "done" : ""}`}>
          {finished ? <OIcon name="check" size={32} /> : <span className="spin"><OIcon name="loader" size={32} /></span>}
        </div>
        <div className="ob-h" style={{ textAlign: "center" }}>{finished ? "Your venue’s ready" : "Setting up your venue…"}</div>
        <div className="ob-p" style={{ textAlign: "center", marginBottom: 0 }}>
          {finished ? "Roles, hours, coverage and safe rules are all saved." : "Saving your setup"}
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
          <button className="ob-btn" onClick={() => setShowInvite(true)}>
            Bring in my team <OIcon name="arrow-right" size={17} />
          </button>
        </div>
      )}
    </>
  );
}

function InviteScreen({
  team,
  joinPin,
  venueToken,
  onCopy,
  onFinish,
}: {
  team: Team[];
  joinPin: string | null;
  venueToken: string | null;
  onCopy: () => void;
  onFinish: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = venueToken ? `${origin.replace(/^https?:\/\//, "")}/v/${venueToken}` : "your venue link";
  const pin = (joinPin ?? "····").padEnd(4, "·").slice(0, 4).split("");

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <>
      <div className="ob-step ob-invite">
        <div className="ob-eyebrow">You’re all set</div>
        <div className="ob-h">Bring in your crew</div>
        <div className="ob-p">Your first real rota fills up the moment your team shares when they can work. Send them this.</div>

        <div className="ob-joincard">
          <div className="ob-jclabel">Join link + venue PIN</div>
          <div className="ob-pinrow">
            {pin.map((d, i) => (
              <div key={i} className="ob-pindig">{d}</div>
            ))}
          </div>
          <div className="ob-linkrow">
            <span className="ob-lk">{link}</span>
            <span className="ob-lkic"><OIcon name="link" size={15} /></span>
          </div>
          <button className={`ob-copybtn ${copied ? "done" : ""}`} onClick={handleCopy}>
            <OIcon name={copied ? "check" : "share"} size={16} /> {copied ? "Copied" : "Copy link & PIN"}
          </button>
        </div>

        <div className="ob-why">
          <span className="ic"><OIcon name="bulb" size={15} /></span>
          <span>Staff open the link, enter the PIN, and tell you when they’re free. Then your first rota is one tap from great.</span>
        </div>

        {team.length > 0 && (
          <>
            <div className="ob-group">You’ve added {team.length} — invite the rest</div>
            {team.map((m, i) => (
              <div key={i} className="ob-tm">
                <div className="ob-av">{m.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div className="ob-rn">{m.name}{m.u18 && <span className="ob-u18">U18</span>}</div>
                  <div className="ob-rt">will join with the link above</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="ob-cta">
        <button className="ob-btn ghost" onClick={onFinish}>Go to my dashboard →</button>
      </div>
    </>
  );
}

function ResendWall() {
  return (
    <div className="cp-manager cp-onboarding">
      <div className="ob-shell" style={{ justifyContent: "center", alignItems: "center", padding: "0 24px", textAlign: "center" }}>
        <div className="ob-ring" style={{ marginBottom: 20 }}><OIcon name="info-circle" size={30} /></div>
        <div className="ob-h">This link has expired</div>
        <div className="ob-p" style={{ maxWidth: 300 }}>
          Setup links work once and for 7 days. Ask your Rotally contact to send a fresh one, and you&apos;ll be set up in a few minutes.
        </div>
        <a className="ob-btn" style={{ maxWidth: 300 }} href={`mailto:${SUPPORT_EMAIL}?subject=Resend%20my%20setup%20link`}>Request a new link</a>
      </div>
    </div>
  );
}

function BootError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="cp-manager cp-onboarding">
      <div className="ob-shell" style={{ justifyContent: "center", alignItems: "center", padding: "0 24px", textAlign: "center" }}>
        <div className="ob-ring" style={{ marginBottom: 20 }}><OIcon name="info-circle" size={30} /></div>
        <div className="ob-h">We couldn&apos;t load your venue</div>
        <div className="ob-p" style={{ maxWidth: 300 }}>
          This is a connection hiccup, not your account — your venue is safe. Give it a moment and try again.
        </div>
        <button className="ob-btn" style={{ maxWidth: 300 }} onClick={onRetry}>Try again</button>
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
    <Suspense fallback={<Centered><Waiting label="Loading…" /></Centered>}>
      <OnboardingWizard />
    </Suspense>
  );
}
