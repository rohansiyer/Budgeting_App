# Ducks in a Row — End-to-End Test Report (v0.3)

Branch: `v0.3` · Date: 2026-07-17 · Status: pre-publish review
Method: multi-agent web-scaffold E2E (6 flow agents + jest + adversarial source verification + UX critique)

---

## 1. Executive summary

**The money engine is verifiably sound.** 762 jest tests across 63 suites pass, `tsc --noEmit` is clean, and — the stronger evidence — six browser flow agents cross-checked live UI figures against raw SQLite dumps on every money-moving action and found **zero cent discrepancies**. Integer-cents discipline holds end to end: income splits (80/20 of $2,000 → exactly $1,600 + $400), carryover pairs (equal-amount two-leg `pairId` entries, correct `attribution_month`), borrow/repay, sweep-to-savings transfers, edit reallocation, and account balances (live `SUM` over non-deleted transactions) all conserved money exactly, including under a pathological $99,862 borrow. No float artifact appeared anywhere. If you touch nothing else in this report, the ledger core is trustworthy.

**But v0.3 ships 23 confirmed defects (+1 partial),** plus a set of accessibility/copy nits accepted on direct evidence. Of the 23, the top four are actively user-hurting:

1. **F1-4 — phantom Monday "settle last week" prompt on every fresh chapter.** The single most dangerous defect. A brand-new user, seconds after setup, sees a prompt (above their real safe-to-spend) offering to roll/sweep a *full phantom budget* for a week that never existed. "Roll forward" **doubles** the current week's envelope; "To savings" **moves real cash** between real accounts on fabricated data. Hits 100% of new chapters, not an edge case.
2. **F1-1 / F1-2 / F1-3 — the setup edit-mode trap.** There is no in-place edit or rename for any account/category/income source, and no delete anywhere. The natural Remove+re-Add workaround **duplicates live data** and can **permanently lock** edit mode behind a uniqueness error, unrecoverable from the UI.
3. **F5-1 — JSON backup silently omits `recurring_bills`, `merchant_corrections`, `goals`.** A backup taken for device migration permanently loses all bills, learned merchant corrections, and savings goals; a "replace everything" import leaves those three tables stale — directly breaking the screen's own promise. The code's claimed "completeness check" safety net does not exist.
4. **F2-1 / F3-1 — money moves the app can't guard or undo.** One of two borrow entry points is completely uncapped (violating the documented 50% rule); and sweep-to-savings moves real cash with **no undo**, contradicting the app's own "undo, never confirm" philosophy — and the store has no reversal primitive for carryover entries at all.

Overall verdict: **do not publish v0.3 as-is.** F1-4 and F5-1 cause real, silent money/data loss; the F1 edit cluster is a hard dead end. The rest are fixable UX and semantic defects. None of the defects are money-*conservation* failures — the engine keeps its books; the damage is in what the UI lets users do to those books, and in what it fails to persist, undo, or explain.

---

## 2. Methodology

The app is Expo SDK 54 / React Native and has no native web target. To drive it under DOM automation, a throwaway scaffold branch — **`v0.3-e2e-scaffold`** (git worktree, never merged) — compiled it to web via:

- **react-native-web** for the RN component layer.
- **sql.js** in-memory DB shim, ported from the repo's own jest `node:sqlite` mock, so the app ran against real SQL (raw query seam exposed as `window.__scaffoldDb`).
- **Stubs** for secure-store, notifications, sharing, and file-system (all report their real "unavailable/denied" states, matching a device without the hardware/permission).
- **`Alert.alert` → `window.confirm`** polyfill (blocking), overridden deterministically per destructive test.
- A babel **`unstable_transformImportMeta`** fix: zustand's ESM build emits `import.meta`, which fatally broke web parsing. This is a **scaffold-only build issue, not an app bug** — the native Metro bundler handles `import.meta` fine.

**Interaction was DOM-level automation.** The test browser pane was occluded (`visibilityState === 'hidden'`), so screenshots/zoom timed out and compositor clicks did not register. All interaction went through synthetic pointer events + `form_input`; all verification went through the accessibility tree (`read_page`), `innerText`, targeted DOM queries, and raw SQL against the live DB. **Consequence: no pixel-level visual judgments were possible** — a11y trees and copy were the evidence. Pixel-only questions are enumerated in §7.

