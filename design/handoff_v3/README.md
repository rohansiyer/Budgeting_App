# Handoff: Ducks in a Row v0.3 (design review implementation)

## Overview

This bundle implements the outcomes of a full design review of **Ducks in a Row** (the envelope-budgeting app in `rohansiyer/Budgeting_App`, code in `budget-tracker/src/`). It covers three kinds of change:

1. **Rules changes**: new duck economy, cadence-aware borrowing, pay-period recaps.
2. **Aesthetic changes**: the duck becomes a pixel **mallard** (new sprite sheet with legs, swim, preen), the Pond is redrawn as an actual pond with a category-segmented ring, plus type-scale patches.
3. **UX/feature changes**: a free on-device insight layer ("delivered, never fetched"), drill-down ledgers behind every number, CSV import with semantic category matching, bills forecast, subscription detection, search/filter, stepped projections, plus the missing component layer (forms, snackbar, tab bar, empty states).

Everything here was designed against the shipped v0.2.0 source (`src/theme/tokens.ts`, `src/components/kit/`, `src/ducks/sprites.ts`) and is intended to slot into that structure, not replace it.

## About the design files

The files in `designs/` are **design references created in HTML**. They are prototypes showing intended look and behavior, not production code. Your task is to **recreate these designs in the app's existing React Native / Expo environment**, using its established patterns: the Zustand store, the SQLite layer, the `kit/` component conventions, and the token files. Open the `.dc.html` files in a browser to view them (keep `support.js` and `_ds/` beside them).

- `designs/Design System Review.dc.html`: the review document. All findings F1 to F12, priorities, and the roadmap. Read this first for the "why."
- `designs/Pattern Mockups.dc.html`: one mockup per proposed pattern, at phone width. This is the primary visual reference.
- `designs/Mallard Sprite Sheet.dc.html`: the new duck. Frame-by-frame grids, palette, timing, and animation rules, with live previews.
- `assets/mallard-reference.png`: the pixel-art reference the mallard was matched to.
- `designs/_ds/`: the compiled design-system tokens and component bundle the mockups load. `tokens/*.css` mirrors `src/theme/tokens.ts`.

## Fidelity

**High-fidelity.** Colors, spacing, type sizes, and copy in the mockups are final and use the app's real tokens. Recreate them pixel-perfectly with the existing `kit/` components wherever one exists. The wandering-duck Pond scene is directional in its exact duck choreography (positions/timing may be tuned), but its structure, palette, ring geometry, and sprite frames are final.

---

## 1. Rules changes (engine-level)

### 1.1 Duck economy (`src/ducks/` evaluation engine)

Replace the current month-close evaluation with:

| Condition | Outcome |
|---|---|
| First launch | Flock starts at **1 duck** (the starter duck). The pond is never empty. |
| Month closes 3 of 3 goals met | **+1 duck** (waddle-in animation) |
| Month closes 1 or 2 of 3 goals met | **No change.** A partial month is never a loss. |
| Month closes 0 of 3 goals met | **-1 duck** (walk-off animation), and only then |

The three goals are unchanged: fixed bills paid on time, every envelope under budget, savings on target. Copy shifts accordingly: warnings say "earn July's duck," never "don't lose your duck." Loss copy stays warm: "A tough month. One duck waddles off, but the pond is still here for you."

### 1.2 Borrowing (cadence-aware, uncapped)

- Every envelope can borrow, not just select ones.
- An envelope borrows from **its own next cycle**: weekly envelopes from next week, monthly envelopes from the rest of the month / next month.
- **Remove hard borrow caps.** The guardrail is honest math: the borrow prompt shows exactly what the next cycle will start with (see the "Borrow prompt" mockup). Money is never invented or lost.

### 1.3 Envelope cadence

Envelopes carry a cadence field (`weekly` | `monthly`). Some users run Fun monthly; the whole UI (meters, borrow prompts, warnings) respects the envelope's own cadence.

### 1.4 Recap cadence

Recaps fire at the close of **every pay period**, not just month-end. Month-end recaps additionally carry the duck verdict (1.1). "Time to count ducks!" remains the month-end frame.

---

## 2. Aesthetic changes

### 2.1 The mallard (replaces the yellow duck)

Implement in `src/ducks/sprites.ts` following the existing data-driven pattern (character grids -> colored rects). Full spec in `Mallard Sprite Sheet.dc.html`; the exact frame grids are embedded in that file's script and can be lifted verbatim.

