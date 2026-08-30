"use client";

import { useEffect, useMemo, useState } from "react";

import Toast from "@/components/toast";
import {
  AdminApiError,
  Suggestion,
  SuggestionStatus,
  listSuggestions,
  setSuggestionStatus,
} from "@/lib/admin-api";
import Mark from "@/components/mark";

const FILTERS: { key: SuggestionStatus | "all"; label: string }[] = [
  { key: "new", label: "New" },
  { key: "read", label: "Read" },
  { key: "actioned", label: "Actioned" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

// What each status can move to next. Keeping this as data rather than a chain of
// conditionals means the row's buttons and the allowed transitions can't drift.
const NEXT: Record<SuggestionStatus, SuggestionStatus[]> = {
  new: ["read", "archived"],
  read: ["actioned", "archived"],
  actioned: ["archived"],
  archived: ["read"],
};

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  new: "bg-warn-bg text-warn-text",
  read: "bg-accent-light text-accent",
  actioned: "bg-avail-bg text-avail-text",
  archived: "bg-surface-page text-ink-faint",
};

export default function AdminSuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<SuggestionStatus | "all">("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSuggestions()
      .then((res) => {
        if (!cancelled) setItems(res);
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
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function move(item: Suggestion, status: SuggestionStatus) {
    setBusyId(item.id);
    try {
      const updated = await setSuggestionStatus(item.id, status);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not update that.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Mark spinning className="h-6 w-6 text-ink-faint" />
        <div className="text-sm text-ink-muted">Loading suggestions…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center text-sm text-ink-muted">
        Could not load suggestions.
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <div className="text-[13px] font-medium text-ink-faint">
          What people are telling us from the site
        </div>
        <div className="font-display text-[26px] font-bold text-ink md:text-[28px]">
          Suggestions ({items.length})
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              filter === f.key
                ? "bg-accent text-white"
                : "border border-hairline bg-surface-card text-ink-muted"
            }`}
          >
            {f.label}
            {counts[f.key] ? ` (${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">
            {filter === "all" ? "Nothing sent in yet." : `No ${filter} suggestions.`}
          </div>
        ) : (
          shown.map((s, i) => (
            <div
              key={s.id}
              className={`px-5 py-4 ${i < shown.length - 1 ? "border-b border-surface-page" : ""}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[s.status]}`}
                >
                  {s.status}
                </span>
                <span className="text-xs text-ink-faint">
                  {new Date(s.created_at).toLocaleString()}
                </span>
                {s.email ? (
                  <a
                    href={`mailto:${s.email}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {s.email}
                  </a>
                ) : (
                  <span className="text-xs text-ink-faint">no email — anonymous</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{s.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {NEXT[s.status].map((next) => (
                  <button
                    key={next}
                    onClick={() => move(s, next)}
                    disabled={busyId === s.id}
                    className="rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-muted disabled:opacity-50"
                  >
                    Mark {next}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