**Agents:** 6 sequential flow agents (setup/edit, money in-out, time-boundary/carryover/ducks, pond/goals/calendar/ledger, backup/CSV/bills/search, security/notifications/chapter/about), 1 jest agent, 1 adversarial source-verification agent (traced every "bug" claim to `file:line`, corrected severities, refuted nothing), and 1 UX critique agent. Models spanned Sonnet/Haiku/Opus.

**Scaffold fidelity note:** the web scaffold surfaced **no false money behavior**. Every money check the flow agents ran against the raw DB passed; the only scaffold-specific findings were correctly quarantined as artifacts (§7). Money semantics on web matched the jest suite's expectations exactly.

---

## 3. Confirmed defects

Ordered by corrected severity (per `bug-verification.md`, the authority on severity and `file:line`). Where the verification pass corrected a flow agent's rating, the corrected severity is used and noted.

### Blockers

#### The setup edit-mode cluster — F1-1, F1-2, F1-3
The wizard is append-and-remove only, with removal that doesn't remove. These three compound into a permanent trap.

| ID | Title | Sev | Files |
|----|-------|-----|-------|
| F1-1 | Remove+re-Add duplicates live entities (no rename affordance) | blocker | `src/setup/screens/AccountsStep.tsx`, `EnvelopesStep.tsx`; `src/setup/wizardState.ts:111-115,157-163`; `src/setup/save.ts:47-50,60-68` |
| F1-2 | Duplicate names permanently trip uniqueness validation (lockout) | blocker | `src/navigation/SetupRoute.tsx:58-67`; `src/setup/wizardState.ts:196,260` |
| F1-3 | No UI anywhere to delete an account/category/income source | major | `src/setup/save.ts:47-50` |

- **User impact:** a first-time misconfiguration (typo, wrong budget) is effectively unfixable — the workaround duplicates data (Pond shows two "Fun" categories, $60 and $75, and silently sums both into "of $325.00"), and once duplicated, every future edit-mode entry re-reads both rows from the store and immediately trips "Category names must be unique." with Continue disabled, forever.
- **Repro:** complete setup → Settings → Your setup → Remove "Fun", Add "Fun" with a new budget (intending a rename) → Save. DB now has two "Fun" rows. Re-enter edit mode → permanently blocked.
- **Mechanism:** `UPDATE_ACCOUNT`/`UPDATE_CATEGORY`/`UPDATE_INCOME_SOURCE` reducer cases exist and work but are **dispatched from zero `.tsx` files** — the edit path is dead capability. Wizard "Remove" only drops a draft row; `save.ts` never deletes the stored entity. `prefilledWizardState` rebuilds from the live store on every open, so duplicates always return.
- **Fix direction:** add a tap-row-to-edit UI that prefills the Add form with `existingId` set and dispatches the existing `UPDATE_*` actions; add a real (or soft) delete path in `SetupWriter`/store surfaced from the wizard.

#### F1-4 — Phantom "settle last week" prompt; Roll doubles budget; Sweep moves real cash
**Severity: blocker (top priority).** Files: `src/store/index.ts:419-429` (`configuredWeeklyBudget`), `1496-1534` (`rollForward`), `1536+` (`sweepToSavings`); `src/screens/HomeScreen.tsx:99-106` (leftover filter).
- **User impact:** every brand-new chapter's first Home render shows a carryover-settlement prompt for a week that never existed, offering to move the full untouched budget — and "To savings" writes a real `transfer_out`/`transfer_in` pair moving actual cash on fabricated data.
- **Repro:** complete first-run setup with weekly categories on any non-Monday → land on Home → banner "New week — settle last week's envelopes" appears with each category's full budget as "leftover."
- **Mechanism:** `configuredWeeklyBudget()` synthesizes a week's budget purely from current config with **no guard on category/chapter creation date**. A category created seconds ago has a synthetic prior week whose "remaining" equals its full budget, satisfying the Monday-prompt filter (`remaining > 0 && rolledOut === 0 && sweptOut === 0`). `rollForward` writes `roll_out` + `roll_in` of the same amount → current week shows ≈2× budget. `sweepToSavings` short-circuits only on `leftover <= 0`, so it proceeds to move real cash.
- **Fix direction:** gate the leftover computation on the category's (or chapter's) creation timestamp — never synthesize a "previous week" predating the entity's existence. One guard; outsized payoff.

