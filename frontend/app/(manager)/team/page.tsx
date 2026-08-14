"use client";

import { useEffect, useState } from "react";

import LoadingScreen from "@/components/loading-screen";
import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  ApiError,
  Period,
  StaffManager,
  Venue,
  VenueLeaveSettings,
  createStaff,
  getVenue,
  getVenueLeaveSettings,
  listPeriods,
  listStaff,
  remindStaff,
  resetStaffPin,
  updateStaff,
} from "@/lib/api";
import { STAFF_ROLES } from "@/lib/constants";

const ROLES = STAFF_ROLES;

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type FormState = {
  name: string;
  email: string;
  phone: string;
  role: string;
  isUnder18: boolean;
  // Leave fields are edit-only: a new starter gets the venue defaults, and
  // asking for a holiday entitlement while adding someone to a rota is noise.
  workingDays: string;
  leaveDays: string;
};

// Mirrors services/leave.entitlement_days so the placeholder shows what will
// actually be used if the field is left blank.
function proRataPlaceholder(workingDays: string, fullTime: number | undefined): string {
  const w = Number(workingDays);
  if (!Number.isFinite(w) || w <= 0) return "28";
  return String(Math.ceil(((fullTime ?? 28) * w) / 5 / 0.5) * 0.5);
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  role: "Server",
  isUnder18: false,
  workingDays: "5",
  leaveDays: "",
};

