# Staff bottom-nav — architecture plan & risks

Reviewed by John. Read-only architectural read of reintroducing a persistent
bottom tab bar to the staff PWA. Evidence cited against real files. No source changed.

---

## TL;DR recommendation

- **Host the nav inside `StaffScreen`** (`components/staff/screen.tsx`), not a
  route-group layout and not a per-page include. It is the one component every
  authed screen already renders and the one component the entry/PIN/join page
  deliberately does NOT use. That fact makes it the correct seam.
- **Do not add `app/v/[venue_token]/layout.tsx` to host the nav.** Staff auth is
  client-side PIN in `sessionStorage`, so a layout cannot server-gate it, and a
  layout also wraps `page.tsx` (entry/PIN) — the one screen that must stay
  nav-free. A layout buys nothing and creates the leak you then special-case away.
- **Auth-gating stays where it is** — each screen's own `useEffect` PIN check.
  The nav only needs to be suppressible on `submitted`.
- **Clearance lives in `StaffScreen`**, changed once. The sticky Availability CTA
  is a per-page concern layered above the nav.
- Stacking is safe: manager nav is `z-30`, every overlay is `z-[100]`. A staff
  nav at `z-30` sits under all of them. No risk to the pre-paint theme script,
  the `lib/api.ts` module cache, or `usePresence`.

---

## 1. Where the nav should live

### The binding constraint: staff auth is client-side, per screen
Every authed staff screen gates itself in a `useEffect` that reads the PIN from
`sessionStorage` and redirects if missing:

- `rota/page.tsx:45-56` — reads `pinStorageKey(...)`, else `router.replace('/v/{token}')`;
  on a 401 elsewhere, redirects to `?expired=1`.
- Same shape in `hours/page.tsx:55-69`, `drop/page.tsx:65-68`, and the others
  (`availability`, `leave`, `hub`, `submitted`).

There is no server session. `app/(manager)/layout.tsx:15-28` can call
`supabase.auth.getSession()` and `redirect('/login')` server-side; the staff side
has no server-checkable equivalent. So a `[venue_token]/layout.tsx` could render
chrome but could NOT auth-gate — the gate still has to live in each page. A layout
therefore adds a second place that must know "is this the nav-free entry screen?"
without removing the per-page auth logic. Net negative.

### Why not the layout (option a)
- A `[venue_token]/layout.tsx` wraps `page.tsx` (entry/PIN/join/reveal) too. That
  screen is unauthenticated and must not show the nav (`STAFF_NAV_REVIEW.md:62,109`).
  You would read `usePathname()` in the layout and blank the nav on the index route,
  `forgot-pin`, and `submitted` — a suppress-list that drifts.
- The layout renders on the server; the nav needs `usePathname()` for active state,
  so it is a client component regardless. The layout gives nothing a client
  component inside `StaffScreen` doesn't.
- The entry page already paints its own `.cp-staff` root and column
  (`page.tsx:146-147`). A layout that also paints `.cp-staff` would double-wrap or
  force refactoring the entry page. Avoid.

### Why not per-page include (option c)
Seven insert points, seven chances to forget clearance padding or pass the wrong
`venue_token`. Rejected on maintenance grounds — this is exactly the drift the
review is removing.

### Why `StaffScreen` (option b) — recommended
- **Perfect membership match.** All six authed screens render inside `StaffScreen`
  (`hub:9`, `rota:11`, `availability:11`, `hours:11`, `drop:11`, `leave:12`). The
  entry page (`page.tsx`) and `forgot-pin` do NOT use it — they hand-roll their own
  `.cp-staff` wrapper. So "renders `StaffScreen`" is already almost exactly "is an
  authed staff screen." The nav is opt-in by construction, not opt-out by
  suppress-list.
- `StaffScreen` is in the client tree, so `usePathname()` and the `venue_token`
  (derive from pathname, see §2) are available with no prop drilling.
- One edit adds the nav to six screens and the clearance padding at once (§4).

### The one wrinkle: `submitted` must stay nav-free
`submitted/page.tsx` reads the PIN (`submitted:14`) so it is "authed", but it is a
terminal confirmation, not a tab destination. From its imports it does NOT appear
to use `StaffScreen` (verify, §Needs verification) — if so it is excluded for free.
If it does, give `StaffScreen` an opt-out prop (`hideNav`) rather than moving the
nav out. Prefer an explicit prop over a pathname blocklist inside the component —
a blocklist is the thing that rots.

**Recommended shape:** `StaffScreen` gains optional `hideNav?: boolean` (default
`false`) and renders `<StaffBottomNav />` unless `hideNav`. The nav reads
`venue_token` from `usePathname()`, so `StaffScreen`'s signature barely changes and
no page passes the token.