#### F5-1 — Backup TABLES registry omits `recurring_bills`, `merchant_corrections`, `goals`
**Severity: blocker.** Files: `src/backup/drizzleBackupPort.ts:15-27` (`TABLES`, 11 tables), `40-56` (`restoreAll`); `src/db/schema.ts:160,185,211` (the three unregistered tables).
- **User impact:** exporting a backup for migration/safekeeping permanently loses all recurring bills, learned merchant corrections, and savings goals; importing an old backup leaves those three tables stale — silently contradicting "Import replaces everything."
- **Repro:** with an active bill + merchant corrections present, export a backup, add a new bill, import the backup ("Backup imported. Your data has been replaced.") → query DB → both the pre- and post-baseline bill rows and the corrections survive untouched.
- **Secondary defect:** the comment at `drizzleBackupPort.ts:12-14` claims a "completeness check in dumpAll" catches unregistered tables. **No such check exists anywhere** — a false safety net that will let this regress again.
- **Fix direction:** add the three tables to `TABLES` (respecting child-before-parent FK delete order) and add a real static/test-time completeness check that iterates `schema.ts`'s exported tables and asserts each is registered.

### Major

| ID | Title | Sev | Files | Impact (one line) |
|----|-------|-----|-------|-------------------|
| F2-1 | AddExpenseSheet borrow path uncapped vs Home BorrowSheet 50%-capped | major | `src/store/index.ts:1590-1661,1666-1675`; `src/screens/expense/AddExpenseSheet.tsx:147`; `src/screens/HomeScreen.tsx:396` | Overspending via the keypad borrows unlimited amounts against next week (a $99,862 borrow on a $150 envelope committed with no warning); the documented 50% cap is a UI-only convention on one of two entry points. |
| F3-1 | Sweep-to-savings snackbar has no Undo | major | `src/providers/AppShell.tsx:22-25,74-81`; `src/screens/HomeScreen.tsx:~144-148` | A real cash move between accounts has no undo and no confirm — the flagship violation of "undo, never confirm." |
| F4-1 | Already-funded goal shows "Add to savings to start the clock" | major | `src/projections/project.ts:295-314` (esp. `:300`); `src/screens/goals/goalCard.logic.ts:45-46` | A goal already over target reads as not-started; with no 3-month history all goals show that same line, so the pace column carries no information. |
| F4-2 | Over-target goal renders the entire BlockMeter danger-red | major | `src/components/kit/BlockMeter.tsx:46,51`; `src/screens/goals/GoalCard.tsx:44-46` | A savings win (balance > target) visually reads as an overspend crisis; every filled cell recolors, not just the overflow cell. |
| F4-4 | GoalsScreen `useMemo([store, today])` never recomputes; stale savings figure | major | `src/screens/goals/GoalsScreen.tsx:67-74`; `src/providers/StoreProvider.tsx:34-41` | The "Savings balance" figure + trend chart go stale (observed a real $500 discrepancy) versus the live GoalCard on the same screen, until remount. |
| F4-6 | Calendar has no month navigation at all | major (missing feature) | `src/screens/CalendarScreen.tsx:36-37` | A budgeting app cannot show last month or plan next — no prev/next state exists anywhere. |
| F5-5 | No manual "Add bill"; wizard "Fixed bill" categories never reach the Bills forecast | major | `src/screens/settings/BillsScreen.tsx`; `src/store/index.ts:816-823` | A user who flags "Rent" as a Fixed bill in setup gets silently no forecast coverage — bills can only be created via 3-month auto-detection. |

