# Ducks in a Row 🦆

A personal budgeting app where keeping your finances in order earns you ducks — and letting things slip loses them. Envelope budgeting with a game layer that lives in the middle of your analytics.

**Current release: v0.2.0** — fully functional, distributed via EAS Update (`preview` channel) for Expo Go on SDK 54.

## The concept

- **One daily question:** *can I buy this?* The Home screen answers with a single safe-to-spend number backed by envelope meters for your variable spending (segmented blocks — one block, ten dollars).
- **One monthly question:** *did I keep my life in order?* On the 1st, the app evaluates three goals — fixed bills paid, every envelope under budget, savings rate on target. All three: a pixel duck waddles into your pond. None: one duck walks away (it pauses and looks back; we're sorry). The pond lives in the center of the plan-vs-actual donut on the Pond tab.
- Twelve ducks caps the flock; after that, good months earn the whole flock accessories — bowtie, monocle, top hat.

## Features (v0.2)

- **Setup wizard** — accounts, income sources with cent-exact split ratios and real pay schedules (weekly / biweekly / semimonthly / monthly), fixed categories and envelopes. Fully editable later (edits reconcile in place). "New chapter" archives your current config for life changes — history and ducks survive.
- **Envelopes with carryover** — roll leftovers forward, sweep them to savings (moves real money), or let them go. Borrow from next week when you overshoot: capped at one week ahead, 50% of next week's budget, repayment visible in both weeks. Budget is conserved — never created.
- **Duck guard** — cross-month borrows count against the month that overspent. You cannot borrow from August to save July's duck.
- **Calendar heatmap** — spend intensity per day, mint rings on paydays, coral on fixed-bill hits; tap into a full day view with long-press edit/delete and undo.
- **Backup & restore** — versioned JSON export via the share sheet; import replaces everything atomically.
- **App lock** — PIN + biometrics, background-lock timeout.
- **Local notifications** — bill reminder, payday note, envelope warnings; all opt-in.
- **100% offline.** No accounts, no tracking, no data leaves the device except backups you export yourself.

## Tech

Expo SDK 54 · React Native 0.81 · TypeScript (strict) · SQLite (expo-sqlite + Drizzle, versioned migrations) · Zustand · react-native-svg. All money is integer cents behind a branded `Cents` type — floats never touch money paths.

## Repo layout

| Path | What it is |
|---|---|
| `budget-tracker/` | The app. See `budget-tracker/CONTRACTS.md` for the internal architecture contracts. |
| `CLAUDE.md` | Codebase guide for AI-assisted development sessions. |
| `DucksInARow_DesignDoc_v2.md` | The v2 design spec this release implements. |
| `BudgetApp_DesignDoc.md` | The original v1 spec (historical; §9 is the Duck System source). |
| `CHANGELOG.md` | Release history. |
| `store/` | Play Store compliance docs (privacy policy, data safety, listing draft). |
| `builds/` | v1-era build/test artifacts (historical). |

## Development

```bash
cd budget-tracker
npm install
npx expo start          # Expo Go dev loop (hot reload)
npx jest                # full test suite (includes db/store integration on in-memory SQLite)
npx tsc --noEmit        # typecheck
```

Publish a preview build: `npx eas-cli update --branch preview --message "..."` — anyone with the channel QR gets it on next load.

## Roadmap

Custom duck sprite sheets, richer pond animations, `expo prebuild --clean` for a standalone SDK 54 APK/AAB, Play Store listing assets. See CHANGELOG for known v0.2 scope notes.
