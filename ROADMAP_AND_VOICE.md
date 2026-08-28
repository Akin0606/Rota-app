# Roadmap concepts & the language of "optimal"

**Author:** Dan (hospitality ops) · **Date:** 28 Aug 2026
**For:** the marketing landing rebuild (`LANDING_REDESIGN_BRIEF.md`, S10 roadmap + copy register)
**Register note:** everything below is either (a) grounded in the code, with a file:line, or (b) flagged as trade knowledge. I've kept those separate.

---

## 0. The filter I applied

CrewPlan's pitch is that it does the week *for* the person running the place, and does it better than they'd do it tired at 11pm. So every candidate got one test:

> **Does this remove a decision, or add one?**

A feature that gives the operator a new dial to set is a Deputy feature. A feature that takes a judgement they're already making by feel and makes it automatically — showing its working, letting them override — is a CrewPlan feature. Six survived that test.

**First, a correction for the page.** Two things read like roadmap and are already shipped — do not promise them:

- **Like-for-like swaps and claims approve themselves.** Shipped (CLAUDE.md Roadmap → Done: "shift drop+claim (auto-approve like-for-like, else manager queue)"). This belongs in the feature index, and honestly it deserves a *sentence* on the page, not an index row — it's the clearest single statement of the whole product philosophy.
- **The whole weekly cycle already runs on a timer.** Availability opens, closes, stragglers get chased, and the manager gets a review email — all per-venue APScheduler jobs (`backend/services/cron_scheduler.py`, driven by `backend/routers/cron.py:52`, `:180`, `:242`, `:311`). The page currently undersells this badly. It's the strongest evidence for the automation claim and it's live.

---

## 1. Six roadmap concepts

Ranked by what I'd actually build, not by how they'd photograph.

---

### 1. Cover finder — "Sarah's just called in sick"

**What it does.** One tap on a shift that's gone missing. CrewPlan ranks everyone who could legally and realistically take it — available or "if needed", under their weekly hours, clear on rest, not on leave, not already working that day — messages the top few, and the first to accept gets it. The rota updates and re-issues itself.

**Why it matters.** This is the actual emergency of the trade, and no other part of the week is as expensive. It's 3:40pm on a Saturday, your barback texts that he's been up all night, and you've got a rugby crowd in at five. Right now that manager puts the phone down and starts guessing: who's free, who's already done forty hours, who's seventeen and legally can't do the close, who did him a favour last week so he can't ask again. **CrewPlan already knows all four answers.** `check_manual_assignment` (`backend/services/solver.py:64`) is precisely that eligibility gate — it just sits there waiting to be asked instead of volunteering a shortlist.

**Effort: medium.** The legality check exists. The ranking is a sort over data we hold. The atomic "first to accept wins" flip already exists in the claim path. What it genuinely needs is the notification system that's *already* the next roadmap item — which is a good story for the page: notifications aren't a nicety, they're the thing that unlocks this.

**What I'd cut to keep it simple.** No marketplace, no bidding, no shift-swapping economy. One button, a shortlist of three or four with a reason next to each name ("free, 12h this week"), one send.

---

### 2. Wage cost that steers the rota, not one that reports on it

**What it does.** A pay rate per person, a weekly labour budget (a figure or a % of expected takings), a running cost as the rota is built — and, the part that matters, **the solver treats the budget as a soft ceiling**, so the rota it hands you is already inside it rather than something you trim afterwards.

**Why it matters.** Labour is the line the operator can actually move, and the week it goes wrong they find out on the payroll run, not on the Tuesday. Over-rostering a wet February Tuesday by one body for three months is a real four-figure hole. Every operator does this arithmetic in their head; nobody does it accurately. Doing it *during* the solve — rather than showing a chart afterwards — is the whole difference between a report and a tool.