Notes on the majors:
- **F2-1** money conservation still holds (the `borrow_in`/`borrow_repay` pair balances); the damage is to next week's usability. `borrowFromNextWeek` is a thin cadence wrapper that does **not** clamp — the 50% cap lives only in `HomeScreen.tsx`. **Fix:** enforce the cap inside `borrowFromNextCycle` itself and show "Cap: $X" on both entry points. (Recommend a full-repo grep for other `borrowFromNextCycle`/`borrowFromNextWeek` callers before fixing.)
- **F3-1** the real fix is bigger than "pass onUndo": there is **no store-level reversal capability for carryover entries at all** (unlike transactions' soft-delete). A `reverseSweep` primitive must void the carryover entry + the transfer pair atomically, then wire `onUndo`.
- **F4-1** `projectGoalFunding()` returns null pace when `historyCount === 0`, *before* `fundingDate()`'s "already at/over target ⇒ funded today" branch can run. **Fix:** check `currentCents >= targetCents` independently of the history early-return.
- **F4-4** `useStore()` returns the same object reference every render; `useSyncExternalStore` re-renders the component but the `[store, today]` deps never change identity, so the memo is "compute once per mount." GoalCard reads `goalProgress` inline (live), producing the visible contradiction. **Fix:** key the memo on `store.getVersion()` in addition to `today`.

### Moderate / minor (severity corrected down from the flow agents' ratings)

| ID | Title | Agent → corrected | Files | Note |
|----|-------|-------------------|-------|------|
| F4-3 | No cap on goal target / BlockMeter block count | major → **moderate/minor** | `src/components/kit/BlockMeter.tsx:35`; `src/store/index.ts:~1251-1258` (`addGoal`) | Legibility/perf only (9,999 sub-pixel cells at $999,999.99); the a11y tree still reports correct min/max/value, so screen-reader users are unaffected. Zero money impact. |
| F5-4 | "Mark as bill" never dedupes; accumulates duplicate rows | major → **minor/moderate** | `src/screens/settings/BillsScreen.tsx:103-107`; `src/store/index.ts:1172-1193,570-593` | `billsReservation()` filters on `active` only, and Remove soft-deletes before a re-mark, so at most one row is ever active — duplicates are inert junk (DB bloat), not double-counted money. |

### Minor

| ID | Title | Sev | Files | Impact |
|----|-------|-----|-------|--------|
| F1-5 | Removing an account silently drops an income split | minor (arguably moderate) | `src/setup/wizardState.ts:117-125` (`REMOVE_ACCOUNT`); `IncomeStep.tsx` (no warning) | An 80/20 split silently becomes 100% to the survivor with no UI signal — reroutes money invisibly. |
| F1-6 | Duplicate name rejected only at Continue/Save, not at Add | minor | `src/setup/screens/AccountsStep.tsx:35-60`; `wizardState.ts:196,260` | Duplicate row is appended with no inline error; the failure surfaces far away with no pointer to the offending row. |
| F2-2 | BorrowSheet input shows unclamped value while button shows clamped | minor | `src/screens/HomeScreen.tsx:393-397,418` | User who types "100.00" (cap $30) sees the input unchanged; only the button label reflects the clamp. |
| F3-2 | Roll forward gives no feedback at all | minor | `src/screens/HomeScreen.tsx` (roll onPress) | Budget moves between weeks with no toast, unlike its sweep sibling. |
| F3-4 | EnvelopeLedger shows only the current period, no history | minor/moderate | `src/screens/ledger/EnvelopeLedgerScreen.tsx:52` | Past weeks' roll/sweep/repay legs become permanently unreachable, contradicting "every dollar is accounted for." |
| F4-5 | Duck rename 24-char limit is client-only | minor | `src/store/index.ts:941-946` (`renameDuck`) | A >24-char name persists via paste/programmatic set; no store-side validation. |
| F5-6 | Search ledger footer sums income + expense with no sign | minor | `src/screens/settings/searchLedger.logic.ts:79-82` | "$2,259.16 total" = $2,000 income + $259.16 spend added together; misreads as "total spent." |
| F5-2 | JSON export always claims "ready to share" even when sharing failed | **partial** — minor | `src/backup/exportImport.ts`; `BackupScreen.tsx` `handleExport` vs `handleCsvExport` | CSV export honestly reports the fallback path + file location; JSON export does not thread `shared` through. (CSV asymmetry directly source-quoted; JSON `ExportResult` shape not independently re-derived.) |
| F6-1 | App-lock toggle with no PIN silently opens PIN pad | minor | `src/screens/settings/SecurityScreen.tsx` `handleMasterToggle` | Switch stays visually OFF; a bare PIN pad appears with no framing copy. |
| F6-2 | Disabled biometric key still exposed to AT | minor (a11y) | `src/security/LockScreen.tsx` | "Unlock with biometrics" is focusable+activatable with no hardware; silently no-ops. |
| F6-3 | No PIN attempt limit / backoff on LockScreen | minor | `src/security/LockScreen.tsx` submit() | Unlimited wrong-PIN retries; worth a product decision. |
| F6-4 | Denied-notification message names device Settings but offers no link | minor | `src/screens/settings/NotificationsScreen.tsx`; `src/notifications/permissions.ts` | No `Linking.openSettings()` affordance to close the loop. |
| F1-10 | Skip-setup Home has no empty-state copy under "Envelopes this week" | minor | `src/screens/HomeScreen.tsx` | Heading with no rows and no guidance to Setup. |

### Nits

| ID | Title | Files |
|----|-------|-------|
| F1-7 | "Next paydays" computed from anchor date, not today (a past anchor shows as "next") | `src/setup/screens/IncomeStep.tsx:70` |
| F1-8 | Raw `MoneyError` (`Unparseable amount: "12.345"`) shown verbatim | `src/lib/money.ts:57`; `AccountsStep.tsx:46` |
| F5-3 | Corrupt-JSON import shows raw `JSON.parse` message | `src/backup/validator.ts`; `BackupScreen.tsx` |
| F2-5 | Ghost button visible "Not now" vs a11y label "Add the expense without borrowing" | `AddExpenseSheet.tsx:288-294`; `AddExpenseSheet.logic.ts:112` |
| F6-5 | Setup "Cancel" from edit mode lands on Home, not Settings | `App.tsx`/`navigationRef.ts` (deliberate architecture) |
| F6-6 | Settings tab remembers its last subscreen across tab switches | `src/screens/SettingsScreen.tsx` (`useState('root')`, inactive tabs stay mounted) |

---

## 4. UX / UI flow assessment

Condensed from `ux-critique.md`. No pixels were available; friction is judged from a11y trees, copy, and the verified defects.

### Per-core-job friction verdict

| Core job | Verdict | Key friction |
|----------|---------|--------------|
| First-run setup | Clean linear flow, accurate Review; **but a trap** | No in-place edit (F1-1/2/3) is the worst friction in the app — a first misconfiguration is unfixable. Duplicate names accepted late (F1-6); raw errors leak (F1-8); anchor-based payday preview (F1-7). |
| Log an expense | **Exemplary** | POS-style cent keypad exact; commit blocked on $0.00; **Delete→Undo is the gold standard** of the app's philosophy. Only wart: overspend routes to an uncapped borrow (F2-1). |
| "Am I okay this week?" | **Strong** — hierarchy serves the thesis | Hero safe-to-spend answers the daily question at a glance. But two competing runway metrics ($/day vs "~84 days") stack on one screen. |
| Settle last week (Monday) | **Inconsistent + a landmine** | Three sibling actions, three behaviors: Roll = silence (F3-2), Sweep = toast-no-undo on a real money move (F3-1), Let-it-go = client-only dismiss. And the prompt fires on phantom weeks (F1-4). |
| Borrow from next week | **Contradictory guardrails** | BorrowSheet capped+explained; AddExpenseSheet uncapped+silent (F2-1). Input shows unclamped value (F2-2). |
| Set a goal | **Misleading feedback** | Funded goal says "start the clock" (F4-1); over-target meter goes danger-red (F4-2); no target cap (F4-3); trend chart goes stale (F4-4). Linked-account picker correctly offers only savings accounts; Remove→Undo works. |
| Month-end ducks | Not exercisable in-session (§7) | Modal + Pond intro copy are on-brand; but the three goals are labeled differently on every screen. |
| Backup | **Silent data loss** | JSON omits three tables (F5-1); export message inconsistent with CSV (F5-2). Import confirm-gate and CSV per-row review are both correct patterns. |

**"Undo, never confirm" scorecard.** Correct: delete transaction, goal remove, bill remove (all Undo). Justified confirm exceptions: backup import and new-chapter (both rare, heavyweight, effectively irreversible whole-DB operations — a confirm is more honest than a fake undo). CSV import uses per-row review, better than either. **Real violations:** sweep-to-savings (no undo on a money move, F3-1) and roll-forward (no feedback at all, F3-2) — both frequent, reversible-in-principle, inconsistent with their siblings.

### Copy — worst 5 (exact quotes + rewrites)

1. **Inconsistent duck-goal labels.** Home says **"Bills paid / Savings / Envelopes"**; Pond day-one says **"Fixed bills / Variable budgets / Savings"**; the modal says *"bills paid on time, every envelope under budget, savings on target."* The single most important recurring concept has no canonical name — and even the order changes (Savings 2nd vs 3rd). *Fix:* one triplet everywhere, e.g. **"Bills paid · Envelopes under budget · Savings on target,"** defined once in a constants file.
2. **"Add to savings to start the clock"** — shown on an already fully-funded goal, and identically on all three goals (F4-1), so the pace column carries no information. *Fix:* state-aware — **"Fully funded"** (current ≥ target), **"On pace — funded around <date>"** (has history), **"Add to savings to start the clock"** (genuinely zero progress).
3. **"Your safe-to-spend of\$509.98 covers about 84 days at your recent pace."** — missing space after "of," and it introduces a *second* runway metric competing with the hero line ("about \$72.86 a day keeps you green"). *Fix:* **"At your recent pace, that's about 84 days of spending,"** and reconcile with the per-day line so Home tells one runway story.
4. **Raw machine errors surfaced verbatim** — `Unparseable amount: "12.345"` (F1-8) and `…(Expected property name or '}' in JSON at position 2…)` (F5-3). *Fix:* **"Enter an amount with up to 2 decimals (e.g. 12.34)."** and **"That file isn't a valid backup."**
5. **Generic empty state reused without context** — search-with-no-matches shows **"Nothing here yet."** (F5-7), implying the ledger is empty rather than the query. *Fix:* **"No transactions match your search."**

### Copy — best 5 (keep)

1. **"Where does your money live?" / "Where does your money come from?"** — warm, concrete step titles.
2. **"Your first duck is yours from day one. The pond is never empty."** — sets the reward system's tone in one line.
3. **"A partial month is never a loss."** — reframes 1–2/3 as encouragement; excellent behavioral copy.
4. **"about $26.25 a day keeps you green"** — turns a balance into a concrete daily allowance.
5. **"All data lives on this device only — no accounts, no cloud sync, no tracking."** — the privacy pitch stated plainly.

### Hierarchy notes

- **Home** nails the thesis: the hero safe-to-spend number is the largest thing on screen and answers "am I okay?" instantly. Two problems: the **Monday settle prompt sits above the hero** and on a fresh chapter is a phantom, money-moving prompt (F1-4) — worst placement for the worst bug; and two runway metrics both live high (§copy #3).
- **Pond** should be where the duck system feels most coherent, but it introduces the third goal-label variant and re-splits envelope/category terminology ("Categories" heading).
- **Calendar** buries nothing but omits everything past this month (F4-6).
- **Terminology drift** overall: the same object is "envelope," "category," "budget," and "planned" across screens.

### Top-10 UX recommendations

| # | Recommendation | Anchoring evidence | Effort |
|---|----------------|-------------------|--------|
| 1 | Give setup real in-place editing **and** a real delete | F1-1/2/3; design doc §4 already specs rename; `UPDATE_*` reducers already exist | M |
| 2 | Make the three duck goals one named, consistent concept (constants file) | §copy #1 | S |
| 3 | Unify carryover-action feedback; make sweep reversible (`reverseSweep` primitive) | F3-1/F3-2 | M (store work is the bulk) |
| 4 | One borrow experience, one cap — enforce 50% in `borrowFromNextCycle`, show "Cap: $X" both paths | F2-1/F2-2 | M |
| 5 | State-aware goal pace copy + a non-alarming "exceeded" meter | F4-1/F4-2 | S–M |
| 6 | Fix the phantom Monday prompt (gate leftover on creation date) | F1-4 (top severity) | **S** — outsized payoff |
| 7 | Add month navigation to Calendar | F4-6 | M |
| 8 | Reconcile Home's two runway metrics into one story | §copy #3 | S |
| 9 | Close a11y role/state gaps globally (radio `aria-checked`, Sheet `role="dialog"`) | F2-3/F2-4 | S–M |
| 10 | Human error copy + query-aware empty states | F1-8/F5-3/F5-7 | S |

---

## 5. Accessibility summary

**Names: strong (~8/10). Roles/states: weak (~4/10).** The repo's claim that "every touchable has an accessibilityLabel" essentially holds — across all six flows, agents found descriptive labels on every interactive control, many exemplary ("Roll Gas leftover forward into this week," "Sweep Coffee leftover to savings," "Your setup. Accounts, income, envelopes, savings target."). Touch targets on primary controls meet the 48px floor (HardButton `minHeight:48`, keypad 48, calendar cells 48, PinPad 56, LockScreen 64). The gaps are in role/state semantics and a few outliers.

**Two central-component fixes would move the whole app close to accessible:**
- **Radios never set `aria-checked` (F2-3)** — Spending/Savings, cadence, color/kind, and the Monday-prompt default all expose `role=radio` but convey selection only via border color, invisible to AT (WCAG 4.1.2). Pervasive across the wizard. *Fix:* add `accessibilityState={{ checked }}` to the shared radio primitive.
- **Sheets have no `role="dialog"` and no accessible name (F2-4)** — every Sheet (add expense, edit, income, borrow, category picker, day detail) renders `aria-modal="true"` with `role=null` and no `aria-labelledby` to its `accessibilityRole="header"` title. *Fix:* add `role`/`aria-labelledby` to the shared `Sheet.tsx` (`:25`, `:34`).

**Other role/state issues:** disabled-but-focusable biometric key (F6-2); off-screen tab subtrees stay mounted, so a screen-reader swipe can land on controls in a not-visible tab (flow-1 & flow-6 notes — not scored a bug, but a real navigation hazard).

**Ambiguous / divergent labels:** visible "Not now" vs announced "Add the expense without borrowing" (F2-5); duplicate "Remove category Fun" ×2 after F1-1 (F1-9); ChoiceRow Skip/Include announce bare labels with no per-row merchant context (F5-9).

**Sub-target touch sizes:**

| Control | Measured | Standard | ID |
|---------|----------|----------|-----|
| Duck sprite (Pond primary interaction) | 42 × 48px | 48px | F3-3 |
| Sheet "Close" (hitSlop-padded) | ~62 × 39px effective | 48px | F5-8 |

**Screen-reader-safe despite sighted bugs:** BlockMeter reports coherent min/max/now/valueText even in the 9,999-cell (F4-3) and danger-red (F4-2) states — those are purely sighted-UI defects; AT users are unaffected.

---

## 6. What works well (do not touch)

- **Money conservation — the app's foundation.** Verified repeatedly against raw SQLite, not just UI: account balances (live `SUM` over non-deleted transactions) matched displayed figures to the cent across 7+ mutations; income splits conserved (80/20 of $2,000 = exactly $1,600 + $400); carryover pairs always two-leg, equal-amount, shared `pairId`, correct `attribution_month` (the anti-dodge duck-guard held even under the pathological $99,862 borrow); sweep writes both the carryover entry **and** a real transfer pair (Savings $500 → $515 exactly matching a $15 sweep); edit reallocation moved both envelopes and the account balance by the exact delta; a $999,999.99 goal round-tripped to exactly 99,999,999 cents. **No float artifact anywhere.**
- **Undo-on-delete** (transactions, goals, bills) — the app's philosophy done exactly right (soft-delete via `deleted_at`/`active=0`, functional-update restore, verified within and after the window).
- **Lock-screen ordering & PIN security** — PIN stored as salted SHA-256 (no plaintext); boot order coherent (DB bootstrap behind the lock, wizard never flashes behind LockScreen); PIN change fully invalidates the old PIN (verified via real reload); mismatch path leaves the stored hash untouched.
- **Chapter archiving** — New chapter archives the old (`archived_at` set), creates the auto-named new chapter, **preserves old accounts/categories rows untouched**, and ducks survive with `chapter_id`/`earned_month` undisturbed (duck queries are correctly not chapter-filtered). Post-switch, Home/Pond/About/Search show only the new chapter's data — no bleed-through. Reject path is a clean DB-level no-op.
- **CSV import pipeline** — fully verified end-to-end: correct classification of clean/keyword-matched (SAFEWAY → Groceries)/exact-duplicate (excluded by default with a working Include/Skip toggle)/malformed rows; commit produced exactly 3 transactions at exact cents and exactly 2 learned merchant corrections (matching the "teach on any needsReview accept" design). Subscription detection (3-month, 2% tolerance, 20–40 day spacing) fired correctly and stopped suggesting once a bill became active.
- **Voice / copy wins** — see §4 best-5; the second-person, plain-spoken, encouraging voice is a genuine product asset and is largely consistent.
- **Other verified positives:** Review step is an exact one-to-one summary; field validation blocks the right cases without clearing other input; negative starting balances accepted (credit cards); Goal linked-account picker offers only savings accounts (defense in depth); Calendar grid date math exact (Monday columns, payday rings, heatmap opacity formula); Bills "Due before payday" mode-of-day math correct; Search ledger correct across 5 filter scenarios against DB ground truth.

---

## 7. Coverage gaps & scaffold artifacts

**Not covered (out of reach for a web/DOM session — flagged honestly):**

- **Month-end DuckResultsGate / PayPeriodRecapGate UI** — both run a one-shot `useEffect(() => {…}, [])` at `NavigationContainer` mount; unreachable in-session (the only remount path is the PIN-lock unlock, which needs a native `AppState` transition). Seeding `duck_evaluations` + backdating the chapter did not re-fire them. **The duck engine itself is thoroughly jest-covered** (F3-5, correctly self-identified as a coverage gap, not a bug).
- **Biometric hardware path** — scaffold reports biometrics unavailable (PIN path only).
- **Real notification delivery** — permission always denied in scaffold; the opt-in/permission-flow logic was exercised, delivery was not.
- **Native share sheet** — `Sharing.isAvailableAsync()` false; export writes the file and reports the fallback path.
- **Android rendering, keyboard avoidance, safe areas / notch** — no device render; enumerated as pixel-only questions below.
- **DB persistence across restarts** — in-memory on web (reload wipes the DB). **Migrations are jest-covered** (including the migration-1 legacy float-dollars → cents conversion).
- **`attributionMonth` cross-month borrow guard** — jest-covered; also observed holding in the live borrow tests.

**Scaffold artifacts (correctly quarantined by the agents — not app bugs):**

- **F2-7** — synchronous double-tap race: firing two synthetic taps 0ms apart in one script applied the second against pre-update state. No human fires two events with 0ms between; consistent with React batching under `act()`-less dispatch. Non-reproducible when taps were split across calls.
- **F3-5** — the gate-unreachability above (coverage gap, not a defect).
- **F2-6** — Calendar payday marker driven by the income *schedule*, not ad hoc income entries; the agent self-identified this as almost certainly intentional (payday = projected cadence).
- **Environmental noise (ignore):** `setTimeout` throttled ≥1s (snackbar/undo timers sluggish — never reported as app timing bugs); a react-native-web `transform-origin` DOM-property-name console warning (RN-web-wide, pre-existing); font fallbacks; the zustand `import.meta` build fix (§2, scaffold-only).

**Pixel-only questions deferred to a device/emulator run (from `ux-critique.md` §7):** duck-sprite legibility + stepped animation; CVD palette on OLED black; how alarming the danger-red goal meter (F4-2) actually looks; the 9,999-cell meter (F4-3) failure mode (smear vs perf hitch); hairline/1px border rendering at real DPI; keyboard avoidance over active fields/buttons; safe-area clearance for the hero number and tab bar; HardButton offset shadow + focus ring; stepped-motion + OS reduced-motion suppression; text truncation under dynamic type and long duck/category names.

---

## 8. Appendix

### 8a. Jest / tsc (verbatim summary)

```
Test Suites: 63 passed, 63 total
Tests:       762 passed, 762 total
Snapshots:   0 total
Runtime:     7.123 s
TypeScript:  tsc --noEmit — exit 0 (no type errors)
```
Complete success: no failures, skips, or type errors.

### 8b. Scaffold branch details

- **Branch:** `v0.3-e2e-scaffold` (git worktree at `.claude/worktrees/agent-a87dc421afa0e9cd8`; **never merged — throwaway**).
- **Key commits:**
  - `bef45cf` — e2e web test scaffold (throwaway — never merge)
  - `dbd3ba3` — scaffold deps re-applied on v0.3 lockfile (throwaway — never merge)
  - `ee098de` — fix web boot: polyfill `import.meta` via babel-preset-expo (throwaway — never merge)
- **Re-run:**
  1. Check out the branch in a worktree.
  2. `cd budget-tracker && npm install`
  3. `npx expo start --web --port 8090`
  4. Drive per **`FLOW_AGENT_PROTOCOL.md`** (the DOM-automation interaction protocol: `window.tap`/`tapNth`/`tapText` helpers, `form_input` for text fields, `window.__scaffoldDb` raw-SQL seam, `localStorage.clear()` + reload for a fresh state, `window.confirm` override before destructive actions).

### 8c. Scratchpad artifacts

Location: `…/d81bc277-460f-401a-b194-e44ff1689bb4/scratchpad/`
- `flow-1-findings.json` … `flow-6-findings.json` — raw per-flow findings (positives + a11y notes + finding ids F1-1 … F6-6).
- `flow-N-pages/` — `read_page` a11y-tree dumps per screen (screenshot substitutes).
- `bug-verification.md` — adversarial source-trace (authority on severity + `file:line`).
- `ux-critique.md` — flow friction, copy, hierarchy, a11y audit, top-10, needs-visual-check list.
- `jest-results.md` — test/tsc summary.
- `FLOW_AGENT_PROTOCOL.md` — the interaction protocol.

Finding ids (F1-1 … F6-6) are consistent with the JSON records for cross-reference.
