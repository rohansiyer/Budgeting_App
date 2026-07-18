# CLAUDE.md — Ducks in a Row

Guide for AI-assisted sessions in this repo. The app lives in `budget-tracker/`; run all commands from there.

## Commands

```bash
npm install                      # deps (Expo SDK 54; use `npx expo install <pkg>` for SDK-pinned adds)
npx jest                         # full suite — db/store tests run on REAL in-memory SQLite (node:sqlite mock)
npx tsc --noEmit                 # typecheck (strict)
npx expo start                   # dev loop in Expo Go
npx expo export --platform android   # bundle check (the pre-publish gate)
npx eas-cli update --branch preview --message "..."   # publish to the QR channel
```

## Architecture in one pass

- **Contracts first.** `src/types/contracts.ts` is the shared interface layer (StoreContract, EvaluationReadPort, DuckPersistencePort, carryover types). `budget-tracker/CONTRACTS.md` documents the rules and module ownership map. Change contracts deliberately; everything is typed against them.
- **Money is integer cents.** `src/lib/money.ts` — branded `Cents`, float-free `parseDecimal`, display-only `formatCents`, cent-conserving `allocate()` (income splits). A `parseFloat`/`toFixed`/float arithmetic on money outside money.ts is a defect.
- **Store** (`src/store/index.ts`): Zustand implementing StoreContract on Drizzle/SQLite. Every multi-row write goes through `withTransaction` (BEGIN/COMMIT/ROLLBACK, savepoints for nesting); Zustand refreshes only after commit. Mutations validate id existence before inserting (a transfer to a phantom account must throw, not destroy money).
- **Schema & migrations**: `src/db/schema.ts` (Drizzle, single source of truth) + `src/db/migrations/` (versioned runner; migration 1 converts legacy float dollars → cents via string math). Never raw DDL in client.ts.
- **Carryover conservation law**: roll/borrow entries come in pairs (shared `pairId`, equal amounts); sweeps also write a real transfer to the savings account in the same transaction. Borrowing is cadence-aware and UNCAPPED by design: an envelope borrows from its own next cycle (next week for weekly cadence, next calendar month for monthly), with no ceiling beyond a positive whole-cent amount against a configured budget — `nextCycleStartState` gives the UI the honest math (what the next cycle already starts with) so every entry point can show the real consequence before committing. `attributionMonth` implements the duck guard (cross-month/cross-cycle borrows punish the origin month).
- **Duck engine** (`src/ducks/engine.ts`): monthly 3-goal evaluation, gain/hold/lose lifecycle, catch-up of missed months oldest-first, verdicts are FINAL (no mutation API). Consumes `EvaluationReadPort` + `DuckPersistencePort` from the store (assembled in `src/ducks/appEngine.ts`). Goal 2 uses week-belongs-to-its-Monday's-month attribution; Goal 3 (income & savings) uses calendar months. Income-zero months: savings > 0 does NOT meet Goal 3 (anti-farming).
- **UI**: `src/theme/tokens.ts` (midnight palette — CVD-validated category colors; no literal hex in screens) + `src/components/kit/` (PixelBox 4px-notch containers, segmented BlockMeter, HardButton, RuledList). No rounded cards, no emoji in UI; ducks are pixel sprites (`src/ducks/sprites.ts`, stepped animation only). Every touchable has an accessibilityLabel.
- **Navigation**: root native stack (`Tabs` + full-screen `Setup` route) in `src/navigation/`; typed nav helpers in `navigationRef.ts` (`openSetup(mode)`, `openTab`). First run (no accounts) lands in the wizard. Settings subscreens use a local state stack inside the tab.
- **Setup wizard** (`src/setup/`): reducer + validation (`wizardState.ts` — adversary-hardened, don't weaken), writes through `SetupWriter` (`storeSetupWriter.ts` in prod). Edit mode prefills drafts with `existingId` and `save.ts` reconciles (update in place, never duplicate; removal is non-destructive).
- **Shipping modules**: `src/backup/` (versioned dump/restore, all-or-nothing via `drizzleBackupPort.ts`), `src/security/` (PIN/biometric lock, mounted in App.tsx), `src/notifications/` (opt-in, Android 13+ permission flow).

## Conventions & gotchas

- Reads on StoreContract are sync (in-memory caches); mutations are async. Reactivity is `src/providers/StoreProvider.tsx` (`useStore()` subscribes) over the proxy in `providers/realStore.ts`.
- IDs come from `src/lib/ids.ts` (`generateId()`), never `Date.now()+random`.
- expo-file-system is imported via `expo-file-system/legacy` (SDK 54 moved the API); the jest `moduleNameMapper` mirrors this — new expo module imports need a mock mapping in `jest.config.js`.
- Scheduled notifications need an explicit `type: SchedulableTriggerInputTypes.DATE` (SDK 54).
- The committed `android/` folder is still SDK-51-generated: fine for Expo Go/EAS Update (JS-only), but run `expo prebuild --clean` before any standalone APK/AAB build and re-verify the hand-added manifest permissions.
- `app.json` `runtimeVersion` is the manual string `exposdk:54.0.0` (bare workflow forbids policies); it must match the Expo Go SDK for updates to load.
- The end-to-end suites (`src/store/__tests__/v02-e2e.test.ts`, `src/setup/__tests__/editReconcile.e2e.test.ts`) script full user lives against the real store — extend them when changing money/duck/carryover semantics.

## Design references

- `DucksInARow_DesignDoc_v2.md` — the implemented v2 spec (§ numbers referenced in code comments).
- `BudgetApp_DesignDoc.md` §9 — the original Duck System spec (lifecycle table is binding).
- Money rules recap in `budget-tracker/CONTRACTS.md` ("Non-negotiable rules").