**Effort: medium-large, and it's genuinely new.** There is no pay rate anywhere in the schema — I grepped `supabase/migrations/` for `pay_rate|hourly_rate|wage` and got nothing. Per CLAUDE.md, the staff-side rate is a `localStorage` value on the Hours screen, and Settings' pay panel is deliberately a static "not available yet" card. So this needs a column, a plumbing pass, and a cost term in the objective — which is the easy part: cost is linear in the assignment variables (`var × duration × rate`), so it drops in alongside the existing coverage / preference / fairness terms at `backend/services/solver.py:550-555` without changing the model's shape.

**One legal point, and it's a "must" not a "nice".** National Minimum and Living Wage are **age-banded and change every April**. Do not hardcode rates. Hold them in one table with an effective date, and warn when a stored rate falls below the band for that person's age. That warning on its own justifies the feature — a 17-year-old left on last year's rate after 1 April is one of the most common accidental breaches in this sector, and it's an HMRC naming-and-shaming offence, not a slap on the wrist.

**What I'd cut.** No tronc, no NIC, no pension, no holiday-pay accrual in the cost figure. Call it **wage cost** on screen and say plainly what it excludes. The moment we imply "what this week costs you" in full, we've promised payroll.

---

### 3. Doubles and splits — the gastropub rota CrewPlan currently can't write

**What it does.** Lets one person work two shifts in a day where the venue runs a split service, with the gap between the halves and the daily total both enforced.

**Why it matters.** This isn't a feature request, it's a fidelity gap that shuts out a whole venue type. A food-led pub runs 12–3 and 6–11 and the head chef does both — that's not exotic, that's Tuesday. `backend/services/solver.py:440` hard-caps it: `model.Add(sum(vars_today) <= 1)`, one shift per person per day, full stop. So a gastropub has to lie to the system — call it one 12-to-11 shift — which then over-reports eleven hours, wrecks the weekly-hours check and makes the rest-gap maths meaningless. When an operator has to misrepresent their week to fit the tool, they stop trusting the tool.

**Effort: medium, with one trap.** The day-off-in-seven constraint (`solver.py:442-448`) explicitly leans on the one-per-day cap — its own comment says the shift sum "is already a 0/6 day-count". Relax the cap and that count silently becomes a *shift* count, so someone doing two doubles reads as four days worked and quietly loses their protected day off. Needs a real per-day worked boolean before anything else.

**Registers, so the copy stays honest.** The break between the two halves is a **house/contract matter**, not the law. The law says a 20-minute rest break for a shift over six hours, and eleven hours' daily rest between working days. The **8-hour daily cap for under-18s is law** and has to apply across both halves of a split — that's the one that must be a hard block.

**What I'd cut.** A single per-venue "we run split shifts" switch, off by default. Most wet-led pubs will never touch it and shouldn't have to think about it.

---

### 4. Publish itself — "out Thursday at six, unless something needs you"

**What it does.** The rota publishes and emails on a schedule the operator sets — **but only if it's clean**: full coverage, no unresolved legal blocks, nothing waiting for approval. If it isn't clean, nothing goes out and they get one message naming exactly what's blocking it.

**Why it matters.** It's the purest version of the thesis on this list. The entire rest of the loop already runs to a timetable; publish is the one step still parked on a human. For a clean week there is genuinely nothing for that human to do — they're being asked to click a button to confirm that nothing is wrong. And the operator benefit is real beyond the click: staff get their week at the same time every week, which is the single biggest driver of "when am I working?" messages landing on a manager's personal phone on a Sunday.

**Effort: small-medium.** `publish()` exists, the notice window exists, the per-venue cron scaffolding exists, and `_build_summary` already computes coverage and warnings — which *is* the "is this clean?" test. Little new logic, mostly wiring.

**The trade-off, stated.** Some operators will never hand over publish, and they're not wrong — publishing is the moment they put their name to the week. Default off, opt in per venue. **The guard is the sell, not the automation:** "we will never publish a rota with a hole in it."

---

### 5. Coverage that learns the shape of the week

**What it does.** Stops asking the operator to guess `min_staff` once and never revisit it. Proposes next week's coverage from their own history — what they actually rostered on comparable weeks — adjusted for the things that visibly move trade: bank holidays, school holidays, a home fixture down the road, and the weather.

