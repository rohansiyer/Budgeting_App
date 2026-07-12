/**
 * Team 4 (Pond) — pixel sprite data module.
 *
 * The mallard sprite is a 16-wide x 14-tall character grid (v0.3; was 14x12,
 * yellow rubber-duck). '.' is an empty (transparent) cell; every other char
 * maps to a palette hex in COLORS. The bottom two rows are reserved for legs
 * on land poses; swim poses sink the body and replace those rows with a
 * rippling waterline. Accessory overlays (bowtie / monocle / top hat) are
 * cell patches applied on top of the base by tier. Animation frame tables
 * describe stepped, pixel-true motion (no interpolation) — a renderer draws
 * one frame at a time.
 *
 * Grids in this file are lifted verbatim from `Mallard Sprite Sheet.dc.html`
 * (design/handoff_v3), including the `swim()` builder, so the shipped sprite
 * matches the design reference exactly.
 *
 * NOTE: the hex values here are SPRITE DATA (an asset palette), not UI theme
 * colors — this is the one place raw hex is intentional (per CONTRACTS.md §6:
 * "sprite palette lives in sprites.ts as sprite data, that's fine").
 */

export const SPRITE_W = 16;
export const SPRITE_H = 14;

/**
 * Palette: single-char key -> hex. '.' means empty/transparent (no entry).
 * Mallard body hues (G/K/O/C/B/W/R/D/L) plus the swim-water ripple pair
 * (A/a) are the v0.3 palette from the design handoff. H/N/T/J/I are
 * accessory-only keys (hat, hat band, bowtie, monocle chain, monocle rim) —
 * distinct from the body letters since the old accessory letters (R/B/G/W)
 * now belong to body hues. The v0.2 yellow palette is fully retired.
 */
export const COLORS: Readonly<Record<string, string>> = {
  G: '#4C9C46', // head
  K: '#14181A', // eye
  O: '#E8A93D', // bill
  C: '#F0E9D6', // neck / collar
  B: '#C9BFAE', // body
  W: '#8E8577', // wing
  R: '#8A5638', // breast
  D: '#3F3B33', // tail
  L: '#D97E32', // legs
  A: '#1C4F46', // water (ripple, dark)
  a: '#28695B', // water (ripple, light)
  H: '#39454C', // accessory: hat crown
  N: '#C75E86', // accessory: hat band
  T: '#D9484F', // accessory: bowtie
  J: '#E8C547', // accessory: monocle chain
  I: '#F7F0DC', // accessory: monocle rim / highlight
};

export const EMPTY = '.';

const BLANK = EMPTY.repeat(SPRITE_W);

/** The 16x12 mallard body (head through breast/tail), legs added per-pose. */
const BODY: readonly string[] = [
  '................',
  '....GGGG........',
  '...GGGGGG.......',
  '.OOGGKGGGG......',
  'OOOGGGGGGG......',
  '....GGGGG.......',
  '....CCGGG....D..',
  '...RCCBBBBBBDD..',
  '..RRCBBWWWWBBD..',
  '..RRBBWWWWWWB...',
  '..RRBBWWWWWB....',
  '...RBBBBBBB.....',
];

/** Planted stand: body + both legs down. The rest pose. */
export const STAND: readonly string[] = BODY.concat([
  '.....L....L.....',
  '....LL...LL.....',
]);

/** Idle bob: body dropped one row, legs compressed. */
export const BOB: readonly string[] = [BLANK].concat(BODY, ['....LL...LL.....']);

/** Walk cycle, legs astride. */
export const STRIDE: readonly string[] = [BLANK].concat(BODY, ['...LL......LL...']);

/** Walk cycle, legs passing (mirror phase of STRIDE). */
export const STRIDE2: readonly string[] = [BLANK].concat(BODY, ['.....LL..LL.....']);

/** Preen step 1: head turning back toward the wing. */
export const PREEN_TURN: readonly string[] = [
  BLANK,
  BLANK,
  '....GGGG........',
  '...GGGGGGK......',
  '...GGGGGGGO.....',
  '....GGGGGOO.....',
  '....CCGGG....D..',
  '...RCCBBBBBBDD..',
  '..RRCBBWWWWBBD..',
  '..RRBBWWWWWWB...',
  '..RRBBWWWWWB....',
  '...RBBBBBBB.....',
  '.....L....L.....',
  '....LL...LL.....',
];

/** Preen step 2: bill worked into the wing (the long-hold pose). */
export const PREEN_DOWN: readonly string[] = [
  BLANK,
  BLANK,
  BLANK,
  '....GGGG........',
  '...GGGGGG.......',
  '...GGGGGGK......',
  '....CCGGGGO..D..',
  '...RCCBBBBOODD..',
  '..RRCBBWWWWBBD..',
  '..RRBBWWWWWWB...',
  '..RRBBWWWWWB....',
  '...RBBBBBBB.....',
  '.....L....L.....',
  '....LL...LL.....',
];