---

## 2. Active-tab detection

Mirror the manager helper (`components/manager/nav.tsx:27`):
`pathname === href || pathname?.startsWith(href + '/')`.

**Gotcha specific to `[venue_token]`:** staff hrefs are `/v/{token}/rota`, not
`/rota`. The token is dynamic, so you cannot hardcode the prefix the way the
manager nav does. Two safe options:

1. Derive the base once in the nav: match `pathname` against `^/v/([^/]+)` (the
   same regex the pre-paint script uses, `app/layout.tsx:34`) to recover `token`,
   then build each href as `/v/{token}/{tab}` and compare. **Preferred** — it also
   gives the token for the hrefs, so the nav needs no props.
2. Compare on the trailing segment only: `pathname.split('/')[3]` yields the
   screen name (`rota`, `availability`, …); match against each tab's segment.

Watch the Home tab: its route is `/v/{token}/hub` but the label is "Home"
(`STAFF_NAV_REVIEW.md:39`) — the active check keys off the `hub` segment, not the
label, so no special case. There is NO index-route ambiguity: the authed home is
`/hub`, never the bare `/v/{token}` (that is the unauthed entry, which has no nav).
Cleaner than the manager app, where `/dashboard` is a sibling of the group root.

---

## 3. Deep-link back affordance (drop)

`drop` is reached two ways:
- As a tab ("Swap"), no context.
- Deep-linked from a shift tap on `rota`: `/v/{token}/drop?assignment={id}`
  (`rota/page.tsx:243`), consumed via
  `new URLSearchParams(window.location.search).get('assignment')`
  (`drop/page.tsx:76`) — deliberately not `useSearchParams`, to avoid a Suspense
  boundary (`drop:75`).

The general `BackButton` in `StaffTopBar` goes away on tab destinations
(`STAFF_NAV_REVIEW.md:68`). Keep the contextual return **conditionally**: in `drop`,
render a "‹ My shifts" link in the `StaffTopBar` left slot ONLY when `?assignment=`
is present (arrived via deep-link), pointing at `/v/{token}/rota`. When `drop` is a
plain tab, the left slot is empty and the bar owns wayfinding. Reuse the
`assignment` value already read in the effect — do not re-parse.

Note: `drop`'s `StaffTopBar` is rendered in two branches (`drop:199-200`, `277-278`),
both currently with an unconditional `BackButton`. Both must switch to the
conditional affordance or they disagree.

---

## 4. Clearance & the sticky Availability CTA

### Bottom clearance — one place
`StaffScreen`'s column currently ends with `pb-[env(safe-area-inset-bottom,26px)]`
plus an inner `pb-[26px]` (`screen.tsx:9-10`). With a fixed nav, content must clear
the bar. Change the clearance IN `StaffScreen` (`STAFF_NAV_REVIEW.md:59`) to
`pb-[calc(64px+env(safe-area-inset-bottom))]`. Because all six screens share
`StaffScreen`, this is a single edit — the staff analogue of the manager pages'
`pb-24 md:pb-8`. Do NOT add per-page padding; that is the drift you are removing.
`submitted`/entry (nav-free) don't need it and, if they don't use `StaffScreen`,
are unaffected.

