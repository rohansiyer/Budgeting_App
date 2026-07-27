/**
 * Team 4 (Pond) — wander.logic tests (handoff v3 §2.2).
 *
 * Covers: positions stay in-band/in-disc, shore flip tracks movement sign,
 * at most one preening duck at any tick, determinism from duck-id seeding,
 * and reduced-motion freezing the scene.
 */

import {
  FLOATER_MAX_R,
  SHORE_MIN_R,
  SHORE_MAX_R,
  initWander,
  step,
  type WanderState,
} from '../wander.logic';

const IDS = ['duck-a', 'duck-b', 'duck-c', 'duck-d', 'duck-e', 'duck-f', 'duck-g', 'duck-h'];
const TICKS = 500;

function runTrajectory(ids: readonly string[], ticks: number): WanderState[] {
  const states: WanderState[] = [];
  let state = initWander(ids);
  states.push(state);
  for (let t = 0; t < ticks; t++) {
    state = step(state, t);
    states.push(state);
  }
  return states;
}

describe('wander.logic', () => {
  test('floaters stay inside the water disc and shore ducks stay in the shore band for 500 ticks', () => {
    const states = runTrajectory(IDS, TICKS);
    const floaterBound = FLOATER_MAX_R * 0.92 + 1e-6;

    for (const state of states) {
      for (const duck of state.ducks) {
        if (duck.role === 'floater') {
          const dist = Math.sqrt(duck.ox * duck.ox + duck.oy * duck.oy);
          expect(dist).toBeLessThanOrEqual(floaterBound);
        } else {
          const dist = Math.sqrt(duck.ox * duck.ox + duck.oy * duck.oy);
          expect(dist).toBeGreaterThanOrEqual(SHORE_MIN_R - 1e-6);
          expect(dist).toBeLessThanOrEqual(SHORE_MAX_R + 1e-6);
        }
      }
    }
  });

  test('shore duck facing flip matches the sign of its actual horizontal movement', () => {
    let state = initWander(IDS);
    for (let t = 0; t < TICKS; t++) {
      const next = step(state, t);
      for (const duck of next.ducks) {
        if (duck.role !== 'shore') continue;
        const prev = state.ducks.find((d) => d.id === duck.id);
        if (!prev) continue;
        const dx = duck.ox - prev.ox;
        if (Math.abs(dx) > 1e-9) {
          expect(duck.flip).toBe(dx > 0);
        }
      }
      state = next;
    }
  });

  test('at most one duck preens at any given tick, and only shore ducks preen', () => {
    const states = runTrajectory(IDS, TICKS);
    let sawAtLeastOnePreen = false;
    for (const state of states) {
      const preening = state.ducks.filter((d) => d.animation === 'preen');
      expect(preening.length).toBeLessThanOrEqual(1);
      if (preening.length === 1) {
        sawAtLeastOnePreen = true;
        expect(preening[0].role).toBe('shore');
      }
    }
    // Sanity: with 500 ticks and multiple shore ducks, preening should fire
    // at least once, otherwise the window logic above would be untested.
    expect(sawAtLeastOnePreen).toBe(true);
  });

  test('determinism: the same duck ids replayed from tick 0 produce identical trajectories', () => {
    const runA = runTrajectory(IDS, TICKS);
    const runB = runTrajectory(IDS, TICKS);
    expect(runA).toEqual(runB);
  });

  test('determinism: a fresh init + independent step-by-step replay matches a batch replay', () => {
    let stepped = initWander(IDS);
    const collected: WanderState[] = [stepped];
    for (let t = 0; t < TICKS; t++) {
      stepped = step(stepped, t);
      collected.push(stepped);
    }
    const batch = runTrajectory(IDS, TICKS);
    expect(collected).toEqual(batch);
  });

  test('reduced motion freezes the scene: step is a no-op across many ticks', () => {
    const initial = initWander(IDS);
    let state = initial;
    for (let t = 0; t < TICKS; t++) {
      state = step(state, t, { reducedMotion: true });
    }
    expect(state).toEqual(initial);
    expect(state).toBe(initial);
  });

  test('role assignment is deterministic by duck id (rerunning init yields the same roles)', () => {
    const first = initWander(IDS);
    const second = initWander(IDS);
    expect(first.ducks.map((d) => d.role)).toEqual(second.ducks.map((d) => d.role));
  });

  test('roughly 40% of a larger flock is assigned floater, deterministically', () => {
    const manyIds = Array.from({ length: 200 }, (_, i) => `flock-duck-${i}`);
    const state = initWander(manyIds);
    const floaterCount = state.ducks.filter((d) => d.role === 'floater').length;
    // Not an exact 40% (hash-based), but should be in a sane band around it.
    expect(floaterCount).toBeGreaterThan(50);
    expect(floaterCount).toBeLessThan(110);
  });
});
