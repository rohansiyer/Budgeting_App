# Changelog

## v0.3.0 — Design Review Implementation (Wave E Final)

The complete redesign per the handoff spec (`design/handoff_v3/README.md`), implemented across four waves:

### Rules Changes

- **Duck economy.** The flock starts with one starter duck at chapter creation. Months close 3 of 3 goals => +1 duck; 1 or 2 goals => no change (no loss on partial); 0 goals => -1 duck (LIFO, newest leaves). Verdicts remain final. The pond is never empty: if a chapter reaches zero ducks, the last loss freezes the flock (it stays empty until the next gain).
- **Cadence-aware borrowing (uncapped).** Every category carries a `cadence` field (`weekly` | `monthly`). An envelope borrows from its own next cycle: weekly envelopes from next Monday, monthly envelopes from the first of next month. There is no cap; the guardrail is honest math shown in the borrow prompt (`nextCycleStartState`).
- **Pay-period recaps.** A new `PayPeriodRecapGate` presents mid-month pay-period closes (non-verdict framing). Month-end closes carry the duck verdict via `DuckResultsGate`. Recaps are tracked via a persisted pointer so each close is shown exactly once.

### Aesthetic Changes

- **The mallard.** Replaces the yellow duck with a pixel mallard (16x14 grid). New animations: idle, waddle-in, walk-off, swim (legless), preen (stand → turn → groom → turn, 8–20 second random fire). Accessories (bowtie, hat, chain) persist at existing overlay coordinates. Legs hide for water animations.
- **The Pond, redrawn.** Actual circular pond at the center (deep/edge colors with ripple animation). Ducks wander the shore or float inside on a stepped timer. The plan vs actual ring (8px thick, 48 blocks) forms a pie around the pond, one arc segment per envelope proportional to its budget share; blocks fill as spending lands. Below: flock count, period spend, category legend.
- **Typography patches.** Added `--text-kpi` (20px / 700 weight) for mid-importance numbers. Raised caption from 11.5px to 12px; reserved 11px strictly for tracked uppercase section labels. Content-bearing small text sits at 13–14px.
- **Fonts.** Space Grotesk (UI: Regular, Medium, SemiBold, Bold) + Space Mono (money, labels, tabular numerals; Regular, Bold). Loaded via `expo-font` in App.tsx.

### UX and Feature Changes

