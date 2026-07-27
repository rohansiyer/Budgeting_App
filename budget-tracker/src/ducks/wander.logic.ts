/**
 * Team 4 (Pond) — deterministic pond wander logic (handoff v3 §2.2).
 *
 * Pure state/reducer for the Pond scene's ambient duck movement. Every duck
 * is either:
 *   - a SHORE walker: fixed at its own radius in the shore band (just
 *     outside the water), stepping its angle around that band and flipping
 *     to face its direction of travel. Uses land poses (idle / preen).
 *   - a FLOATER: drifting inside the water disc in small discrete steps,
 *     bouncing off the disc edge. Uses the legless float pose.
 *
 * Determinism (no Math.random anywhere in this module): every per-tick
 * decision is derived from an FNV-1a hash of the duck's own id plus the tick
 * index (plus a purpose-specific salt), so `initWander(ids)` followed by
 * replaying `step` from tick 0 always produces the exact same trajectory for
 * the same ids — required so tests (and any future replay/debug tooling)
 * are reproducible.
 *
 * PondView owns the setInterval that advances `tickIndex` (~400ms/tick) and
 * decides px placement from the normalized offsets this module returns; it
 * also decides when to pass `reducedMotion: true` (freezes the whole scene).
 */

/** Fraction of the component's half-size (R) the floaters roam inside. */
export const FLOATER_MAX_R = 0.6;
/** Fraction of R the shore band's inner edge sits at (just outside the water). */
export const SHORE_MIN_R = 0.74;
/** Fraction of R the shore band's outer edge sits at. */
export const SHORE_MAX_R = 0.92;

/** Nominal wander tick cadence in ms (PondView's setInterval period). */
export const TICK_MS = 400;

/** Ticks between preen window checks: 20..50 ticks ~= 8..20s at TICK_MS. */
const PREEN_PERIOD_MIN = 20;
const PREEN_PERIOD_SPAN = 31; // period in [20, 50]
/** How many ticks a preen window stays open once it opens for a duck. */
const PREEN_WINDOW_TICKS = 7;

export type DuckAnimation = 'idle' | 'float' | 'preen';

interface BaseDuckState {
  readonly id: string;
  /** Unit-disk offset, fraction of R, ready for PondView to multiply by R. */
  readonly ox: number;
  readonly oy: number;
  /** Sprite should be flipped from its base rightward-facing art. */
  readonly flip: boolean;
  readonly animation: DuckAnimation;
}

export interface ShoreDuckState extends BaseDuckState {
  readonly role: 'shore';
  readonly animation: 'idle' | 'preen';
  /** Current angle around the shore band, radians, wrapped to [0, 2*PI). */
  readonly angle: number;
  /** This duck's fixed radius within the shore band, fraction of R. */
  readonly radius: number;
  /** Travel direction: +1 increases angle, -1 decreases it. */
  readonly direction: 1 | -1;
}

export interface FloaterDuckState extends BaseDuckState {
  readonly role: 'floater';
  readonly animation: 'float';
  readonly vx: number;
  readonly vy: number;
}

export type WanderDuckState = ShoreDuckState | FloaterDuckState;

export interface WanderState {
  readonly ducks: readonly WanderDuckState[];
}

export interface StepOptions {
  /** When true, step() is a no-op (returns the same state) — freezes the scene. */
  readonly reducedMotion?: boolean;
}

// --- deterministic hashing ---------------------------------------------------

/** FNV-1a 32-bit hash, pure and stable across platforms (no Math.random). */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** [0, 1) pseudo-random derived from a hash, deterministic given its inputs. */
function unit(input: string): number {
  return hash32(input) / 0x100000000;
}

function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  const r = a % twoPi;
  return r < 0 ? r + twoPi : r;
}

// --- init ---------------------------------------------------------------

function initShoreDuck(id: string): ShoreDuckState {
  const angle = unit(`${id}:init-angle`) * Math.PI * 2;
  const radius = SHORE_MIN_R + unit(`${id}:init-radius`) * (SHORE_MAX_R - SHORE_MIN_R);
  const direction: 1 | -1 = unit(`${id}:init-dir`) < 0.5 ? 1 : -1;
  return {
    id,
    role: 'shore',
    angle,
    radius,
    direction,
    ox: Math.cos(angle) * radius,
    oy: Math.sin(angle) * radius,
    flip: direction === 1,
    animation: 'idle',
  };
}

function initFloaterDuck(id: string): FloaterDuckState {
  const angle = unit(`${id}:init-angle`) * Math.PI * 2;
  const radius = unit(`${id}:init-radius`) * FLOATER_MAX_R * 0.85;
  const driftAngle = unit(`${id}:init-drift-angle`) * Math.PI * 2;
  const speed = 0.01 + unit(`${id}:init-drift-speed`) * 0.02; // small, ~2-4px worth at typical sizes
  return {
    id,
    role: 'floater',
    ox: Math.cos(angle) * radius,
    oy: Math.sin(angle) * radius,
    vx: Math.cos(driftAngle) * speed,
    vy: Math.sin(driftAngle) * speed,
    flip: Math.cos(driftAngle) > 0,
    animation: 'float',
  };
}

