"use client";

import { useEffect, useState } from "react";

import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  ApiError,
  Period,
  StaffManager,
  Venue,
  createStaff,
  getVenue,
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
};

const EMPTY_FORM: FormState = { name: "", email: "", phone: "", role: "Server" };

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [venueRes, staffRes, periodsRes] = await Promise.all([getVenue(), listStaff(), listPeriods()]);
        if (cancelled) return;
        setVenue(venueRes);
        setStaff(staffRes);
        setPeriod(periodsRes.find((p) => p.status === "collecting") ?? periodsRes[0] ?? null);
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
        });
        setStaff((prev) => [...prev, created]);
        showToast(`${created.name.split(" ")[0]} added — PIN ${created.pin}`);
      } else if (modalMode === "edit" && editingId) {
        const updated = await updateStaff(editingId, {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
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
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
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

      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {staff.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No team members yet.</div>
        ) : (
          staff.map((member, i) => (
            <div
              key={member.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-4 ${
                i < staff.length - 1 ? "border-b border-surface-page" : ""
              } ${member.is_active ? "" : "opacity-50"}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold ${
                  member.is_active ? "bg-accent-border text-accent" : "bg-surface-page text-ink-faint"
                }`}
              >
                {initials(member.name)}
              </div>
              <div className="min-w-[140px] flex-1">
                <div className="text-sm font-semibold text-ink">{member.name}</div>
                <div className="text-xs text-ink-faint">{member.email || "No email"}</div>
              </div>
              <div className="w-24 text-[13px] text-ink-label">{member.role}</div>
              <div className="w-20 rounded-md bg-surface-page px-2 py-1 text-center text-[11px] font-bold tracking-wide text-ink-label">
                {member.pin}
              </div>
              <div
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  member.is_active ? "bg-avail-bg text-avail-text" : "bg-surface-page text-ink-faint"
                }`}
              >
                {member.is_active ? "Active" : "Inactive"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {member.is_active ? (
                  <>
                    <button
                      onClick={() => openEdit(member)}
                      className="rounded-lg bg-surface-subtle px-3 py-2 text-xs font-medium text-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleResetPin(member)}
                      className="rounded-lg bg-surface-subtle px-3 py-2 text-xs font-medium text-ink-muted"
                    >
                      Reset PIN
                    </button>
                    <button
                      onClick={() => handleRemind(member)}
                      className="rounded-lg bg-surface-subtle px-3 py-2 text-xs font-medium text-ink-muted"
                    >
                      Remind
                    </button>
                    <button
                      onClick={() => toggleActive(member)}
                      className="rounded-lg bg-surface-subtle px-3 py-2 text-xs font-medium text-ink-muted"
                    >
                      Deactivate
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => toggleActive(member)}
                    className="rounded-lg bg-surface-subtle px-3 py-2 text-xs font-medium text-accent"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