- **Amount-first add-expense.** Big 44px mono input, live envelope feedback ("Food: $26.60 left after this"), recent categories as 4 touchable squares, 3x4 keypad, borrow prompt as a PixelBox overlay.
- **Home redesigned.** Greeting + flock chip, hero safe-to-spend with a pacing line ("4 days to payday, ~$32 per day keeps you green"), goal strip PixelBox (month name + three 10px status squares + warning sentence), one delivered insight, envelopes with BlockMeters, Add button.
- **Insight layer (20 deterministic rules).** All computed on-device, never fetched. Rules fire on recap/open; top 3 render per recap, 1 per day on Home. Triggers include: X under budget, best month since Y, subscription detected. If nothing fires, show nothing.
- **Drill-down ledgers.** Tap any number (safe-to-spend, envelope, insight) to see the exact breakdown (paycheck + bills + envelopes + savings + carryover). Tap an envelope to see its transaction ledger, carryover history, borrow record. CSV export in Settings.
- **CSV import with semantic matching.** On-device merchant tokenization matched against category keywords + learned corrections (assign "TRADER JOE'S" once, it's Food forever). Always lands in a review screen ("We sorted 142 of 151. Check these 9").
- **Bills forecast.** "Due before payday" RuledList with date / name / amount, total, status. Recurring bills marked via `addRecurringBill` / `updateRecurringBill`. Feeds safe-to-spend math.
- **Subscription detection.** Recurring merchant at steady amount triggers an insight PixelBox ("Spotify $11.99 3 months running") with "Mark as bill" action.
- **Search and filter.** Field input over a transaction RuledList, category-chip filters, results with dates and totals.
- **Stepped projections.** One step per week, hard right angles, 45% opacity ("if your last 3 months hold"). Vertical hairline for today, dashed for goal. No interpolation or ML.
- **Named goals + progress.** A Goal has a name, target, linked savings account (or null for all-savings sum), and tracks achievement date. UI widget shows "$X of $Y" and a BlockMeter (one block = $100). Pace line projects funding timeline. Active/inactive flag allows soft deletion.

### Module and Code Structure

- **New modules:**
  - `src/import/` — CSV semantic matching engine and merchant correction persistence.
  - `src/insights/` — 20 deterministic rules engine; fires on recap + Home open.
  - `src/ledger/` — drill-down ledger assembly (safe-to-spend breakdown, envelope drill, transaction history).
  - `src/projections/` — stepped weekly projections for savings and goal funding.

- **New screen subdirectories:**
  - `src/screens/expense/` — AddExpenseSheet with amount-first input, keypad, borrow prompt.
  - `src/screens/home/` — Home redesigned with goal strip, pacing line, insight row.
  - `src/screens/ledger/` — Drill-down ledger screens (safe-to-spend breakdown, envelope detail, search).
  - `src/screens/pond/` — Pond redrawn with wandering ducks and segmented ring.
  - `src/screens/settings/` — Settings subscreens (backup, security, notifications, plus new bills, search, subscription prompt).

- **Kit components (new and extended):**
  - `Field` — Text/amount input, 48px, surface-deep well, focus outline.
  - `ChoiceRow` — Segmented options (square, not pill; ghost HardButtons).
  - `StepTrack` — Wizard progress (N discrete blocks, 8px tall, 3px gaps).
  - `Snackbar` — Surface bar with message + ghost Undo button.
  - `TabBar` — Four fixed tabs (HOME / CALENDAR / POND / SETTINGS), 56px, tracked mono labels, active underline.
  - `EmptyState` — PixelBox + DuckSprite + one sentence + one action.
  - `InsightRow` — CategoryChip + insight sentence + hairline dividers.
  - `SparkBlocks` — Vertical BlockMeter columns for multi-month trends.

### Data Layer and Persistence

- **New tables via migration 4:**
  - `merchant_corrections` — learned merchant → category mappings per chapter.
  - `recurring_bills` — explicit bills (name, dueDay with month-end clamp, amountCents, active flag).
  - `goals` — named savings goals (name, targetCents, linked savingsAccountId or null, active, achievedAt).
  - `pay_period_recap_acks` — persisted pointer for recap display (per chapter).

- **New StoreContract methods:**
  - Merchant: `upsertMerchantCorrection(normalizedMerchant, categoryId)`
  - Bills: `addRecurringBill(name, categoryId, amountCents, dueDay)` / `updateRecurringBill(id, patch)`
  - Goals: `addGoal(name, targetCents, savingsAccountId?)` / `updateGoal(id, patch)` / `getGoals()` / `goalProgress(goalId, asOf?)`
  - Borrowing: `borrowFromNextCycle(categoryId, currentPeriodStart, amount)` / `nextCycleStartState(categoryId, currentPeriodStart)`
  - Reads: `getMerchantCorrections()` / `getRecurringBills()`

- **Test convention.** Business logic lives in `.logic.ts` files (jest-compatible, no TSX rendering). Corresponding `.tsx` files import and call them. Tests in `__tests__/` folders. Jest cannot render `.tsx` directly; logic tests verify behavior against logic modules.

### Migrations

- **Migration 4:** Adds `merchant_corrections`, `recurring_bills`, `goals`, and `pay_period_recap_acks` tables. Backfills `cadence = 'weekly'` on all existing categories (defaults to weekly for backward compatibility).

### Known Scope Exclusions

- Home-screen widget (prioritized for post-launch iteration).
- Locale-aware date formatting beyond ISO strings.

---

See `DucksInARow_DesignDoc_v2.md` for the full v2 spec and `design/handoff_v3/README.md` for the design rationale.
