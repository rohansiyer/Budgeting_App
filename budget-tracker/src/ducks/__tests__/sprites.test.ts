import {
  COLORS,
  EMPTY,
  FLOAT,
  FLOAT1,
  FLOAT2,
  FRAMES,
  OVERLAYS,
  PREEN,
  resolveCells,
  SPRITE_H,
  SPRITE_W,
  STAND,
  SWIM,
  WALK_OFF,
  type AnimationName,
} from '../sprites';

/** Every char referenced across every animation's grids resolves in COLORS. */
function charsUsedIn(grid: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const row of grid) {
    for (const ch of row) {
      if (ch !== EMPTY) set.add(ch);
    }
  }
  return set;
}

describe('sprite grid dimensions', () => {
  it('is 16 wide by 14 tall', () => {
    expect(SPRITE_W).toBe(16);
    expect(SPRITE_H).toBe(14);
  });

  it('every frame in every animation is exactly SPRITE_H rows of SPRITE_W chars', () => {
    for (const [name, frames] of Object.entries(FRAMES)) {
      frames.forEach((frame, i) => {
        expect(frame.grid.length).toBe(SPRITE_H);
        frame.grid.forEach((row, r) => {
          expect(row.length).toBe(SPRITE_W);
          // sanity: fail loudly with location, not just a length mismatch
          if (row.length !== SPRITE_W) {
            throw new Error(`${name} frame ${i} row ${r} has length ${row.length}: "${row}"`);
          }
        });
      });
    }
  });
});

describe('palette completeness', () => {
  it('every non-empty char in every animation grid has a COLORS entry', () => {
    const missing = new Set<string>();
    for (const frames of Object.values(FRAMES)) {
      for (const frame of frames) {
        for (const ch of charsUsedIn(frame.grid)) {
          if (!(ch in COLORS)) missing.add(ch);
        }
      }
    }
    expect(Array.from(missing)).toEqual([]);
  });

  it('every char in every accessory overlay has a COLORS entry', () => {
    const missing = new Set<string>();
    for (const cells of Object.values(OVERLAYS)) {
      for (const cell of cells) {
        if (!(cell.ch in COLORS)) missing.add(cell.ch);
      }
    }
    expect(Array.from(missing)).toEqual([]);
  });

  it('retires the v0.2 yellow duck body color', () => {
    expect(Object.values(COLORS)).not.toContain('#EFC94C');
  });
});

describe('AnimationName / FRAMES coverage', () => {
  const expected: AnimationName[] = [
    'idle',
    'waddle-in',
    'walk-off',
    'happy-dance',
    'swim',
    'float',
    'preen',
  ];

  it('FRAMES has a non-empty table for every AnimationName', () => {
    for (const name of expected) {
      expect(FRAMES[name]).toBeDefined();
      expect(FRAMES[name].length).toBeGreaterThan(0);
    }
  });
});

describe('preen timing', () => {
  it('has the four-step uneven hold sequence: 900 / 350 / 1200 / 350', () => {
    expect(PREEN.map((f) => f.durationMs)).toEqual([900, 350, 1200, 350]);
  });

  it('is not a looping animation (plays once)', () => {
    // preen must not be idle/swim/float — those loop; this settles back to idle.
    expect(PREEN).not.toBe(FRAMES.idle);
    expect(PREEN.length).toBe(4);
  });
});

describe('swim timing', () => {
  it('is two 500ms frames', () => {
    expect(SWIM.map((f) => f.durationMs)).toEqual([500, 500]);
  });
});

describe('float frames', () => {
  it('contain no water ripple characters (A/a)', () => {
    for (const grid of [FLOAT1, FLOAT2]) {
      const chars = charsUsedIn(grid);
      expect(chars.has('A')).toBe(false);
      expect(chars.has('a')).toBe(false);
    }
  });

  it('blanks exactly the bottom two rows relative to the matching swim frame', () => {
    expect(FLOAT1[SPRITE_H - 2]).toBe(EMPTY.repeat(SPRITE_W));
    expect(FLOAT1[SPRITE_H - 1]).toBe(EMPTY.repeat(SPRITE_W));
    expect(FLOAT2[SPRITE_H - 2]).toBe(EMPTY.repeat(SPRITE_W));
    expect(FLOAT2[SPRITE_H - 1]).toBe(EMPTY.repeat(SPRITE_W));
  });

  it('float timing matches swim (500ms per frame)', () => {
    expect(FLOAT.map((f) => f.durationMs)).toEqual([500, 500]);
  });
});

describe('walk-off flip parity', () => {
  it('every walk-off frame is flipped horizontally', () => {
    expect(WALK_OFF.length).toBeGreaterThan(0);
    for (const frame of WALK_OFF) {
      expect(frame.flipX).toBe(true);
    }
  });

  it('holds at the edge for the final two frames', () => {
    const last = WALK_OFF[WALK_OFF.length - 1];
    const secondLast = WALK_OFF[WALK_OFF.length - 2];
    expect(last.hold).toBeGreaterThanOrEqual(2);
    expect(secondLast.hold).toBeGreaterThanOrEqual(2);
    // both hold frames sit at the same (edge) grid position
    expect(last.grid).toEqual(secondLast.grid);
  });
});

describe('waddle-in / walk-off frame count parity', () => {
  it('waddle-in and walk-off cover the same 4-pose cycle length', () => {
    // walk-off = 4-pose cycle + 2 extra hold frames at the edge
    expect(FRAMES['waddle-in'].length).toBe(4);
    expect(WALK_OFF.length).toBe(FRAMES['waddle-in'].length + 2);
  });
});

describe('accessory overlays', () => {
  it('resolves cumulatively: tier 3 includes tier 1 and tier 2 cells', () => {
    const tier1Cells = resolveCells(STAND, 1);
    const tier3Cells = resolveCells(STAND, 3);
    const tier3Keys = new Set(tier3Cells.map((c) => `${c.r}:${c.c}`));
    for (const cell of tier1Cells) {
      expect(tier3Keys.has(`${cell.r}:${cell.c}`)).toBe(true);
    }
    // tier 3 (hat) must add strictly more cells than tier 1 (bowtie only).
    expect(tier3Cells.length).toBeGreaterThan(tier1Cells.length);
  });

  it('tier 0 renders no overlay cells beyond the base grid', () => {
    const baseCount = resolveCells(STAND, 0).length;
    const bodyCellCount = STAND.reduce(
      (sum, row) => sum + Array.from(row).filter((ch) => ch !== EMPTY).length,
      0,
    );
    expect(baseCount).toBe(bodyCellCount);
  });

  it('every overlay coordinate is within the 16x14 grid', () => {
    for (const cells of Object.values(OVERLAYS)) {
      for (const cell of cells) {
        expect(cell.r).toBeGreaterThanOrEqual(0);
        expect(cell.r).toBeLessThan(SPRITE_H);
        expect(cell.c).toBeGreaterThanOrEqual(0);
        expect(cell.c).toBeLessThan(SPRITE_W);
      }
    }
  });
});