**Why it matters.** That number in the box was set during a three-minute onboarding and has been wrong ever since. A beer garden on a 24°C Saturday needs a body more than it did the previous Saturday; a wet Tuesday in February needs one fewer. Operators make that adjustment by feel every single week — it is exactly the small, repeated, low-stakes judgement that software should be carrying. And the shipped per-day model is the foundation: `shift_days` already holds `min_staff`/`max_staff` per shift *per day* (migration `026`), so there's a real place to put a per-day suggestion.

**Effort: medium for the honest v1 — and the honest v1 is not an EPOS integration.** This is a trade judgement, not a code one: a fifteen-head freehouse is running a Square or SumUp terminal, or a till whose "API" is a CSV on a memory stick. Building for Zonal or Lightspeed is building for the chain with a scheduling department, which we've said we aren't. So v1 = **own history + calendar + weather** (free, no key needed), surfaced as a suggestion the manager accepts or ignores — never a silent change to their coverage. EPOS is a later step, and only where a venue already runs a modern till.

**What I'd cut.** No dashboards, no charts, no "insights" tab. One line on the scheduler: *"Saturday looks busier than usual — add one to the evening?"* Yes or ignore.

---

### 6. Someone who can open up — the one role rule a small venue actually needs

**What it does.** A keyholder flag on a person, and a "this shift needs a keyholder" rule the solver enforces. One flag, one constraint. Not a role-demand matrix.

**Why it matters.** The solver is role-blind on purpose and says so in its own docstring (`backend/services/solver.py:3-6`: "the schema has no concept of 'always need N of role X per shift'"). For a team of eight that's usually the **right** call — a small pub needs three bodies, not two-bar-one-floor, and forcing role coverage on that team mostly produces impossible rotas. But there is exactly one exception that bites every single venue: **you cannot open, and you certainly cannot cash up and lock, without someone trusted to do it.** A Sunday with three people on and no keyholder isn't a rota, it's a problem at 11:40pm.

**Effort: small.** `roles` and `staff_roles` already exist (migration `022`), and there's no keyholder concept in the backend today — I grepped; it appears only in docs and the reference HTML as a deliberately-omitted idea. This is one boolean on `staff_members`, one on `shift_days`, and one constraint per shift-day in the model.

**What I'd cut, and I'd defend this hard.** Resist every request to generalise it into per-role coverage. One flag is 80% of the value at 10% of the complexity. If a kitchen genuinely needs its own headcount, that's a **second shift**, not a role matrix — and the per-day shift model already handles that.

---

## 2. What I would deliberately not put on the roadmap

Worth having written down, because it protects the "we'd rather ship two things than promise ten" line on the page.

- **No-show and lateness patterns.** We have no clock-in, so everything we'd infer — a late drop, a missed availability submission — is a proxy. Turning a proxy into a person's reliability score, in a sector this casual, is how you get an unfair conversation with someone who had a train cancelled. Revisit only if clocking-in ever ships, and clocking-in is a Deputy breadth fight we've said we're not having.
- **Payroll export.** Sounds adjacent to wage cost; isn't. The moment you export to payroll you've implicitly promised tronc, NIC, holiday pay and SSP. That's a different company.
- **Multi-site pooling.** A site switcher for someone with three venues is fine and cheap. Staff shared *across* sites is a different product with a different data model.
- **Time and attendance / GPS clock-in.** No.

---

## 3. My verdict on sequencing

If it were my build queue:

1. **Notifications** (already next) → **Cover finder**. Ship them as one story. Notifications alone is plumbing; cover finder is the thing an operator tells another operator about in the car park.
2. **Publish itself.** Cheapest on the list, purest expression of the thesis, and it makes the whole product feel finished.
3. **Wage cost.** Biggest commercial pull, but it's a real build and it drags NMW-compliance responsibility in with it. Do it properly or not yet.

**One override:** if the pilot pipeline has food-led venues in it, **doubles and splits jumps to number one**, because it's not a nice-to-have for them — it's the difference between CrewPlan working and CrewPlan being unusable.