- **Grid: 16 wide x 14 tall** (was 14x12). The last two rows are reserved for legs.
- **Palette (9 hues):**
  - `G` head `#4C9C46`
  - `K` eye `#14181A`
  - `O` bill `#E8A93D`
  - `C` neck/collar `#F0E9D6`
  - `B` body `#C9BFAE`
  - `W` wing `#8E8577`
  - `R` breast `#8A5638`
  - `D` tail `#3F3B33`
  - `L` legs `#D97E32`
  - Swim water: `#1C4F46` / `#28695B` (ripple pair)
  - The old body yellow `#EFC94C` is retired to the semantic palette.
- **Animations (all stepped, `steps()` timing, never interpolated; reduced-motion holds frame 1):**
  - **Idle**: 2 frames, 1150ms loop (stand / bob down 1px, legs compress). Unchanged timing from current sprite.
  - **Waddle-in**: 4 frames at 180ms (plant / astride+bob / plant / pass+bob), enters left with a 2px shift per frame, settles into idle.
  - **Walk-off**: identical frame data flipped horizontally, exits right, two hold frames at the edge (matches the current walk-off table).
  - **Swim**: 2 frames at 500ms. **Legs are removed**; body sits two rows lower; waterline covers the bottom two rows with a 4px ripple pattern. Frame 2 sinks one more pixel.
  - **Preen** (new): stand (900ms hold) -> head turn (350ms) -> bill in wing (1200ms hold) -> turn back (350ms), plays once. Fire at random every 8 to 20 seconds on at most one duck at a time in the Pond.
- **Rule: legs appear for land animations and disappear for swimming.** In-pond ducks use "float" variants with no water rows (the pond supplies the water) and the bottom two body rows hidden below the surface.
- Accessory tiers (bowtie, hat, chain) carry over unchanged at their existing overlay coordinates.

### 2.2 The Pond screen (redrawn)

See the "The Pond, redrawn" mockup. Replaces the two-ring (planned 45% / actual solid) donut.

- **The center is an actual circular pond**: fill `--pond-deep` (#0C262D), 6px edge stroke `--pond-edge` (#17454E), a few 4px pixel-ripple rects that alternate opacity on a stepped timer.
- **Ducks wander it**: some waddle the shore path around the water (stand/stride frames, flipping to face their direction of travel), some float inside it (legless float frames, drifting in discrete steps). Movement is stepped (~400ms ticks), never tweened.
- **The ring is a pie of envelopes**: one thin ring (8px radial thickness) of 48 discrete blocks around the outside. Each envelope gets an arc segment proportional to its **budget share**, drawn in its category color at **22% opacity** (the plan), and its blocks fill to **100% opacity** (solid) as spending lands. One block = a fixed dollar denomination so money stays countable. Reference geometry: 312px container, blocks 12x8px at radius ~152, 7.5 degrees apart.
- Below the ring: flock count ("8 of 12 ducks"), period spend ("$312.40 of $500.00 spent", tabular numerals), and a category legend using CategoryChip + text labels.

### 2.3 Type and accessibility patches

- Add token `--text-kpi`: 20px / 700. Use for mid-importance numbers (envelope remainders, day KPIs, sheet titles, goal amounts).
- Raise the caption token from 11.5px to **12px**. Reserve 11px strictly for tracked uppercase section labels.
- Content-bearing small text (pacing line, insight sentences, warnings) sits at 13 to 14px, never at caption size.
- Add a **focus state**: 1px mint (`--accent`) outline, offset 2px. No glow.
- Keep: 48px minimum tap targets, color-never-alone (text fallback always), CVD-validated category hues, reduced-motion enforcement.

### 2.4 Aesthetic invariants (do not change)

Zero corner radius everywhere. BlockMeter over smooth progress bars. One hard 3px offset shadow (HardButton only, pure black, no blur). Single mint accent; amber/coral strictly semantic. Dark theme only. No emoji, no icon library (plain glyphs only). No gradients, photos, or blur. Stepped motion only. Tabular numerals for all money and dates.

---

## 3. UX and feature changes

Implement in roadmap order (see review doc section 11): 1) form layer + wizard, 2) add-expense + snackbar, 3) insight layer + ledgers, 4) empty states + Home goal strip, 5) type patch, 6) named goals + widget + copy library, 7) data layer, then projections.

### 3.1 New components (add to `src/components/kit/`)