### Sticky submit CTA — per page, not `StaffScreen`
The Availability submit is the P0 ergonomics win (`STAFF_NAV_REVIEW.md:79`) and must
stack above the tab bar. Render it as its own fixed element at
`bottom-[calc(64px+env(safe-area-inset-bottom))]`, `z-40` (above nav's `z-30`, below
overlays' `z-100`), with its own hairline top. When present, that screen needs EXTRA
bottom clearance (nav height + CTA height) — handle locally on Availability (an extra
`pb` on its scroll container), not in `StaffScreen`, since only Availability has the
CTA. This mirrors the manager scheduler's sticky-bar lift already logged in CLAUDE.md
(`bottom-[calc(56px+...)]` above the tab nav).

---

## 5. Stacking, theme script, cache, presence — risk check

- **z-index / overlays: safe.** Manager nav is `z-30` (`nav.tsx:59`). Every staff
  overlay is `z-[100]`: `Modal` (`components/modal.tsx:21`), `BottomSheet`
  (`components/manager/bottom-sheet.tsx:38`), `AuthHashHandler`. `Toast` is `z-50`
  (`components/toast.tsx:23`). A staff nav at `z-30` sits below every one, so modals,
  sheets and the auth wall correctly cover it. `usePresence` drives `data-state` on
  those overlay classes — unaffected, since they outrank the nav. **Cosmetic note:**
  `Toast` at `bottom-6 z-50` floats OVER the nav band; acceptable (transient, above),
  but lift its bottom offset on staff screens if it lands on the tabs.
- **Pre-paint theme script: no impact.** `app/layout.tsx:31-36` keys theme off
  `location.pathname` matching `^/v/([^/]+)`. Adding a nav does not change the path,
  and the nav renders inside `.cp-staff` (via `StaffScreen`), inheriting the resolved
  palette. No new key, no FOUC. **Ensure the nav markup is inside the `.cp-staff`
  root** (it will be, as a `StaffScreen` child) — a nav rendered as a sibling of
  `.cp-staff` would pick up the wrong palette, the exact trap logged for staff modals
  in CLAUDE.md.
- **`lib/api.ts` module cache: no impact, slight win.** It is a module-level read
  cache; tab-to-tab moves are soft navigation, the lifetime it is designed for
  (survives soft nav, dies with the document). A persistent nav does not remount the
  document, so one-tap sideways moves now hit warm cache.
- **`usePresence` / overlay exit transitions: no impact.** They mount/unmount above
  `z-30`; the nav is inert background to them.

---

## 6. Recommended build sequence (minimises breakage across 7 screens)

Ordered so each step is independently verifiable and nothing is half-wired:

1. **Icon first.** Add the `home` glyph to `components/staff/icon.tsx` (missing;
   `STAFF_NAV_REVIEW.md:47`). Confirm the other four tab icons (`calendar-week`,
   `calendar-plus`, `arrows-exchange`, `beach`) exist in the staff set before
   wiring — a missing key crashes the render (the `undefined.map` class of bug
   logged in CLAUDE.md).
2. **Build `StaffBottomNav` in isolation** (`components/staff/bottom-nav.tsx`),
   modelled on `nav.tsx:57-80` but staff-scoped: 5 `flex-1` tabs, `z-30`,
   `border-t border-hairline bg-surface-page`, `max-w-[440px]` centred,
   `env(safe-area-inset-bottom)` padding, active = `text-accent` + `strokeWidth 2` +
   `aria-current`, inactive = `text-ink-muted` (not the failing `ink-faint`,
   `STAFF_NAV_REVIEW.md:53`). Derive token + active state from `usePathname()` (§2).
   Verify in a throwaway route first (CLAUDE.md preview pattern); don't mount yet.
3. **Wire into `StaffScreen`** with the `hideNav` opt-out and the new clearance
   padding (§4). Lights it up on all six authed screens at once. Verify each renders,
   nav shows, active tab correct, content clears the bar at 375px.
4. **Drop the general `BackButton`** from `StaffTopBar` left slots on tab
   destinations (`rota`, `availability`, `hours`, `leave`, both `drop` branches,
   `hub`). Do this AFTER the nav is proven, so wayfinding is never absent.
5. **`drop` contextual return** (§3): conditional "‹ My shifts" only when
   `?assignment=` present, in both `StaffTopBar` branches.
6. **`submitted` + entry stay nav-free** — verify explicitly (pass `hideNav` if
   `submitted` uses `StaffScreen`; entry/`forgot-pin` don't, so nothing to do). This
   is the regression-sensitive check: an authed-looking screen must not sprout tabs,
   and the unauthed entry must never show them.
7. **Sticky Availability CTA** (P0) — last, because it is a per-page concern stacked
   above the now-existing nav and needs the nav height as a known constant.

Dependencies: 1 unblocks 2; 3 must precede 4 (nav must exist before back buttons go);
7 depends on the nav height fixed in 3.

---

## Needs verification

- **Does `submitted/page.tsx` render inside `StaffScreen`?** Its imports
  (`submitted:3-7`) show no `StaffScreen` import, suggesting it hand-rolls chrome
  like the entry page — in which case nav-free for free. Check the root wrapper; if
  it uses `StaffScreen`, add `hideNav`.
- **`forgot-pin/page.tsx`** was not readable in this pass. Confirm it does not use
  `StaffScreen` (it shouldn't — unauthenticated recovery). If it does, `hideNav`.
- **`components/bottom-nav.tsx` still exists** (`grid-cols-6`, `z-40`, `md:hidden`)
  and is imported nowhere (grep-clean). Looks like the old deleted staff nav or a
  relic. Confirm dead and delete it, or it will be confused with the new
  `StaffBottomNav`. Its `z-40` would sit above a `z-30` nav — another reason to remove.
- **Toast overlap** with the nav band at `bottom-6 z-50` — verify visually at 375px
  whether a toast lands on the tabs; lift its bottom offset on staff screens if so.