**For the landing page specifically:** don't put all six up. Keep hourly accrual and notifications tagged `Next` (they genuinely are), add two or three of the above under a distinct `Exploring` tag, and keep the closing line. A roadmap with three tiers reads as considered; a roadmap with nine items reads as a wish list, and the audience has seen enough of those.

---

## 4. The language of "automated" and "optimal"

### 4.1 The rule underneath all of it

"Automated" is a flat, machine word that invites the question *"so what happens when it gets it wrong?"* The frame that actually sells to this audience is:

> **It does the work, it does it well, and it shows you the bits that need a person.**

That's three claims, and each has its own vocabulary. Keep them separate and the copy stays honest and stops sounding like a template.

### 4.2 Vocabulary set

**The work happens on its own** — for the cron loop, the emails, the chasing:

| Word / phrase | Use it for | Watch out |
|---|---|---|
| **runs to a schedule** | the weekly cycle opening, closing, chasing | the strongest true claim we have; use it early |
| **on schedule / on a timetable** | timing sense only | never as a synonym for the rota itself |
| **handled** | reminders, the chasing, the emailing | "we chase the two who always forget" is better still |
| **taken care of** | soft, warm variant | don't overuse — twice a page maximum |
| **in the background** | the solve, the cron jobs | pairs well with "while you're doing something else" |
| **without you touching it** | the whole loop | plainest true statement of the thesis |
| **ready before you are** | the rota waiting on a Monday | good hero-adjacent line |

**It does it well** — for the solver:

| Word / phrase | Use it for | Watch out |
|---|---|---|
| **solved** | the CP-SAT output | literal and true; "your week, solved" is the tightest line available |
| **worked out** | plain-English variant | very British, very spoken — best in body copy |
| **optimal / the best fit** | the objective | see the caveat in 4.3 — prefer "the best fit your week allows" |
| **balanced** | hours spread evenly | true: the objective carries a fairness penalty, `solver.py:542-548` |
| **built around** | availability, holidays, the law | "built around who's actually free" |
| **fits together** | the whole week | "it fits everyone's week together" |
| **best use of the team you've got** | the optimisation claim, in operator language | the single best non-jargon phrasing of "optimised" |
| **least disruption / fewest changes** | cover finder, swaps | |

**It shows you what needs a person** — for the review surface and compliance:

| Word / phrase | Use it for | Watch out |
|---|---|---|
| **flagged / ranked / surfaced** | coverage gaps, approvals | "ranked by what's most wrong" |
| **checked against** | rest gaps, hours, the law | not "compliant with" — that's an auditor's word |
| **won't let you** | under-18 hard blocks | strongest compliance line on the page |
| **needs you** | the approvals row | "one gap, one approval — not 34 rows to read" |

### 4.3 Two precision notes worth arguing about

**"Optimal" is a real claim here, not a marketing word.** The solver returns a genuinely optimal or feasible solution within a five-second cap (`solver.py:557-559`). That's unusually honest ground to stand on — but "the optimal rota" in the absolute reads as a promise that no better rota exists, which isn't quite what a time-boxed solve guarantees. **"The best rota your week allows"** or **"the best fit, not the first one that works"** are both true and both sound better anyway.

**Do not call it AI.** It's a constraint solver. Beyond the honesty point, "AI rota" invites *"so does it make things up?"* — and for CP-SAT the answer is genuinely no, which is a **stronger** pitch than the one you'd be giving up. Lean into it: *"It isn't guessing. It's solving."* That line does more work than any amount of "smart" or "intelligent", both of which every competitor already uses.

### 4.4 Banned

