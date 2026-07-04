# Ducks in a Row — Design Doc v2

**Status:** Concept approved, pre-implementation
**Supersedes:** `BudgetApp_DesignDoc.md` (v1) where they conflict; v1 remains the reference for flows not restated here (recurring-bill confirmation, income split engine, data model details).
**Mockup:** Interactive six-screen mockup reviewed and approved (envelopes + midnight palette + Duck System + carryover + configurability).

---

## 1. What v2 is

v1 built a calendar-first budget tracker hardcoded to one person's financial life. v2 is a rename and a re-founding:

- **Name:** Ducks in a Row.
- **Thesis:** The app answers one question every day — *"can I buy this?"* — with envelopes; and one question every month — *"did I keep my life in order?"* — with ducks.
- **Front door:** a Home screen with one giant safe-to-spend number. The calendar demotes to a tab.
- **Identity:** OLED-black "midnight" theme, single mint accent, pixel-art ducks as the emotional core.
- **Configurable:** no hardcoded accounts, incomes, splits, or categories. First-run wizard; "new chapter" flow for life changes.

## 2. Foundation fixes (ship before any feature work)

These correct defects found in the v1 codebase review:

1. **Integer cents.** All money stored as integer cents (SQLite `INTEGER`), never `REAL`/float. Display formatting converts at the edge.
2. **Atomic transfers & writes.** Transfers and any multi-row mutation run inside a SQLite transaction. Store state updates only after commit.
3. **Schema migrations.** Versioned migrations (single source of truth — drop the duplicated raw-SQL/Drizzle split; Drizzle owns the schema).
4. **Kill hardcoded IDs.** `'pnc'`, `'paycheck'`, seeded account/category IDs die; everything references user-created rows.
5. **Un-hide the tests.** Remove the default `testPathIgnorePatterns` that skips db/store suites; replace the tautological ErrorBoundary test with a real render test.
6. **Wire up transaction editing.** The existing context-menu component becomes the long-press edit/recategorize/delete flow, with undo snackbar (no confirm dialogs).
7. **Dev loop.** Expo Go + hot reload is the daily workflow; APK/AAB builds are release-only.

## 3. Visual system

- **Theme:** true black `#060707`, surfaces `#131917`/`#0C100F`, primary text `#EAF2EE`, muted `#7C8A84`. Accent mint `#46E0B4` (positive/brand), amber `#F2B84B` (warning), coral `#E0645C` (over/loss). Dark-only by design; `app.json` `userInterfaceStyle` set accordingly.
- **Category identity colors** (validated CVD-safe on dark surface): Fixed `#9D6FE0`, Food `#BA8329`, Savings `#2FA383`, Gas/Transit `#5B82D9`, Fun `#C75E86`. One color per category everywhere — envelope chips, transaction tiles, chart slices, confetti.
- **Container treatment — "quiet pixel instrument":**
  - Ruled lists (hairline dividers, no cards) for transactions, settings, and anything read as a list.
  - **Pixel-HUD boxes** (square corners with a 4px notch, 1px border `#2E3833`) reserved for *game objects*: envelopes, goals, the pond, prompts.
  - **Segmented block meters** for envelope progress (1 block = fixed dollar amount), not smooth rounded bars.
  - Buttons: hard 3px offset shadow, square. No rounded-pill cards anywhere.
- **Motion:** stepped timing (`steps()`), never smooth tweening, so all motion reads pixel-true. Respect reduced-motion.
- **No emoji in UI.** Category identity = color chips; ducks = sprites.

## 4. Screens

1. **Home** — greeting + duck chip (live mini sprite, count /12); hero safe-to-spend-this-week number; 7-day spend bars (mint = payday, coral = big fixed hit); envelope meters; add-expense button.
2. **Calendar** — month grid heatmap: fill intensity = spend, mint ring = payday (from configured schedule), coral = rent/fixed spike, quiet days stay quiet. Tap day → Daily detail. Week view one swipe away.
3. **Daily detail** — day KPIs (spent / account after / envelope left), ruled transaction list with long-press context menu, inline split display on income rows, add expense/income.
4. **The Pond** (renamed from Analytics) — dual-layer donut (inner = plan, outer = month-to-date actual) with the duck pond in the center; legend; **live monthly goal tracker** (see §6) with early warnings; tap a slice for plan-vs-actual dollars.
5. **Results** — monthly "Time to count ducks!" screen per v1 §9.6 sequence.
6. **Setup** — accounts (add/rename/balance), income sources (amount, schedule: weekly/biweekly/semi-monthly/monthly; split bar between accounts), envelopes (create/rename/re-budget, weekly or monthly), savings target. Plus the **"New chapter"** action: archive current setup, keep all history and the flock, re-run the wizard.