/**
 * Builds a swim frame: sinks the body `sink` rows down (legs gone), then
 * ripples the bottom two rows into a rolling waterline. `phase` offsets the
 * ripple so consecutive swim frames animate the water. Matches the swim()
 * builder in Mallard Sprite Sheet.dc.html verbatim.
 */
function swim(sink: number, phase: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < sink; i++) rows.push(BLANK);
  for (const r of BODY) rows.push(r);
  while (rows.length < SPRITE_H) rows.push(BLANK);
  const water = (c: number) => ((c + phase) % 4 < 2 ? 'A' : 'a');
  return rows.slice(0, SPRITE_H).map((row, r) => {
    if (r < SPRITE_H - 2) return row;
    let s = '';
    for (let c = 0; c < SPRITE_W; c++) {
      const ch = row[c];
      s += r === SPRITE_H - 1 || ch === EMPTY || ch === undefined ? water(c) : ch;
    }
    return s;
  });
}

/** Swim frame 1: shallow float, waterline ripple phase 0. */
export const SWIM1: readonly string[] = swim(2, 0);
/** Swim frame 2: sinks one row further, waterline ripple phase 2. */
export const SWIM2: readonly string[] = swim(3, 2);

/**
 * Strips a swim frame's waterline rows (the bottom two) to blank, for
 * in-pond rendering where the pond view itself draws the water — the duck
 * contributes only the body, "floating" on whatever the pond paints.
 */
function stripWaterRows(grid: readonly string[]): string[] {
  return grid.slice(0, SPRITE_H - 2).concat([BLANK, BLANK]);
}

/** Float frame 1 (no waterline): pairs with SWIM1's body position. */
export const FLOAT1: readonly string[] = stripWaterRows(SWIM1);
/** Float frame 2 (no waterline): pairs with SWIM2's body position. */
export const FLOAT2: readonly string[] = stripWaterRows(SWIM2);

/** A single sprite pixel: grid cell (row/col) + palette char. */
export interface Cell {
  r: number;
  c: number;
  ch: string;
}

/**
 * Accessory overlays keyed by tier. Tier 0 = none, 1 = bowtie, 2 = monocle,
 * 3 = top hat. Higher tiers are CUMULATIVE (a top-hat duck also wears the
 * monocle and bowtie) — build the render map by stacking 1..tier. Coordinates
 * are re-anchored onto the 16x14 mallard body: the eye sits at (3, 5), the
 * neck/collar at rows 6-7, the head crown at rows 0-2.
 */
export const OVERLAYS: Readonly<Record<1 | 2 | 3, readonly Cell[]>> = {
  // 1 — bowtie (worn at the neck, just under the collar)
  1: [
    { r: 7, c: 5, ch: 'T' },
    { r: 7, c: 6, ch: 'I' },
    { r: 7, c: 7, ch: 'T' },
  ],
  // 2 — monocle (rim around the eye) + chain (trailing to the breast)
  2: [
    { r: 2, c: 5, ch: 'I' },
    { r: 3, c: 4, ch: 'I' },
    { r: 3, c: 6, ch: 'I' },
    { r: 4, c: 5, ch: 'I' },
    { r: 5, c: 6, ch: 'J' },
    { r: 6, c: 7, ch: 'J' },
  ],
  // 3 — top hat (crown + band + brim)
  3: [
    { r: 0, c: 4, ch: 'H' },
    { r: 0, c: 5, ch: 'H' },
    { r: 0, c: 6, ch: 'H' },
    { r: 0, c: 7, ch: 'H' },
    { r: 1, c: 4, ch: 'H' },
    { r: 1, c: 5, ch: 'N' },
    { r: 1, c: 6, ch: 'N' },
    { r: 1, c: 7, ch: 'H' },
    { r: 2, c: 3, ch: 'H' },
    { r: 2, c: 4, ch: 'H' },
    { r: 2, c: 5, ch: 'H' },
    { r: 2, c: 6, ch: 'H' },
    { r: 2, c: 7, ch: 'H' },
    { r: 2, c: 8, ch: 'H' },
  ],
};

/**
 * A frame is a full 16x14 char grid (already includes any per-frame offset).
 * `flipX` asks the renderer to mirror the frame horizontally (used for
 * walk-off). `hold` is an optional multiplier (in base frame ticks) for
 * pauses; `durationMs` is an optional explicit override (used where the
 * timing doesn't fit the fps/bob-period schemes, e.g. preen's uneven holds).
 */
export interface Frame {
  grid: readonly string[];
  flipX?: boolean;
  /** Optional hold multiplier (in base frame ticks) for pauses. Default 1. */
  hold?: number;
  /** Optional explicit duration override in ms; wins over `hold` when set. */
  durationMs?: number;
}