| Component | Spec |
|---|---|
| `Field` | Text/amount input. 48px height, `--surface-deep` well, 1px `--border`, focus = 1px `--accent` border (no glow). Label above in 11px tracked uppercase mono. |
| `ChoiceRow` | Segmented options built from ghost-HardButton cells; selected cell gets `--accent` border + text. Square `Toggle` variant, no pill shapes. |
| `StepTrack` | Wizard progress: N discrete blocks (filled = `--accent`, unfilled = `--surface-deep` + 1px border), 8px tall, 3px gaps. Never a bar. |
| `Snackbar` | `--surface` bar, 1px border, message left + ghost HardButton "Undo" right. Delivers the "undo, never confirm" content rule. |
| `TabBar` | The one fixed chrome element. Four tabs (HOME / CALENDAR / POND / SETTINGS), 56px, mono 11px tracked labels, active = text `--text` + 24x3px `--accent` underline block. |
| `EmptyState` | PixelBox + DuckSprite + one sentence + one action. Defined once, used on every zero screen. |
| `InsightRow` | CategoryChip + one plain-language sentence with the exact dollar figure in mono accent. Hairline-divided rows. |
| `SparkBlocks` | Vertical BlockMeter columns for multi-month trends; one block = fixed dollar amount. |

### 3.2 Onboarding wizard (F1)

4 steps, ~3 minutes, feels like the game starting. See "Wizard step" mockup: step counter + mallard top row, StepTrack, one question per screen (20px/800 title, 12px muted subtext), Field / ChoiceRow inputs, Continue button bottom-right. Store-blocking priority.

### 3.3 Day one (F2)

Every screen has a defined zero state. The Pond on day one introduces the **starter duck** with the three goal checkboxes (see "Day one" mockup): "Meet your first duck, it's yours from day one. Hit all three goals this month and a second one waddles in." Ghost button "How ducks work."

### 3.4 Add expense (F3)

Amount-first, under 5 seconds (see mockup): big 44px mono amount, live envelope feedback line in accent ("Food: $26.60 left after this") before confirm, recent categories as 4 one-tap 48px squares (chip + label), 3x4 keypad of 48px mono keys on `--surface-deep`, full-width confirm HardButton labeled with the action ("Add $12.40 to Food"). The borrow prompt (1.2) lives here as a PixelBox: names the envelope, its cadence, and exactly what the next cycle will start with; primary "Borrow $13.60 from next week" + ghost "Not now."

### 3.5 Home (F4 + F5)

See "Home" mockup, top to bottom: greeting + mallard/flock chip; hero safe-to-spend (44px mono accent) with **pacing line** ("4 days to payday, about $32.10 a day keeps you green, tap for the math"); **goal strip** PixelBox ("July's duck" + three 10px status squares + one warning sentence in `--warn` when relevant, phrased as "ease off to earn July's duck"); **Today's answer**: one delivered insight sentence, hairline-separated; envelopes with BlockMeters; Add expense button.

### 3.6 Insight layer (F5): delivered, never fetched

- All insight is computed **on-device** and **free**. No servers, no paywall.
- **Not prose generation**: ~20 deterministic rules, each = trigger condition + template with slots (`{category} came in {amount} under budget, your best month since {month}`). Rank them; render the top 3 that fired per recap, 1 per day on Home. If nothing fired, show nothing. Silence beats filler.
- **The friction rule**: insights arrive (Home sentence at open, live math in add-expense, self-building recap). The user never runs a report. Cap: one insight per surface per day.
- **Recap screen** (see "Recap" mockup): duck/status PixelBox header, 3 InsightRows, SparkBlocks 6-month trend.

### 3.7 Every number is a door (F10)

Progressive disclosure, not a mode. Tap safe-to-spend -> the exact ledger that produced it (see "Tap-down" mockup: paycheck + reserved bills + funded envelopes + savings + carryover = total, RuledList rows, tabular numerals, +amounts in accent). Tap an envelope -> full transaction ledger, carryover history, borrow record. Tap an insight -> the numbers behind it. Every row opens further. CSV **export** in Settings.

### 3.8 Data layer (F11)

