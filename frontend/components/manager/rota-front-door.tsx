"use client";

import type { StaffManager } from "@/lib/api";

import ManagerIcon from "./icon";
import Waiting from "@/components/waiting";

// R3 — what a fresh week shows instead of an empty grid.
//
// This is where a small-venue manager actually lives: chasing the people who
// haven't sent availability. Priority, top to bottom — an honest readiness line,
// then the names (a number tells you nothing; a name tells you who to also text
// personally), then the consequence, then the two ways out. Never force anyone
// to wait for stragglers: generating with partial availability is legitimate and
// common, and the result is honest about the gaps it couldn't fill.
//
// When nobody is missing, none of the chase machinery renders. Don't build
// tension where there is none.

type FrontDoorProps = {
  weekLabel: string;
  /** False when no period exists for this week yet — nothing to be ready for. */
  hasPeriod: boolean;
  /** Active, approved staff only — a pending self-registrant isn't on the team. */
  staff: StaffManager[];
  onSetUpWeek: () => void;
  settingUp: boolean;
  onGenerate: () => void;
  generating: boolean;
  onCopyPrevious: () => void;
  copying: boolean;
  onRemindAll: () => void;
  remindingAll: boolean;
  onRemindOne: (m: StaffManager) => void;
  remindingId: string | null;
  /** Ids reminded in this session, so the row can confirm it happened. */
  remindedIds: string[];
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function RotaFrontDoor({
  weekLabel,
  hasPeriod,
  staff,
  onSetUpWeek,
  settingUp,
  onGenerate,
  generating,
  onCopyPrevious,
  copying,
  onRemindAll,
  remindingAll,
  onRemindOne,
  remindingId,
  remindedIds,
}: FrontDoorProps) {
  // No period yet — availability has never been opened for this week, so there
  // is nothing to be ready for and no one to chase. One step, honestly named.
  if (!hasPeriod) {
    return (
      <div className="mb-4 rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-5 text-center">
        <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-cp-icon text-ink">
          <ManagerIcon name="circle-plus" size={23} />
        </div>
        <div className="mb-1.5 text-[17px] font-medium tracking-[-0.3px] text-ink">
          {weekLabel} isn&apos;t set up yet
        </div>
        <div className="mb-4 text-[12.5px] leading-[1.5] text-ink-muted">
          Open it and your team can start sending their availability. You can build the rota as soon
          as enough of it is in.
        </div>
        <button
          onClick={onSetUpWeek}
          disabled={settingUp}
          className="w-full rounded-cp-control bg-accent py-[14px] text-[14px] font-medium text-accent-on transition-[transform] active:scale-[0.98] disabled:opacity-60"
        >
          {settingUp ? <Waiting label="Opening…" /> : `Set up ${weekLabel}`}
        </button>
        <button
          onClick={onCopyPrevious}
          disabled={copying}
          className="cp-hairline mt-2 w-full rounded-cp-control py-3 text-[13px] font-medium text-ink-muted transition-[transform] active:scale-[0.98] disabled:opacity-60"
        >
          {copying ? <Waiting label="Copying…" /> : "or start from last week's rota"}
        </button>
      </div>
    );
  }

  const missing = staff.filter((m) => !m.submitted);
  const total = staff.length;
  const submitted = total - missing.length;
  const everyoneIn = missing.length === 0 && total > 0;

  return (
    <div className="mb-4">
      {/* 1 · the readiness line, one honest sentence */}
      <div
        className={`mb-3 rounded-cp-panel border-[0.5px] px-3.5 py-[13px] ${
          everyoneIn ? "border-avail-border bg-avail-bg" : "border-cp-amber/40 bg-cp-amber-soft"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-cp-slot ${
              everyoneIn ? "bg-avail-bg text-cp-green" : "bg-cp-amber-soft text-cp-amber"
            }`}
          >
            <ManagerIcon name={everyoneIn ? "check" : "users"} size={16} />
          </span>
          <div className="min-w-0">
            <div
              className={`text-[13.5px] font-medium ${everyoneIn ? "text-cp-green" : "text-cp-amber"}`}
            >
              {total === 0
                ? "No team members yet"
                : everyoneIn
                  ? "Everyone's sent availability"
                  : `${submitted} of ${total} have sent availability`}
            </div>
            <div className="mt-px text-[11.5px] text-ink-muted">
              {total === 0
                ? "Add your team, then they can send their weeks."
                : everyoneIn
                  ? `All ${total} in for ${weekLabel} — nobody to chase.`
                  : `for ${weekLabel}`}
            </div>
          </div>
        </div>
      </div>

      {/* 2 · who hasn't sent — by name, each with its own nudge */}
      {missing.length > 0 && (
        <>
          <div className="mb-2 px-0.5 text-[10px] uppercase tracking-[0.11em] text-ink-faint">
            Waiting on
          </div>
          <div className="mb-3 flex flex-col gap-[7px]">
            {missing.map((m) => {
              const done = remindedIds.includes(m.id);
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 rounded-cp-control border-[0.5px] border-hairline bg-surface-card px-2.5 py-2"
                >
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-cp-icon text-[11px] font-medium text-ink-muted">
                    {initials(m.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {m.name}
                    <span className="ml-1.5 text-[10.5px] font-normal text-ink-faint">{m.role}</span>
                  </span>
                  <button
                    onClick={() => onRemindOne(m)}
                    disabled={remindingId === m.id || done}
                    className={`flex shrink-0 items-center gap-1.5 rounded-cp-slot border-[0.5px] px-3 py-1.5 text-[11.5px] font-medium transition-[transform] active:scale-[0.96] disabled:opacity-70 ${
                      done
                        ? "border-avail-border bg-avail-bg text-cp-green"
                        : "cp-hairline bg-surface-card text-ink-muted"
                    }`}
                  >
                    {remindingId === m.id ? (
                      <Waiting label="…" />
                    ) : done ? (
                      <>
                        <ManagerIcon name="check" size={12} /> Reminded
                      </>
                    ) : (
                      <>
                        <ManagerIcon name="mail" size={12} /> Remind
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 3 · the consequence — a conditional risk, never a fact.
          Deliberately unnamed. Naming who ends up on long hours would mean
          running the assignment, and the solver balances max-hours against rest
          gaps, day-off-in-7, per-day shift existence and availability weights
          all at once. There is no honest way to pick a name before it runs, so
          this says the true thing instead of the specific one. */}
      {missing.length >= 2 && (
        <div className="mb-3.5 flex gap-2.5 rounded-cp-panel border-[0.5px] border-cp-amber/40 bg-cp-amber-soft px-3.5 py-3">
          <span className="mt-px shrink-0 text-cp-amber">
            <ManagerIcon name="alert-triangle" size={17} />
          </span>
          <div className="text-[12px] leading-[1.5] text-ink-muted">
            <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-[0.06em] text-cp-amber">
              Heads up
            </span>
            <strong className="font-medium text-ink">
              {missing.length} people haven&apos;t sent availability yet
            </strong>{" "}
            — the fewer who do, the more hours land on whoever has.
          </div>
        </div>
      )}

      {/* 4 · the two ways out. Chasing leads when there's someone to chase;
          otherwise generating is the whole screen. */}
      {missing.length > 0 ? (
        <>
          <button
            onClick={onRemindAll}
            disabled={remindingAll}
            className="flex w-full items-center justify-center gap-2 rounded-cp-control bg-accent py-[14px] text-[14px] font-medium text-accent-on transition-[transform] active:scale-[0.98] disabled:opacity-60"
          >
            {remindingAll ? (
              <Waiting label="Sending…" />
            ) : (
              <>
                <ManagerIcon name="mail" size={16} />
                Remind {missing.length === 1 ? "them" : `all ${missing.length}`}
              </>
            )}
          </button>
          <div className="my-2.5 flex items-center gap-2.5 text-[11px] text-ink-faint">
            <span className="h-px flex-1 bg-hairline" />
            or
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="cp-hairline w-full rounded-cp-control bg-surface-card py-3 text-[13px] font-medium text-ink transition-[transform] active:scale-[0.98] disabled:opacity-60"
          >
            {generating ? <Waiting label="Generating…" /> : "Generate with who I've got"}
          </button>
          <div className="mt-2 text-center text-[10.5px] text-ink-faint">
            Reminders go by email. Nobody has to wait for stragglers.
          </div>
        </>
      ) : (
        <div className="rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-5 text-center">
          <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-cp-icon text-ink">
            <ManagerIcon name="sparkles" size={23} />
          </div>
          <div className="mb-1.5 text-[17px] font-medium tracking-[-0.3px] text-ink">
            {total === 0 ? `Build the rota for ${weekLabel}` : `Ready to build ${weekLabel}`}
          </div>
          <div className="mb-4 text-[12.5px] leading-[1.5] text-ink-muted">
            Fair hours, rest gaps and under-18 rules all handled for you.
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-cp-control bg-accent py-[14px] text-[14px] font-medium text-accent-on transition-[transform] active:scale-[0.98] disabled:opacity-60"
          >
            {generating ? (
              <Waiting label="Generating…" />
            ) : (
              <>
                <ManagerIcon name="sparkles" size={16} /> Generate rota
              </>
            )}
          </button>
          <button
            onClick={onCopyPrevious}
            disabled={copying}
            className="cp-hairline mt-2 w-full rounded-cp-control py-3 text-[13px] font-medium text-ink-muted transition-[transform] active:scale-[0.98] disabled:opacity-60"
          >
            {copying ? <Waiting label="Copying…" /> : "or start from last week's rota"}
          </button>
        </div>
      )}
    </div>
  );
}
