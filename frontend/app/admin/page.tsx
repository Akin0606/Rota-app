"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import Modal from "@/components/modal";
import StatusBanner from "@/components/status-banner";
import Toast from "@/components/toast";
import { AdminApiError, AdminVenue, addAdminManager, listAdminVenues } from "@/lib/admin-api";

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdminVenues()
      .then((res) => {
        if (!cancelled) setVenues(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function openModal() {
    setEmail("");
    setFormError(null);
    setResult(null);
    setModalOpen(true);
  }

  async function handleCreate() {
    if (!email.includes("@")) {
      setFormError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await addAdminManager(email.trim());
      setResult(
        `Account created for ${res.email}. Ask them to sign in at ${res.login_url} with this email — no password needed.`,
      );
      showToast("Manager account created");
      setReloadToken((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load venues.</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-2xl font-bold text-ink">Venues ({venues.length})</div>
        <button
          onClick={openModal}
          className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          + Add Manager
        </button>
      </div>

      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {venues.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No venues yet.</div>
        ) : (
          venues.map((v, i) => {
            const border = i < venues.length - 1 ? "border-b border-surface-page" : "";
            const inner = (
              <>
                <div className="min-w-[180px] flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {v.pending ? v.manager_email : v.name}
                  </div>
                  <div className="text-xs text-ink-faint">{v.manager_email}</div>
                </div>
                <div className="w-32 text-xs text-ink-muted">
                  {new Date(v.created_at).toLocaleDateString()}
                </div>
                <div className="w-20 text-xs text-ink-muted">{v.staff_count} staff</div>
                <div className="w-40">
                  {v.pending ? (
                    <span className="inline-block rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn-text">
                      Awaiting onboarding
                    </span>
                  ) : v.period_status ? (
                    <StatusBanner status={v.period_status} />
                  ) : (
                    <span className="text-xs text-ink-faint">No period</span>
                  )}
                </div>
              </>
            );

            // Pending managers have no venue to drill into yet — render a
            // non-clickable row until they finish onboarding.
            return v.pending ? (
              <div key={v.id} className={`flex flex-wrap items-center gap-3 px-5 py-4 ${border}`}>
                {inner}
              </div>
            ) : (
              <Link
                key={v.id}
                href={`/admin/venues/${v.id}`}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-subtle ${border}`}
              >
                {inner}
              </Link>
            );
          })
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Manager">
        {result ? (
          <div>
            <div className="mb-5 rounded-input border border-avail-border bg-avail-bg px-3.5 py-3 text-[13px] text-avail-text">
              {result}
            </div>
            <button
              onClick={() => setModalOpen(false)}
              className="w-full rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-3 text-[13px] text-ink-muted">
              Creates a confirmed account so this manager can sign in with a login code and run
              onboarding. No public signup needed.
            </div>
            <div className="mb-1 text-xs font-semibold text-ink-label">Manager email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="manager@theirpub.co.uk"
              type="email"
              autoFocus
              className="mb-3 w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            />
            {formError && <div className="mb-3 text-[13px] text-unavail-text">{formError}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Creating…" : "Create account"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
