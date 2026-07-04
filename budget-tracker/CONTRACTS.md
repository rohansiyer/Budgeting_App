# Wave-0 Contracts — Ducks in a Row

Read this first if you are a team agent. The spec is `../DucksInARow_DesignDoc_v2.md`;
this file is the build-against surface. **Contract files may not be changed by
team agents** — propose changes to the orchestrator instead.

## Contract files

| File | What it fixes in place |
|---|---|
| `src/lib/money.ts` | Integer-cents money type + arithmetic + cent-conserving `allocate()`. Implemented, not a stub — use it, don't reinvent it. |
| `src/types/contracts.ts` | Domain types: income schedules/splits, envelopes, chapters, carryover entries + conservation law, duck evaluations + engine interface, `StoreContract`, `AtomicDb`. |
| `src/theme/tokens.ts` | Midnight palette (incl. CVD-validated category colors), spacing, pixel-HUD constants, stepped-motion constants. No literal colors in screens. |
| `src/components/kit/types.ts` | Component-kit prop APIs: `PixelBox`, `BlockMeter`, `HardButton`, `RuledList`, `CategoryChip`, `DuckSprite`. |
| `src/db/migrations/types.ts` | Migration framework contract; Drizzle schema is the single source of truth. |

## Non-negotiable rules

1. **No floats in money paths.** All amounts are `Cents`. `parseDecimal`/`formatCents`
   are the only string↔cents crossings. A `parseFloat`, `toFixed`, or arithmetic on
   `amount / 100` outside `money.ts` is a blocking defect.
2. **All multi-row writes are atomic** via `AtomicDb.withTransaction`. Zustand state
   updates happen after commit, never before.
3. **Verdict finality.** Nothing mutates an issued `DuckEvaluation`.
4. **Conservation law** for carryover (see `contracts.ts`): budget moves, it is never
   created. Borrow caps: next week only, ≤50% of next week's configured budget.
5. **Duck guard:** cross-month borrows attribute spend to `attributionMonth` = the
   month the overspend happened in.
6. **No emoji in UI. No rounded-card containers. No literal hex in screens.**
7. **Every touchable has `accessibilityLabel`** (and a role); color-only states get a
   text fallback.
8. **IDs**: use a single `generateId()` in `src/lib/ids.ts` (Team 1 creates it —
   collision-safe, not `Date.now()+Math.random()`).
9. Keep the app bootable in Expo Go at every commit.
10. **Legacy type shadowing:** the income/analytics types in `src/types/index.ts`
    (`IncomeSplit`, `IncomeConfig`, `DailyTotal`, …) are deprecated; Team 1 deletes
    them in the retrofit. Import domain types ONLY from `src/types/contracts.ts`.
11. Contract files live inside team-owned directories (`money.ts` in Team 1's
    `src/lib`, `tokens.ts` in Team 3's `src/theme`). Teams may ADD sibling files
    freely but must route edits to the contract files themselves through the
    orchestrator.

## Team ownership map

- **Team 1 (Vault):** `src/db/**`, `src/store/**`, `src/lib/**` — schema, migrations,
  atomic store implementing `StoreContract`, carryover storage, duck tables, cents
  codemod, jest un-hiding, transaction editing plumbing.
- **Team 2 (New Chapter):** setup wizard screens, income schedule engine
  (`IncomeSchedule` → payday projection), chapter archival, seed removal.
- **Team 3 (Midnight):** `src/theme/**`, `src/components/kit/**`, all screens,
  navigation (Home/Calendar/Pond/Settings), a11y, emoji/round-corner removal.
- **Team 4 (Pond):** `src/ducks/**` — `DuckEngine` implementation, sprite module,
  pond renderer + Results screen (rendering into Team 3's shell via `DuckSpriteProps`).
- **Team 5 (Shipping):** backup/restore, app lock, notifications, release config.
