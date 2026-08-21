# StaffBottomNav — implementation-ready visual spec

Design values only, no motion. Mirrors `components/manager/nav.tsx` on the `.cp-staff` palette. Every colour utility (`bg-surface-page`, `text-accent`, `text-ink-muted`, `border-hairline`) resolves to the staff tokens inside a `.cp-staff` root.

---

## 1. Bar container

| Property | Value |
|---|---|
| Position | `fixed inset-x-0 bottom-0` |
| Background | `bg-surface-page` (= `--c-surface-page`, #0d0d0d dark) |
| Top border | `border-t border-hairline` → 0.5px. Use the `cp-hairline`-style 0.5px, not Tailwind's 1px `border-t`. Concretely: `borderTop: "0.5px solid var(--c-hairline)"` (Tailwind `border-t` bottoms out at 1px). |
| Safe area | `style={{ paddingBottom: "env(safe-area-inset-bottom)" }}` (matches `nav.tsx:60`) |
| Centring | inner row `mx-auto w-full max-w-[440px]` — matches `StaffScreen` column (`max-w-[440px]`). **Do not** add `px-[22px]` on the bar: tabs run edge-to-edge and self-distribute; the 22px gutter is content-only. |
| Row layout | `flex items-stretch justify-around` (or 5× `flex-1`) |
| Z-index | **`z-40`**. Overlays are `z-[100]` (`modal.tsx:21`, `.cp-overlay`) → nav sits *below* modals/sheets/toasts (correct). Manager nav is `z-30`; use `z-40` so the bar is above page content and any in-page sticky (e.g. the sticky submit bar in §5, which is `z-30`). Order: page < sticky-CTA (z-30) < nav (z-40) < overlays (z-100). |
| Content clearance | In `StaffScreen` (`components/staff/screen.tsx:9`), replace `pb-[env(safe-area-inset-bottom,26px)]` with `pb-[calc(56px+env(safe-area-inset-bottom))]` (56px bar + safe area). |
| Render location | Inside `StaffScreen` only — the unauthenticated entry/PIN screen (`app/v/[venue_token]/page.tsx`) doesn't use `StaffScreen`, so it stays nav-free automatically. |
| `<nav>` a11y | `aria-label="Primary"` on the `<nav>`. |

---

## 2. Tab item

| Property | Value |
|---|---|
| Element | `<Link>` per tab, `flex flex-1 flex-col items-center justify-center gap-1` |
| Vertical padding | `py-2` → with icon(22) + gap(4) + label(10) ≈ **48px tall** (≥44px target met). Min-enforce `min-h-[48px]` to be safe. |
| Icon size | `22` |
| Icon stroke — active | `strokeWidth={2}` |
| Icon stroke — inactive | `strokeWidth={1.75}` (staff `Icon` default) |
| Label | `text-[10px] font-medium leading-none`, single line `whitespace-nowrap` |
| Active colour | `text-accent` (icon + label inherit) |
| Inactive colour | `text-ink-muted` (**not** `text-ink-faint`) |
| Selected marker | `aria-current={active ? "page" : undefined}`; **no** background pill, **no** top indicator bar — colour + stroke weight only (flat, per design language) |
| Active test | `pathname === href || pathname.startsWith(href + "/")` (same as `nav.tsx:27`) |
| 375px distribution | 5 tabs × `flex-1` → ~75px/column. Longest label "Availability" (12ch @10px ≈ 62px) fits one line inside 75px with room. Keep `whitespace-nowrap`; never wrap. |

Tab order (left→right): **Home · Shifts · Availability · Swap · Time off**.

| Tab | href | icon |
|---|---|---|
| Home | `/v/[venue_token]/hub` | `home` (new — §3) |
| Shifts | `/v/[venue_token]/rota` | `calendar-week` ✓ exists |
| Availability | `/v/[venue_token]/availability` | `calendar-plus` ✓ exists |
| Swap | `/v/[venue_token]/drop` | `arrows-exchange` ✓ exists |
| Time off | `/v/[venue_token]/leave` | `beach` ✓ exists |

All four existing icons confirmed present in `components/staff/icon.tsx` (`calendar-week`, `calendar-plus`, `arrows-exchange`, `beach`).

---

## 3. `home` icon — add to staff set

`components/staff/icon.tsx` lacks `home`. Add `"home"` to the `IconName` union and this entry to `PATHS` (ported verbatim from `components/manager/icon.tsx:213`, Tabler `home`, consistent with the set's 1.75/2 stroke + `strokeLinecap/Join="round"` already on the staff `<svg>`):

```ts
home: [
  "M5 12l-2 0l9 -9l9 9l-2 0",
  "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7",
  "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
],
```

No other icon additions needed.

---

## 4. Hub-as-home layout (Home tab)

Hours leaves the tab bar; Home becomes a glance. Component order top→bottom at 375px, inside `StaffScreen` (`px-[22px]`):

1. **`StaffTopBar`** — left: greeting (`text-[13px] text-ink-muted`) + `Hi, {firstName}` (`text-[26px] font-medium tracking-[-0.6px]`, accent dot); right: `NotificationBell` + `ModeToggle`. *(No BackButton — this is a tab root.)*
2. **Venue strip** — unchanged (`hub/page.tsx:324`): `cp-hairline rounded-cp-panel bg-surface-card px-3.5 py-3`, green status dot + venue name + right-aligned "Week of …". Margin `mt-5 mb-6`.
3. **Next-shift block** (new, primary) — `rounded-cp-card border-[0.5px] border-[rgba(255,77,0,0.25)] bg-accent-light p-[18px]`. Micro-label `text-[10px] uppercase tracking-[0.12em] text-ink-muted` = "Next shift"; line 1 `text-[19px] font-medium tracking-[-0.4px] text-ink` = "Thu 28 · Evening"; line 2 `text-[12px] text-ink-muted` = "5pm – close · with Priya". Empty state: "No upcoming shifts" + muted "Your rota's up to date". `mb-3`.
4. **Pending give/swap `ActionBanner`(s)** — keep exactly as-is (`hub/page.tsx:349–367`): amber `bg-cp-amber-soft`, 34px icon tile, Accept/Decline buttons. Render only when present. `mb-3` each.
5. **Glance row** (two cards, `flex gap-2.5`) — each `flex-1 cp-hairline rounded-cp-panel bg-surface-card px-4 py-3.5`:
   - **Availability** — label "Availability", value `text-[15px] font-medium` = "Submitted" / "Not sent" / "Closed", meta `text-[12px] text-ink-muted` = "for next week". Tapping → Availability tab.
   - **This week** — label "This week", value `text-[15px] font-medium` = "4+ hrs", meta = "£46+ est." (respect `unmeasured` `+`; hide pay if no rate set). Tapping → Shifts.
6. **(optional) "This week" section** — if you keep the 7-dot glance or a mini rota strip, place below; otherwise stop at the glance row.

Notes: drop the old 2×2 launcher grid entirely (`hub/page.tsx:369–414`) — the tab bar owns navigation. `SectionLabel` between groups only if >1 group needs separating; a glance screen reads better with fewer labels.

---

## 5. Sticky availability submit CTA

On `availability/page.tsx`, lift the progress bar + submit button (`:581–595`) out of the scroll into a bar pinned above the tab bar.

| Property | Value |
|---|---|
| Position | `fixed inset-x-0` at `bottom-[calc(56px+env(safe-area-inset-bottom))]` (sits directly on top of the 56px nav) |
| Z-index | `z-30` (below nav's z-40, above content) |
| Centring | inner `mx-auto w-full max-w-[440px] px-[22px]` (aligns to content column) |
| Background | `bg-surface-page` (opaque, so scrolled content doesn't bleed through) |
| Top border | `0.5px solid var(--c-hairline)` |
| Padding | `pt-3 pb-3` |
| Contents (stacked) | (a) progress row: `ProgressBar value={answeredDays/7}` + `{answeredDays} of 7 days` label, `mb-2.5`; (b) submit `<button>` — `w-full rounded-cp-panel bg-accent py-[15px] text-[15px] font-medium text-white`, disabled `opacity-60`. Closed-week state: swap for the muted "Submissions for this week have closed" panel. |
| Page clearance | On the availability screen, bump `StaffScreen` bottom clearance to `pb-[calc(56px+64px+env(safe-area-inset-bottom))]` (nav 56 + sticky CTA ≈64) so the last day card + auto-submit toggle clear both bars. |
| Auto-submit toggle & notes | Stay in the scroll body (they're secondary); only progress + submit are pinned. |

Layer summary (bottom of viewport, dark opaque bands): **tab bar** (z-40, 56px + safe area) → **sticky CTA** (z-30, ~64px) directly above it → scroll content clears both.
