/**
 * Team 4 (Pond) — pixel sprite data module.
 *
 * The placeholder rubber-duck sprite is a 14-wide × 12-tall character grid.
 * '.' is an empty (transparent) cell; every other char maps to a palette hex
 * in COLORS. Accessory overlays (bowtie / monocle / top hat) are cell patches
 * applied on top of the base by tier. Animation frame tables describe stepped,
 * pixel-true motion (no interpolation) — a renderer draws one frame at a time.
 *
 * Custom sprite sheets can replace COLORS + BASE + overlays later without
 * touching the engine or the renderer.
 *
 * NOTE: the hex values here are SPRITE DATA (an asset palette), not UI theme
 * colors — this is the one place raw hex is intentional (per CONTRACTS.md §6:
 * "sprite palette lives in sprites.ts as sprite data, that's fine").
 */

export const SPRITE_W = 14;
export const SPRITE_H = 12;

/** Palette: single-char key → hex. '.' means empty/transparent (no entry). */
export const COLORS: Readonly<Record<string, string>> = {
  Y: '#EFC94C', // body
  D: '#C9A63B', // shade
  K: '#14181A', // eye
  O: '#E07A3F', // beak
  H: '#39454C', // hat
  B: '#C75E86', // band
  R: '#D9484F', // bowtie
  G: '#E8C547', // chain
  W: '#F7F0DC', // highlight
};

export const EMPTY = '.';

/** The 14×12 base rubber-duck map (rows top→bottom). */
export const BASE: readonly string[] = [
  '..............',
  '..............',
  '....YYYY......',
  '....YYYKY.....',
  '....YYYYYOO...',
  '....YYYYYO....',
  'Y....YYY......',
  'YY..YYYYYYYY..',
  '.YYYYYYYYYYYY.',
  '.YYYYYDDYYYYY.',
  '..DDDDDDDDDD..',
  '..............',
];

/** A single sprite pixel: grid cell (row/col) + palette char. */
export interface Cell {
  r: number;
  c: number;
  ch: string;
}

/**
 * Accessory overlays keyed by tier. Tier 0 = none, 1 = bowtie, 2 = monocle,
 * 3 = top hat. Higher tiers are CUMULATIVE (a top-hat duck also wears the
 * monocle and bowtie) — build the render map by stacking 1..tier.
 */
export const OVERLAYS: Readonly<Record<1 | 2 | 3, readonly Cell[]>> = {
  // 1 — bowtie (worn at the neck)
  1: [
    { r: 7, c: 7, ch: 'R' },
    { r: 7, c: 8, ch: 'W' },
    { r: 7, c: 9, ch: 'R' },
  ],
  // 2 — monocle (rim around the eye + chain)
  2: [
    { r: 2, c: 7, ch: 'W' },
    { r: 3, c: 6, ch: 'W' },
    { r: 3, c: 8, ch: 'W' },
    { r: 4, c: 7, ch: 'W' },
    { r: 5, c: 8, ch: 'G' },
    { r: 6, c: 9, ch: 'G' },
  ],
  // 3 — top hat (crown + band)
  3: [
    { r: 0, c: 4, ch: 'H' },
    { r: 0, c: 5, ch: 'H' },
    { r: 0, c: 6, ch: 'H' },
    { r: 0, c: 7, ch: 'H' },
    { r: 1, c: 4, ch: 'H' },
    { r: 1, c: 5, ch: 'B' },
    { r: 1, c: 6, ch: 'B' },
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
 * A frame is a full 14×12 char grid (already includes any per-frame offset).
 * `flipX` asks the renderer to mirror the frame horizontally (used for the
 * walk-off look-back). Building whole grids keeps rendering trivial and
 * pixel-true.
 */
export interface Frame {
  grid: readonly string[];
  flipX?: boolean;
  /** Optional hold multiplier (in base frame ticks) for pauses. Default 1. */
  hold?: number;
}

/** Shift every row of a grid down by `dy` rows (empty fill), keeping height. */
function shiftDown(grid: readonly string[], dy: number): string[] {
  if (dy <= 0) return grid.slice();
  const blank = EMPTY.repeat(SPRITE_W);
  const out = Array.from({ length: dy }, () => blank).concat(grid.slice(0, SPRITE_H - dy));
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

/** 2-frame idle bob: rest, then dip 1px down and back. */
export const IDLE: readonly Frame[] = [
  { grid: BASE },
  { grid: shiftDown(BASE, 1) },
];

/** Waddle-in: enter from the left, rocking as it settles at center. */
export const WADDLE_IN: readonly Frame[] = [
  { grid: shiftRight(BASE, -4) },
  { grid: shiftRight(shiftDown(BASE, 1), -3) },
  { grid: shiftRight(BASE, -2) },
  { grid: shiftRight(shiftDown(BASE, 1), -1) },
  { grid: BASE },
];

/**
 * Walk-off with look-back: waddle right, PAUSE (held frame), turn to look back
 * (single horizontally-flipped frame), then continue off to the right.
 */
export const WALK_OFF: readonly Frame[] = [
  { grid: BASE },
  { grid: shiftRight(shiftDown(BASE, 1), 1) },
  { grid: shiftRight(BASE, 2), hold: 2 }, // pause
  { grid: shiftRight(BASE, 2), flipX: true, hold: 2 }, // look back
  { grid: shiftRight(shiftDown(BASE, 1), 3) },
  { grid: shiftRight(BASE, 5) },
];

/** Happy dance: exuberant side-to-side hop (used for gains / big wins). */
export const HAPPY_DANCE: readonly Frame[] = [
  { grid: BASE },
  { grid: shiftRight(shiftDown(BASE, 1), -1) },
  { grid: shiftDown(BASE, 1) },
  { grid: shiftRight(shiftDown(BASE, 1), 1) },
  { grid: BASE },
];

export type AnimationName = 'idle' | 'waddle-in' | 'walk-off' | 'happy-dance';

export const FRAMES: Readonly<Record<AnimationName, readonly Frame[]>> = {
  idle: IDLE,
  'waddle-in': WADDLE_IN,
  'walk-off': WALK_OFF,
  'happy-dance': HAPPY_DANCE,
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