/** Shift every row of a grid down by `dy` rows (empty fill), keeping height. */
function shiftDown(grid: readonly string[], dy: number): string[] {
  if (dy <= 0) return grid.slice();
  const out = Array.from({ length: dy }, () => BLANK).concat(grid.slice(0, SPRITE_H - dy));
  return out.slice(0, SPRITE_H);
}

/** Shift every row horizontally by `dx` (negative = left), empty fill. */
function shiftRight(grid: readonly string[], dx: number): string[] {
  if (dx === 0) return grid.slice();
  return grid.map((row) => {
    if (dx > 0) return (EMPTY.repeat(dx) + row).slice(0, SPRITE_W);
    const cut = row.slice(-dx);
    return (cut + EMPTY.repeat(-dx)).slice(0, SPRITE_W);
  });
}

// --- Animation frame tables --------------------------------------------------

/** 2-frame idle bob: stand, then dip one row down. Loops forever. */
export const IDLE: readonly Frame[] = [{ grid: STAND }, { grid: BOB }];

/**
 * Waddle-in: enters from the left with a 2px shift per frame (plant / astride
 * / plant / pass), settling at rest on the last frame. Plays once; the caller
 * switches to 'idle' on completion.
 */
export const WADDLE_IN: readonly Frame[] = [
  { grid: shiftRight(STAND, -6) },
  { grid: shiftRight(STRIDE, -4) },
  { grid: shiftRight(STAND, -2) },
  { grid: shiftRight(STRIDE2, 0) },
];

/**
 * Walk-off: the same plant/astride/plant/pass cycle, flipped horizontally,
 * shifting right off the edge, then two hold frames at the edge before the
 * caller removes the duck (matches the v0.2 walk-off table's structure).
 */
export const WALK_OFF: readonly Frame[] = [
  { grid: shiftRight(STAND, 2), flipX: true },
  { grid: shiftRight(STRIDE, 4), flipX: true },
  { grid: shiftRight(STAND, 6), flipX: true },
  { grid: shiftRight(STRIDE2, 8), flipX: true },
  { grid: shiftRight(STRIDE2, 8), flipX: true, hold: 2 }, // hold at the edge
  { grid: shiftRight(STRIDE2, 8), flipX: true, hold: 2 }, // hold at the edge
];

/** Happy dance: exuberant side-to-side hop (used for gains / big wins). */
export const HAPPY_DANCE: readonly Frame[] = [
  { grid: STAND },
  { grid: shiftRight(shiftDown(STAND, 1), -1) },
  { grid: shiftDown(STAND, 1) },
  { grid: shiftRight(shiftDown(STAND, 1), 1) },
  { grid: STAND },
];

/** Swim: 2-frame ripple loop, no legs, body sunk below the waterline. */
export const SWIM: readonly Frame[] = [
  { grid: SWIM1, durationMs: 500 },
  { grid: SWIM2, durationMs: 500 },
];

/**
 * Float: the swim body with the waterline rows blanked out, for in-pond
 * rendering where the pond draws the water. Same cadence as swim.
 */
export const FLOAT: readonly Frame[] = [
  { grid: FLOAT1, durationMs: 500 },
  { grid: FLOAT2, durationMs: 500 },
];

/**
 * Preen: one-shot idle variant. Stand (long hold) -> turn -> bill in wing
 * (longest hold) -> turn back -> ends, settling back to idle. Fired at
 * random on at most one duck at a time in the Pond (Pond's concern, not
 * this module's).
 */
export const PREEN: readonly Frame[] = [
  { grid: STAND, durationMs: 900 },
  { grid: PREEN_TURN, durationMs: 350 },
  { grid: PREEN_DOWN, durationMs: 1200 },
  { grid: PREEN_TURN, durationMs: 350 },
];

export type AnimationName =
  | 'idle'
  | 'waddle-in'
  | 'walk-off'
  | 'happy-dance'
  | 'swim'
  | 'float'
  | 'preen';

export const FRAMES: Readonly<Record<AnimationName, readonly Frame[]>> = {
  idle: IDLE,
  'waddle-in': WADDLE_IN,
  'walk-off': WALK_OFF,
  'happy-dance': HAPPY_DANCE,
  swim: SWIM,
  float: FLOAT,
  preen: PREEN,
};

/**
 * Resolve the full cell list for a given frame grid + accessory tier: base
 * pixels plus every overlay 1..tier, later overlays winning on cell conflicts.
 * Returns only non-empty cells, ready to map to <Rect> elements.
 */
export function resolveCells(grid: readonly string[], accessoryTier: 0 | 1 | 2 | 3): Cell[] {
  const map = new Map<string, Cell>(); // key `${r}:${c}`
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== EMPTY) map.set(`${r}:${c}`, { r, c, ch });
    }
  });
  for (let tier = 1 as 1 | 2 | 3; tier <= accessoryTier; tier++) {
    for (const cell of OVERLAYS[tier as 1 | 2 | 3]) {
      map.set(`${cell.r}:${cell.c}`, cell);
    }
  }
  return Array.from(map.values());
}