/**
 * Build the initial wander state for a flock. Role is deterministic by duck
 * id (~40% floaters, the rest shore) — reordering `duckIds` does not change
 * any individual duck's assigned role or trajectory.
 */
export function initWander(duckIds: readonly string[]): WanderState {
  const ducks = duckIds.map((id) => {
    const isFloater = unit(`${id}:role`) < 0.4;
    return isFloater ? initFloaterDuck(id) : initShoreDuck(id);
  });
  return { ducks };
}

// --- preen scheduling -----------------------------------------------------

function isPreenWindowOpen(id: string, tickIndex: number): boolean {
  const period = PREEN_PERIOD_MIN + (hash32(`${id}:preen-period`) % PREEN_PERIOD_SPAN);
  const phase = hash32(`${id}:preen-phase`) % period;
  const pos = ((tickIndex - phase) % period) + period; // avoid negative modulo
  return (pos % period) < PREEN_WINDOW_TICKS;
}

/** At most one shore duck may preen at any tick; ties break on a stable hash. */
function choosePreener(ducks: readonly WanderDuckState[], tickIndex: number): string | null {
  let winnerId: string | null = null;
  let winnerScore = Infinity;
  for (const duck of ducks) {
    if (duck.role !== 'shore') continue;
    if (!isPreenWindowOpen(duck.id, tickIndex)) continue;
    const score = hash32(`${duck.id}:preen-tiebreak`);
    if (score < winnerScore) {
      winnerScore = score;
      winnerId = duck.id;
    }
  }
  return winnerId;
}

// --- per-duck step --------------------------------------------------------

function stepShoreDuck(duck: ShoreDuckState, tickIndex: number, preenerId: string | null): ShoreDuckState {
  if (duck.id === preenerId) {
    return { ...duck, animation: 'preen' };
  }

  const flipRoll = unit(`${duck.id}:dir-flip:${tickIndex}`);
  const direction: 1 | -1 = flipRoll < 1 / 45 ? (duck.direction === 1 ? -1 : 1) : duck.direction;

  const stepRoll = unit(`${duck.id}:angle-step:${tickIndex}`);
  const stepSize = 0.01 + stepRoll * 0.02; // radians per tick
  const angle = wrapAngle(duck.angle + direction * stepSize);

  const ox = Math.cos(angle) * duck.radius;
  const oy = Math.sin(angle) * duck.radius;
  const dx = ox - duck.ox;
  // Ambiguous ~zero horizontal movement (near top/bottom of the band): keep
  // the previous facing rather than flapping the sprite back and forth.
  const flip = Math.abs(dx) < 1e-9 ? duck.flip : dx > 0;

  return {
    ...duck,
    angle,
    direction,
    ox,
    oy,
    flip,
    animation: 'idle',
  };
}

function stepFloaterDuck(duck: FloaterDuckState, tickIndex: number): FloaterDuckState {
  const changeRoll = unit(`${duck.id}:drift-change:${tickIndex}`);
  let vx = duck.vx;
  let vy = duck.vy;
  if (changeRoll < 1 / 12) {
    const driftAngle = unit(`${duck.id}:drift-angle:${tickIndex}`) * Math.PI * 2;
    const speed = 0.01 + unit(`${duck.id}:drift-speed:${tickIndex}`) * 0.02;
    vx = Math.cos(driftAngle) * speed;
    vy = Math.sin(driftAngle) * speed;
  }

  let ox = duck.ox + vx;
  let oy = duck.oy + vy;

  const dist = Math.sqrt(ox * ox + oy * oy);
  const bound = FLOATER_MAX_R * 0.92;
  if (dist > bound && dist > 0) {
    const nx = ox / dist;
    const ny = oy / dist;
    const dot = vx * nx + vy * ny;
    vx = vx - 2 * dot * nx;
    vy = vy - 2 * dot * ny;
    ox = nx * bound;
    oy = ny * bound;
  }

  const flip = Math.abs(vx) < 1e-9 ? duck.flip : vx > 0;

  return { ...duck, ox, oy, vx, vy, flip, animation: 'float' };
}

/**
 * Advance the wander scene by one tick. Pure: same (state, tickIndex) always
 * yields the same result. `reducedMotion: true` freezes the scene (returns
 * `state` unchanged) — callers should still keep tickIndex advancing so the
 * scene resumes correctly if reduced motion is later disabled.
 */
export function step(state: WanderState, tickIndex: number, opts: StepOptions = {}): WanderState {
  if (opts.reducedMotion) return state;

  const preenerId = choosePreener(state.ducks, tickIndex);
  const ducks = state.ducks.map((duck) =>
    duck.role === 'floater' ? stepFloaterDuck(duck, tickIndex) : stepShoreDuck(duck, tickIndex, preenerId),
  );
  return { ducks };
}