export default function TeamPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  // Only needed for the pro-rata placeholder in the edit modal, so a failure
  // here just falls back to the statutory 28.
  const [leaveSettings, setLeaveSettings] = useState<VenueLeaveSettings | null>(null);

  useEffect(() => {
    getVenueLeaveSettings().then(setLeaveSettings).catch(() => {});
  }, []);

  // Honour ?filter=pending from the dashboard Availability card.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPendingOnly(new URLSearchParams(window.location.search).get("filter") === "pending");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [venueRes, periodsRes] = await Promise.all([getVenue(), listPeriods()]);
        if (cancelled) return;
        const current = periodsRes.find((p) => p.status === "collecting") ?? periodsRes[0] ?? null;
        const staffRes = await listStaff(current?.id);
        if (cancelled) return;
        setVenue(venueRes);
        setPeriod(current);
        setStaff(staffRes);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function copyLink() {
    if (!venue) return;
    navigator.clipboard.writeText(`${window.location.origin}/v/${venue.link_token}`);
    showToast("Link copied!");
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setModalMode("add");
  }

  function openEdit(member: StaffManager) {
    setEditingId(member.id);
    setForm({
      name: member.name,
      email: member.email ?? "",
      phone: member.phone ?? "",
      role: member.role,
      isUnder18: member.is_under_18,
      workingDays: String(member.working_days_per_week ?? 5),
      // Blank means "use the pro-rata figure" rather than a stored zero.
      leaveDays: member.annual_leave_days === null ? "" : String(member.annual_leave_days),
    });
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      showToast("Please enter a name");
      return;
    }
    setSaving(true);
    try {
      if (modalMode === "add") {
        const created = await createStaff({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          is_under_18: form.isUnder18,
        });
        setStaff((prev) => [...prev, created]);
        showToast(`${created.name.split(" ")[0]} added — PIN ${created.pin}`);
      } else if (modalMode === "edit" && editingId) {
        const workingDays = Number(form.workingDays);
        const updated = await updateStaff(editingId, {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          is_under_18: form.isUnder18,
          working_days_per_week:
            Number.isFinite(workingDays) && workingDays > 0 && workingDays <= 7 ? workingDays : 5,
          // Explicitly null when blank, which returns them to the pro-rata
          // calculation instead of freezing whatever was there.
          annual_leave_days: form.leaveDays.trim() === "" ? null : Number(form.leaveDays),
        });
        setStaff((prev) => prev.map((m) => (m.id === editingId ? { ...m, ...updated } : m)));
        showToast(`${updated.name.split(" ")[0]} updated`);
      }
      closeModal();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member: StaffManager) {
    try {
      const updated = await updateStaff(member.id, { is_active: !member.is_active });
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
    } catch {
      showToast("Could not update status");
    }
  }

  async function handleRemind(member: StaffManager) {
    try {
      const result = await remindStaff({ staffId: member.id, periodId: period?.id });
      showToast(
        result.email_sent
          ? `Reminder emailed to ${member.name.split(" ")[0]}`
          : member.email
            ? `Could not email ${member.name.split(" ")[0]} — check their email address`
            : `${member.name.split(" ")[0]} has no email on file — nothing sent`,
      );
    } catch {
      showToast("Could not send reminder");
    }
  }

  async function handleResetPin(member: StaffManager) {
    try {
      const updated = await resetStaffPin(member.id);
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
      showToast(`New PIN for ${member.name.split(" ")[0]}: ${updated.pin}`);
    } catch {
      showToast("Could not reset PIN");
    }
  }

  if (loading) {
    return <LoadingScreen base="Loading your team…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading your team.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[26px] font-bold text-ink md:text-[28px]">Team</div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={copyLink}
            className="rounded-[10px] border border-accent-border bg-surface-card px-4 py-2.5 text-sm font-medium text-accent"
          >
            Copy team link
          </button>
          <button onClick={openAdd} className="rounded-[10px] bg-accent px-4 py-2.5 text-sm font-semibold text-white">
            + Add team member
          </button>
        </div>
      </div>

      {pendingOnly && (
        <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn-text">
            Showing pending
          </span>
          <button onClick={() => setPendingOnly(false)} className="font-semibold text-accent">
            Show all
          </button>
        </div>
      )}

      {(() => {
        const visible = pendingOnly
          ? staff.filter((m) => m.is_active && !m.submitted)
          : staff;
        if (staff.length === 0) {
          return (
            <div className="rounded-panel border border-hairline bg-surface-card p-10 text-center text-sm text-ink-faint">
              No team members yet.
            </div>
          );
        }
        if (visible.length === 0) {
          return (
            <div className="rounded-panel border border-hairline bg-surface-card p-10 text-center text-sm text-ink-faint">
              Everyone&apos;s submitted — nobody pending.
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-2.5">
            {visible.map((member) => {
              const expanded = expandedId === member.id;
              return (
                <div
                  key={member.id}
                  className={`overflow-hidden rounded-panel border bg-surface-card ${
                    expanded ? "border-accent-border" : "border-hairline"
                  } ${member.is_active ? "" : "opacity-60"}`}
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : member.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold ${
                        member.is_active ? "bg-accent-border text-accent" : "bg-surface-page text-ink-faint"
                      }`}
                    >
                      {initials(member.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{member.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                        {member.role}
                        {member.is_under_18 && (
                          <span className="rounded-full bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn-text">
                            Under 18
                          </span>
                        )}
                      </div>
                    </div>
                    {member.submitted !== null && member.is_active && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          member.submitted ? "bg-avail-bg text-avail-text" : "bg-warn-bg text-warn-text"
                        }`}
                      >
                        {member.submitted ? "Submitted" : "Pending"}
                      </span>
                    )}
                    {!member.is_active && (
                      <span className="shrink-0 rounded-full bg-surface-page px-2.5 py-1 text-[11px] font-semibold text-ink-faint">
                        Inactive
                      </span>
                    )}
                    <span
                      className={`shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-180" : ""}`}
                    >
                      ⌄
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-surface-page px-4 py-3.5">
                      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]">
                        <div>
                          <span className="text-ink-faint">Email </span>
                          <span className="text-ink-label">{member.email || "—"}</span>
                        </div>
                        <div>
                          <span className="text-ink-faint">PIN </span>
                          <span className="font-bold tracking-wide text-ink-label">{member.pin}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {member.is_active ? (
                          <>
                            <button
                              onClick={() => openEdit(member)}
                              className="rounded-lg bg-surface-subtle px-3.5 py-2 text-xs font-medium text-accent"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleResetPin(member)}
                              className="rounded-lg bg-surface-subtle px-3.5 py-2 text-xs font-medium text-ink-muted"
                            >
                              Reset PIN
                            </button>
                            <button
                              onClick={() => handleRemind(member)}
                              className="rounded-lg bg-surface-subtle px-3.5 py-2 text-xs font-medium text-ink-muted"
                            >
                              Remind
                            </button>
                            <button
                              onClick={() => toggleActive(member)}
                              className="rounded-lg bg-surface-subtle px-3.5 py-2 text-xs font-medium text-unavail-text"
                            >
                              Deactivate
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => toggleActive(member)}
                            className="rounded-lg bg-surface-subtle px-3.5 py-2 text-xs font-medium text-accent"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      <Modal open={modalMode !== null} onClose={closeModal} title={modalMode === "add" ? "Add Team Member" : "Edit Team Member"}>
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold text-ink-label">Full name</div>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Priya Sharma"
            className="w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none"
          />
        </div>
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold text-ink-label">Email</div>
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@example.com"
            className="w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none"
          />
        </div>
        <div className="mb-5">
          <div className="mb-1 text-xs font-semibold text-ink-label">Role</div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setForm((f) => ({ ...f, role: r }))}
                className={`rounded-[10px] border-2 px-3 py-2 text-xs font-semibold ${
                  form.role === r
                    ? "border-accent bg-accent-light text-accent"
                    : "border-transparent bg-surface-subtle text-ink-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="mb-5 flex items-center gap-2.5 text-sm text-ink-label">
          <input
            type="checkbox"
            checked={form.isUnder18}
            onChange={(e) => setForm((f) => ({ ...f, isUnder18: e.target.checked }))}
            className="h-4 w-4 accent-accent"
          />
          This staff member is under 18
        </label>

        {/* Edit only: a new starter takes the venue defaults, and asking about
            holiday entitlement mid-way through adding someone to a rota is
            noise. Both drive the Time off screen this person sees. */}
        {modalMode === "edit" && (
          <div className="mb-5 rounded-panel border border-hairline bg-surface-subtle p-3.5">
            <div className="mb-2.5 text-xs font-semibold text-ink-label">Holiday</div>
            <div className="flex gap-3">
              <label className="min-w-0 flex-1 text-xs font-semibold text-ink-faint">
                Days worked per week
                <input
                  type="number"
                  min="0.5"
                  max="7"
                  step="0.5"
                  value={form.workingDays}
                  onChange={(e) => setForm((f) => ({ ...f, workingDays: e.target.value }))}
                  className="mt-1.5 w-full rounded-[10px] border-[1.5px] border-unset-border bg-surface-card px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
              <label className="min-w-0 flex-1 text-xs font-semibold text-ink-faint">
                Days per year
                <input
                  type="number"
                  min="0"
                  max="366"
                  step="0.5"
                  value={form.leaveDays}
                  onChange={(e) => setForm((f) => ({ ...f, leaveDays: e.target.value }))}
                  placeholder={proRataPlaceholder(form.workingDays, leaveSettings?.full_time_leave_days)}
                  className="mt-1.5 w-full rounded-[10px] border-[1.5px] border-unset-border bg-surface-card px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
            </div>
            <div className="mt-2 text-[11px] leading-[1.45] text-ink-faint">
              Days per week is what a holiday costs them — a week off costs {form.workingDays || "5"} days,
              not 7. Leave the yearly figure blank to use the pro-rata amount.
            </div>
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={closeModal}
            className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : modalMode === "add" ? "Add to team" : "Save changes"}
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
