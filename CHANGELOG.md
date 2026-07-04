# Changelog

## v0.2.0 — "Ducks in a Row" (2026-07-04)

Complete rebuild of the v1 Budget Tracker into Ducks in a Row, per `DucksInARow_DesignDoc_v2.md`. Built by a multi-agent team pipeline (five parallel build teams + adversarial reviews + a fresh-eyes ship verifier) on Wave-0 interface contracts.

### Foundation
- All money is integer cents (branded `Cents`); float-free parsing, cent-conserving income-split allocation (fuzz-tested at 2M cases).
- Atomic SQLite writes (transactions + savepoints); referential-integrity checks on every mutation.
- Versioned migrations; legacy v1 float-dollar data converts via string math.
- db/store test suites un-hidden and running on real in-memory SQLite; 253 tests incl. two end-to-end life simulations.

### Features
- First-run setup wizard (accounts, income schedules + splits, envelopes); edit-in-place reconciliation; "new chapter" archival for life changes.
- Envelope carryover: roll forward / sweep to savings (records a real transfer) / borrow from next week (capped: one week, ≤50%).
- Duck System: monthly 3-goal evaluation, gain/hold/lose lifecycle with 12-duck cap and accessory tiers, catch-up for missed months, final verdicts, exploit-hardened (duck guard for cross-month borrows, anti-farming income-zero rule, dormant months mint nothing). Duck naming (tap a duck).
- Midnight visual system: pixel-HUD components, CVD-validated category palette, pixel duck sprites with stepped animation, full accessibility labels.
- Screens: Home (safe-to-spend hero, 7-day bars, envelope meters, Monday prompt, borrow sheet), Calendar heatmap + day detail with undo editing, Pond (plan-vs-actual donut + live goal tracker + flock), monthly Results flow, Settings (backup export/import, PIN/biometric lock, notification toggles, new chapter).
- Platform: Expo SDK 54 / React Native 0.81 / React 19; EAS Update channel `preview` (runtime `exposdk:54.0.0`).

### Known scope notes (by design)
- Sweeping when the only account is the savings target moves no cash and doesn't credit the savings goal.
- Edit setup adds and modifies but never deletes stored entities (non-destructive).
- Fixed-bill "confirmation" is inferred from a logged expense in the category that month (no separate confirm flow yet).
- Standalone APK/AAB requires `expo prebuild --clean` first (committed `android/` folder is SDK-51-era; Expo Go path unaffected).

## v1.x — Budget Tracker (historical)

Original calendar-first tracker (see `BudgetApp_DesignDoc.md` and `builds/`). Superseded by v0.2.0's rebuild and renumbering.