- **CSV import with semantic matching** (see mockup): on-device merchant-string tokenization matched against category keyword lists plus learned corrections (assign "TRADER JOE'S" to Food once, it's Food forever). Always lands in a review screen: "We sorted 142 of 151. Check these 9." Never silent. Suggested category rendered as chip + "Food?" + Change. Footer: "Matching happens on your phone. Nothing is uploaded, ever."
- **Bills forecast** (see mockup): "Due before payday" RuledList (date / name / amount), total, status line ("All covered, already reserved out of safe-to-spend"). Feeds the safe-to-spend math.
- **Subscription detection** (see mockup): recurring merchant at steady amount fires an insight-rule PixelBox ("Spotify has hit for the 3rd month running, $11.99 each time") with "Mark as bill" / ghost "Ignore."
- **Search/filter** (see mockup): Field over a RuledList, category-chip filter row, results with dates + amounts, footer count + total.

### 3.9 Projections (F12), two house rules

- **Stepped, never smooth**: step line, one step per week, hard right angles (see "Savings" mockup, 3px stroke).
- **Projection at 45% opacity**, labeled "if your last 3 months hold," so an invented number is never rendered as fact. A vertical hairline marks today; a dashed hairline marks the goal amount.
- Math is median trailing spend per envelope plus scheduled bills. No ML.

### 3.10 Named goals + widget (F9)

- **Named goal**: PixelBox with tracked uppercase label ("GOAL: MY OWN PLACE"), 20px/800 name, "$340.00 of $1,200.00" (accent current amount), BlockMeter (one block = $100), pace line ("At your pace: fully funded around March").
- **2x2 home-screen widget**: safe-to-spend (24px mono accent) + mallard + "ON TRACK". The duck's animation is the status. Prioritize above notification polish; for a manual-entry app the widget is the retention mechanism. [SCOPE NOTE: the widget is EXCLUDED from the v0.3 implementation per project decision.]

---

## 4. Copy rules

- **Zero em dashes anywhere.** Use commas, colons, or periods.
- No emoji in UI. Sentence case; ALL-CAPS only for tracked mono section labels.
- Second person always ("your envelope," "your flock").
- Money is always exact ($284.50, never "about $280"); feelings live in the words around the numbers.
- Warnings name the duck at stake, phrased as earning ("ease off to earn July's duck"). Errors never mention ducks; the game never blames the user for technical failures.
- Destructive actions act immediately and offer Undo via Snackbar. No confirm dialogs.
- Honesty is a theme: flows over-explain their mechanics ("every dollar is accounted for; nothing is ever invented or lost"), and F10 makes that verifiable.
- Write 6 to 8 variants of each celebration string now; they repeat within three months otherwise.

## 5. Design tokens

From `designs/_ds/tokens/` (mirrors `src/theme/tokens.ts`):

- **Base**: bg `#060707`, surface `#131917`, surface-deep `#0C100F`, border `#2E3833`, hairline `#1C2422`
- **Text**: `#EAF2EE`, secondary `#C9D6D0`, muted `#7C8A84`
- **Semantic**: accent/mint `#46E0B4`, warn/amber `#F2B84B`, danger/coral `#E0645C`, spend-fill `#2E7D68`
- **Pond**: edge `#17454E`, deep `#0C262D`
- **Category**: violet `#9D6FE0` (Fixed), amber `#BA8329` (Food), mint `#2FA383` (Savings), blue `#5B82D9` (Transit), pink `#C75E86` (Fun)
- **Type**: Space Grotesk (UI) + Space Mono (money, labels; tabular numerals mandatory). Hero 56/800, title 24/800, KPI 20/700 (new), body 14/600, caption 12/500 (raised), label 11/700 tracked uppercase. NOTE: the font pairing is a design-system substitution; the RN app currently uses the system font. [RATIFIED 2026-07-11: adopt Space Grotesk + Space Mono in the app.]
- **Spacing**: 4 / 8 / 16 / 24 / 32 only. No 6, 12, or 20 anywhere.
- **Pixel constants**: 0 radius, 4px PixelBox notch, 3px hard shadow, stepped motion, duck idle period 1150ms.
- **Mallard palette**: section 2.1 above.

## 6. Assets

- `assets/mallard-reference.png`: the pixel mallard reference (user-supplied). [Not vendored into this repo copy; the sprite grids in the sprite sheet are canonical.]
- The mallard sprite grids: embedded as string arrays in `Mallard Sprite Sheet.dc.html` (search for `BODY`, `STAND`, `PREEN_TURN`, etc.). Lift these verbatim into `sprites.ts`.
- Still no logo/app icon. The mallard sprite is the sanctioned starting point for one; store assets remain a flagged open item.

## 7. Files

```
design/handoff_v3/            (this repo copy of design_handoff_ducks_v3/)
  README.md                              this file
  Design System Review.dc.html           the review: findings F1-F12 + roadmap
  Pattern Mockups.dc.html                all pattern mockups (primary visual reference)
  Mallard Sprite Sheet.dc.html           mallard frames, palette, timing
  tokens/                                design tokens (css), mirrors src/theme/tokens.ts
```
