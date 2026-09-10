"use client";

import { useEffect, useState } from "react";

import ShiftDayEditor from "@/components/manager/shift-day-editor";
import type { Shift } from "@/lib/api";

// Dev-only preview: mounts the REAL manager Edit-shift editor (with the fixed,
// portaled + neutral-skinned TimeWheel) so it can be driven inside Device Lab.
// No backend/auth — window.fetch is stubbed for just the two shift endpoints
// the editor calls (the established monkeypatch pattern), so getShiftSchedule /
// setShiftSchedule / updateShift resolve against canned data.

const SHIFT: Shift = {
  id: "demo",
  name: "Evening",
  start_time: "5:00pm",
  end_time: "11:00pm",
  color: "#6b7280",
  sort_order: 1,
  min_staff: 1,
  max_staff: 2,
};

const SCHEDULE = {
  shift_id: "demo",
  days: Array.from({ length: 7 }, (_, i) => ({
    day_index: i,
    open: true,
    start_time: "5:00pm",
    end_time: "11:00pm",
    min_staff: 1,
    max_staff: 2,
  })),
};

let patched = false;
function installStub() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method || "GET").toUpperCase();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

    if (/\/api\/shifts\/demo\/days$/.test(url)) {
      if (method === "PUT") {
        const days = JSON.parse((init?.body as string) || "{}").days ?? SCHEDULE.days;
        return json({ shift_id: "demo", days });
      }
      return json(SCHEDULE);
    }
    if (/\/api\/shifts\/demo$/.test(url) && method === "PUT") {
      const patch = JSON.parse((init?.body as string) || "{}");
      return json({ ...SHIFT, ...patch });
    }
    return real(input, init);
  };
}

export default function ManagerPickerPreview() {
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    installStub();
  }, []);

  return (
    <div className="cp-manager min-h-screen bg-surface-page p-5 text-ink">
      <div className="mb-3 text-xs uppercase tracking-wide text-ink-faint">Device Lab · manager picker</div>
      <h1 className="mb-4 text-lg font-medium">Edit shift</h1>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-on"
      >
        Open editor
      </button>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm text-surface-page">
          {toast}
        </div>
      )}

      <ShiftDayEditor
        shift={open ? SHIFT : null}
        onClose={() => setOpen(false)}
        onSaved={() => undefined}
        onDelete={() => {
          setToast("Delete tapped (no-op in preview)");
          setTimeout(() => setToast(null), 1600);
        }}
        showToast={(m) => {
          setToast(m);
          setTimeout(() => setToast(null), 1600);
        }}
      />
    </div>
  );
}
