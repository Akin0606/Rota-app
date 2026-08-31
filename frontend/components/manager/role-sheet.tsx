"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  Role,
  StaffManager,
  createRole,
  deleteRole,
  updateRole,
} from "@/lib/api";

import BottomSheet from "./bottom-sheet";
import ManagerIcon, { type ManagerIconName } from "./icon";
import Waiting from "@/components/waiting";

// The picker set — role-appropriate glyphs from the manager icon set.
const ROLE_ICONS: ManagerIconName[] = [
  "user",
  "glass",
  "chef-hat",
  "users",
  "star",
  "building",
  "broom",
  "shield",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type RoleSheetProps = {
  open: boolean;
  // null = add a new role; a Role = edit it.
  role: Role | null;
  staff: StaffManager[];
  onClose: () => void;
  onSaved: (role: Role) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
};

export default function RoleSheet({
  open,
  role,
  staff,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: RoleSheetProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("users");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Re-hydrate whenever the sheet opens (or switches between add/edit).
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setIcon(role?.icon ?? "users");
    setStaffIds(role?.staff_ids ?? []);
    setSaving(false);
  }, [open, role]);

  const editing = role !== null;

  function toggleStaff(id: string) {
    setStaffIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      onError("Give the role a name");
      return;
    }
    setSaving(true);
    try {
      const saved = editing
        ? await updateRole(role.id, { name: trimmed, icon, staff_ids: staffIds })
        : await createRole({ name: trimmed, icon, staff_ids: staffIds });
      onSaved(saved);
      onClose();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not save the role");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteRole(role.id);
      onDeleted(role.id);
      onClose();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Could not delete the role");
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit role" : "Add a role"}
      footer={
        <>
          <button
            onClick={onClose}
            className="flex-1 rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle py-3.5 text-center text-sm font-medium text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-cp-control bg-accent py-3.5 text-center text-sm font-semibold text-accent-on disabled:opacity-60"
          >
            <ManagerIcon name="check" size={15} />
            {saving ? <Waiting label="Saving…" /> : editing ? "Save changes" : "Add role"}
          </button>
        </>
      }
    >
      <div className="mb-6">
        <div className="mb-2.5 text-xs font-medium text-ink-muted">Role name</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Host"
          maxLength={40}
          className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-3 text-[15px] font-medium text-ink outline-none"
        />
      </div>

      <div className="mb-6">
        <div className="mb-2.5 text-xs font-medium text-ink-muted">Icon</div>
        <div className="flex flex-wrap gap-2">
          {ROLE_ICONS.map((ic) => (
            <button
              key={ic}
              onClick={() => setIcon(ic)}
              aria-label={`Icon ${ic}`}
              className={`flex h-[46px] w-[46px] items-center justify-center rounded-cp-control border-[0.5px] ${
                icon === ic
                  ? "border-accent bg-accent-light text-accent"
                  : "border-hairline bg-surface-subtle text-ink-muted"
              }`}
            >
              <ManagerIcon name={ic} size={19} />
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-2.5 text-xs font-medium text-ink-muted">Who can work this role?</div>
        {staff.length === 0 ? (
          <div className="rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-3 text-[13px] text-ink-faint">
            No team members yet — add people first, then choose who works this role.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => {
              const on = staffIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStaff(s.id)}
                  className={`flex items-center gap-2 rounded-[10px] border-[0.5px] py-1.5 pl-1.5 pr-3 ${
                    on ? "border-accent bg-accent-light" : "border-hairline bg-surface-subtle"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                      on ? "bg-accent text-accent-on" : "bg-cp-icon text-ink-muted"
                    }`}
                  >
                    {initials(s.name)}
                  </span>
                  <span className={`text-[13px] font-medium ${on ? "text-ink" : "text-ink-muted"}`}>
                    {s.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Advanced solver rules (keyholder / under-18 gate) are deliberately not
          here yet: both need role-based shift coverage in the solver to act on,
          which doesn't exist. Shipping them as toggles that change nothing would
          be a dead input — flagged honestly instead. */}
      <div className="mt-5 flex items-start gap-2.5 rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-3">
        <span className="mt-0.5 text-ink-faint">
          <ManagerIcon name="info-circle" size={14} />
        </span>
        <div className="text-[11px] leading-[1.5] text-ink-faint">
          Advanced solver rules (require a keyholder, allow under-18s) arrive with role-based
          shift coverage — they need it to take effect.
        </div>
      </div>

      {editing && (
        <button
          onClick={handleDelete}
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-cp-control border-[0.5px] border-cp-red/30 bg-cp-red-soft py-3 text-[13px] font-medium text-cp-red disabled:opacity-60"
        >
          <ManagerIcon name="trash" size={14} />
          Delete role
        </button>
      )}
    </BottomSheet>
  );
}