`empower` · `workforce` · `seamless` · `effortless` · `leverage` · `streamline` · `solution` · `unlock` · `revolutionise` · `game-changing` · `at scale` · `drive efficiencies` · `smart` / `intelligent` (weak, and everyone else's word) · `next-generation` · `AI-powered`.

And a UK one that matters more than it looks: **it's a rota, not a schedule.** In a British pub or restaurant nobody says "the schedule" — they say "the rota", "am I on?", "who's on Saturday?". Keep **rota** as the noun and reserve **schedule / scheduled** for the *timing* sense ("it goes out on a schedule"). That distinction alone is most of what makes copy sound like it was written by someone who's worked a bar.

Same discipline for people: **team**, **the team**, **who's on**. Never `workforce`, `resources` or `labour` in staff-facing copy. `Labour` is fine and correct in the manager-facing cost feature ("labour cost", "labour as a percentage") — that's the trade's own word for the line on the P&L.

Trade words that land if used sparingly and correctly: **cover** (filling a gap), **on the rota**, **a double**, **a split**, **last orders**, **cashing up**, **the close**. One or two per page reads as credibility. Five reads as costume.

### 4.5 Example sentences

**Hero sub** (≤26 words, per the brief):
> "Your team sends their week from a link. Crewplan works out the best rota it can from that — availability, holidays, the law — and emails it out."

**Walkthrough, step 3 caption** (the solve):
> "Availability, holidays and the working-time rules, solved in a few seconds. You get the best fit, not the first one that works."

**The automation line — anywhere you need to state the loop plainly:**
> "The week runs to a schedule whether you're behind the bar or not. Availability opens, closes, and the two who always forget get chased. You get a rota to look at, not a job to do."

**Compliance band:**
> "Rest gaps, weekly hours, a day off in seven, and the under-18 rules are checked when the rota's built — and again every time anyone adds, claims or swaps a shift. The under-18 blocks cannot be overridden."

**The optimisation claim, in operator language:**
> "It doesn't just fill the gaps. It spreads the hours evenly, gives people the shifts they actually asked for, and keeps everyone inside their limits — the best use of the team you've got."

**Roadmap opener** (replaces a bare "Where CrewPlan is heading"):
> "Everything below either takes a job off you or does it better than a person guessing at eleven at night. That's the whole filter."

**Final CTA:**
> "Give it your opening hours and your team. You'll be looking at a real rota for a real week in about three minutes."

---

## 5. Replacing "landlord"

The brief uses "landlord" in §S11 ("the objections a landlord actually has"). It should go, and gender is the least of the reasons.

**It's wrong more often than it's right for this audience.** A tenant of a pubco is a *tenant* or a *licensee*. Someone on a salary running a managed house is not a landlord at all and would be mildly irritated to be called one — and that person is a large share of who CrewPlan is actually for, since the brief's own audience is "the pub with eight staff and one manager". A restaurant has no landlord in any sense. And to everyone outside the trade, "landlord" means the person you rent your flat from. You'd also be locked into "landlady" as a gendered pair you can't use in product copy.

**The options:**

| Option | What it means | Verdict |
|---|---|---|
| **Operator** | the trade's own catch-all — "independent operator" is exactly how the sector talks about itself | **Pick this.** Covers pubs and restaurants, covers owners and salaried GMs, correct in the trade press, understandable outside it. Slightly cold on its own; fine with a qualifier. |
| **Licensee** | holder of the premises/personal licence | Precise and respected, and it signals you know the trade — but it's pub-side only and reads as inside-baseball to a general reader. Use sparingly, where the audience is definitely a pub. |
| **Publican** | traditional, warm, worn with pride | Lovely word, pub-only. Good for a headline aimed squarely at pubs; wrong the moment a restaurant reads it. |
| **Owner-manager** | accurate for owner-run venues | Accurate, clunky, and excludes the salaried GM. |
| **"The person who runs the place"** | plain English, no jargon | Not a noun you can repeat, but the best phrasing in body copy where you want warmth over a label. |
| **Guv'nor / gaffer** | real, affectionate, spoken | Real in the trade, reads as parody in print. No. |

**My call:** **operator** as the default noun — *"independent operator"* where it needs weight. **Licensee** sparingly, as a credibility signal on pub-specific copy. **"The person who runs the place"** in body copy where a label would feel cold.

So the FAQ line in the brief becomes: *"Answer the objections an operator actually has"* — and the quote block stays exactly as it is, because "the pub with eight staff and one manager" already names the reader better than any noun would.