## 5. Envelope system

- Envelopes are variable-spend categories with weekly (default) or monthly budgets.
- Meter states: mint (fine), amber at ≥90%, coral when over.
- **Weekly reset with carryover (new in v2):**

### 5.1 Conservation law
Budget **moves** between weeks; it is never created or destroyed by carryover. Every roll or borrow is a transfer of budget mass with a paper trail.

### 5.2 Roll forward
- At week start, the **Monday prompt** lists each envelope with leftover: *Roll it forward* / *Send it to savings* / *Let it go*.
- Rolled money appears as **bonus blocks** (outlined) at the end of the meter: `$100 + $12.40 rolled in`.
- Sweep-to-savings records a transfer toward the savings account and counts toward the savings-rate goal (the app makes the virtuous option attractive).
- Per-envelope configurable default (auto-roll / auto-sweep / always ask / always reset).

### 5.3 Borrow
- When an envelope hits zero mid-purchase, the add-expense flow offers an explicit *Borrow from next week* confirm step.
- **Caps:** one week ahead only; at most 50% of next week's envelope. No compounding, no multi-week debt.
- This week shows a filled coral overflow block + `− $12.85 borrowed`; next week's preview shows hollowed coral repayment blocks and the reduced starting amount.

### 5.4 Duck guard
- Duck Goal 2 evaluates **monthly category totals vs. monthly budget totals** (including net roll-ins/outs). Intra-month borrowing is therefore neutral.
- Borrowing across a month boundary counts the overspend against **the month it happened in**. You cannot borrow from August to save July's duck.

## 6. Duck System

v1 §9 (Duck System) is adopted as written — goals, lifecycle (start 1, max 12, gain/hold/lose table), pond behavior tiers, animations, nav rename, monthly flow — with these resolutions to its open questions and additions:

| Topic | Decision |
|---|---|
| Partial credit (Q1) | Keep the table as written: 3/3 gain, 1–2 hold, 0 lose. Hold *is* the partial credit. |
| Duck names (Q2) | Yes — optional, name on tap. |
| Fancy path (Q3) | Fixed accessory ladder: bowtie → monocle → top hat → (extend later). All 12 upgrade together per good month at cap. |
| Big-win bonus (Q4) | ≥20% under budget in all variable envelopes → celebration animation only (happy dance). No mechanical reward. |
| Goal configurability | Goals fixed in v1 of the system but evaluate against *whatever the user configured* (their bills, their envelopes, their savings target). Goal editor deferred. |
| Retroactive edits | Verdicts are final. Editing a past month's transactions after evaluation never changes an issued verdict. |
| Missed evaluations | On app open, evaluate all unevaluated past months **in order**, then present results (stacked oldest-first). Never depend on the app being open at month end. |

- **Ducks are pixel sprites** (sprite sheet, 2-frame idle bob, drift, waddle-in, walk-off-with-look-back), rendered on canvas in-app. Placeholder sprite is the current 14×12 rubber duck; custom sprite sheets can swap in later without touching logic.
- Goal tracker on the Pond is **live during the month** with early warnings (e.g. "Gas at 96% in week 1"), so ducks are saveable, not just mourned.

## 7. Play Store readiness (v2 scope)

Blockers:
1. **Backup & restore** — export/import backup file; optional Drive auto-backup. Losing a phone must not lose the flock.
2. **Missed-month evaluation catch-up** (§6).
3. **Onboarding wizard** (§4 Setup).
4. **Editing + undo everywhere.**

Expected:
5. Transaction search & filter.
6. Account-to-account transfer UI (on atomic foundation).
7. Notifications with Android 13+ runtime permission: bill reminders, envelope warnings, payday.
8. App lock (PIN/biometric).

Compliance:
9. Privacy policy + Data Safety form ("100% offline, no accounts, no tracking" is the store pitch).
10. Signed AAB, current target API, store assets, internal testing track.

Explicitly deferred: widgets, cloud sync, multi-device, receipt photos, investment tracking.

## 8. Implementation order

1. **Foundation** (§2) — correctness first, on the existing codebase.
2. **Configurability** (§4 Setup, seed → wizard, "new chapter").
3. **Redesign** (§3 visual system + §4 screens, §5 envelopes incl. carryover).
4. **Ducks** (§6 — evaluation engine first, then pond rendering, then animations).
5. **Store readiness** (§7).

Each phase leaves the app runnable and testable in Expo Go.
