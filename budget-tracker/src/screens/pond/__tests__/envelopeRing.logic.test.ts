import {
  buildEnvelopeRing,
  DEFAULT_BLOCK_COUNT,
  type RingEnvelopeInput,
} from '../envelopeRing.logic';
import type { CategoryColorKey } from '../../../types/contracts';

const KEYS: CategoryColorKey[] = ['violet', 'amber', 'mint', 'blue', 'pink'];

function env(
  id: string,
  budgetCents: number,
  spentCents = 0,
  colorKey: CategoryColorKey = 'violet',
): RingEnvelopeInput {
  return { categoryId: id, colorKey, budgetCents, spentCents };
}

/** Sum of blocks across all segments. */
function totalBlocks(envelopes: RingEnvelopeInput[], bc = DEFAULT_BLOCK_COUNT): number {
  return buildEnvelopeRing(envelopes, bc).segments.reduce((s, seg) => s + seg.blocks, 0);
}

describe('buildEnvelopeRing — apportionment exactness', () => {
  it('blocks always sum exactly to blockCount (positive budgets present)', () => {
    const cases: RingEnvelopeInput[][] = [
      [env('a', 14000), env('b', 16000), env('c', 10000), env('d', 8000)],
      [env('a', 1), env('b', 1), env('c', 1)],
      [env('a', 100000)],
      [env('a', 333), env('b', 333), env('c', 334)],
      [env('a', 4600), env('b', 100), env('c', 100)], // one giant + two tiny
      KEYS.map((k, i) => env(`e${i}`, (i + 1) * 700, 0, k)),
    ];
    for (const c of cases) {
      expect(totalBlocks(c)).toBe(DEFAULT_BLOCK_COUNT);
    }
  });

  it('honors an arbitrary blockCount', () => {
    const e = [env('a', 3000), env('b', 1000)];
    expect(totalBlocks(e, 12)).toBe(12);
    expect(totalBlocks(e, 100)).toBe(100);
    expect(buildEnvelopeRing(e, 12).degPerBlock).toBe(30);
  });

  it('min-1 rule: every positive-budget envelope gets at least one block', () => {
    // 20 tiny envelopes + one large: each tiny still earns a block.
    const many: RingEnvelopeInput[] = [env('big', 500000)];
    for (let i = 0; i < 20; i++) many.push(env(`t${i}`, 1));
    const model = buildEnvelopeRing(many);
    expect(model.segments).toHaveLength(21);
    for (const seg of model.segments) expect(seg.blocks).toBeGreaterThanOrEqual(1);
    expect(model.segments.reduce((s, x) => s + x.blocks, 0)).toBe(DEFAULT_BLOCK_COUNT);
  });

  it('proportionality within 1 block when every envelope clears 1-block share', () => {
    const es = [env('a', 24000), env('b', 12000), env('c', 8000), env('d', 4000)];
    const total = 48000;
    const model = buildEnvelopeRing(es);
    for (const seg of model.segments) {
      const ideal = (seg.budgetCents * DEFAULT_BLOCK_COUNT) / total;
      expect(Math.abs(seg.blocks - ideal)).toBeLessThan(1);
    }
  });

  it('equal budgets split evenly', () => {
    const es = KEYS.slice(0, 4).map((k, i) => env(`e${i}`, 1000, 0, k));
    const model = buildEnvelopeRing(es);
    expect(model.segments.map((s) => s.blocks)).toEqual([12, 12, 12, 12]);
  });
});

describe('buildEnvelopeRing — degenerate inputs', () => {
  it('empty envelope list yields an empty ring', () => {
    const model = buildEnvelopeRing([]);
    expect(model.blocks).toEqual([]);
    expect(model.segments).toEqual([]);
    expect(model.envelopeCount).toBe(0);
    expect(model.totalBudgetCents).toBe(0);
    expect(model.totalSpentCents).toBe(0);
  });

  it('zero-budget envelopes own no arc but still count toward totals', () => {
    const model = buildEnvelopeRing([env('a', 0, 500), env('b', 1000, 250)]);
    expect(model.envelopeCount).toBe(1);
    expect(model.segments[0].categoryId).toBe('b');
    expect(model.segments[0].blocks).toBe(DEFAULT_BLOCK_COUNT);
    expect(model.totalBudgetCents).toBe(1000);
    expect(model.totalSpentCents).toBe(750);
  });

  it('all-zero budgets yield an empty ring', () => {
    const model = buildEnvelopeRing([env('a', 0), env('b', 0)]);
    expect(model.blocks).toEqual([]);
    expect(model.envelopeCount).toBe(0);
  });

  it('more envelopes than blocks: still sums to blockCount, largest kept', () => {
    const es: RingEnvelopeInput[] = [];
    for (let i = 0; i < 60; i++) es.push(env(`e${String(i).padStart(2, '0')}`, i + 1));
    const model = buildEnvelopeRing(es, DEFAULT_BLOCK_COUNT);
    const sum = model.segments.reduce((s, x) => s + x.blocks, 0);
    expect(sum).toBe(DEFAULT_BLOCK_COUNT);
    // Every rendered block belongs to some kept segment; none exceed 1 here.
    expect(model.blocks).toHaveLength(DEFAULT_BLOCK_COUNT);
  });

  it('rejects a non-positive or non-integer blockCount', () => {
    expect(() => buildEnvelopeRing([env('a', 100)], 0)).toThrow();
    expect(() => buildEnvelopeRing([env('a', 100)], -5)).toThrow();
    expect(() => buildEnvelopeRing([env('a', 100)], 4.5)).toThrow();
  });
});

describe('buildEnvelopeRing — fill math (countable money)', () => {
  it('spent = 0 fills nothing', () => {
    const model = buildEnvelopeRing([env('a', 4800, 0)]);
    expect(model.segments[0].filledBlocks).toBe(0);
    expect(model.blocks.every((b) => !b.filled)).toBe(true);
  });

  it('spent = budget fills every block of the envelope', () => {
    const model = buildEnvelopeRing([env('a', 4800, 4800)]);
    const seg = model.segments[0];
    expect(seg.filledBlocks).toBe(seg.blocks);
    expect(model.blocks.every((b) => b.filled)).toBe(true);
  });

  it('fills on exact block-value boundaries', () => {
    // Single envelope owns all 48 blocks; blockValue = 4800/48 = 100c.
    const model = buildEnvelopeRing([env('a', 4800, 0)]);
    const bv = model.segments[0].blockValueCents;
    expect(bv).toBe(100);
    const at = (spent: number) => buildEnvelopeRing([env('a', 4800, spent)]).segments[0].filledBlocks;
    expect(at(99)).toBe(0); // just under one block
    expect(at(100)).toBe(1); // exactly one block
    expect(at(199)).toBe(1); // still one
    expect(at(200)).toBe(2);
    expect(at(4799)).toBe(47);
    expect(at(4800)).toBe(48);
  });

  it('overspend caps at the envelope blocks and does not bleed into neighbors', () => {
    const es = [env('a', 1000, 999999, 'amber'), env('b', 1000, 0, 'blue')];
    const model = buildEnvelopeRing(es);
    const a = model.segments.find((s) => s.categoryId === 'a')!;
    const b = model.segments.find((s) => s.categoryId === 'b')!;
    expect(a.filledBlocks).toBe(a.blocks); // fully filled, no more
    expect(b.filledBlocks).toBe(0); // neighbor untouched
    // No block carries the wrong color where filled.
    const aFilled = model.blocks.filter((bl) => bl.filled && bl.colorKey === 'amber').length;
    const bFilled = model.blocks.filter((bl) => bl.filled && bl.colorKey === 'blue').length;
    expect(aFilled).toBe(a.blocks);
    expect(bFilled).toBe(0);
  });

  it('negative net spend (refund) fills nothing', () => {
    const model = buildEnvelopeRing([env('a', 4800, -250)]);
    expect(model.segments[0].filledBlocks).toBe(0);
  });

  it('countable invariant: filled blocks never overstate spending, any envelope', () => {
    const rand = (seed: number) => {
      let s = seed;
      return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    };
    const r = rand(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(r() * 6);
      const es: RingEnvelopeInput[] = [];
      for (let i = 0; i < n; i++) {
        const budget = Math.floor(r() * 50000);
        const spent = Math.floor(r() * 70000) - 5000; // may be negative or overspent
        es.push(env(`e${i}`, budget, spent, KEYS[i % KEYS.length]));
      }
      const model = buildEnvelopeRing(es);
      for (const seg of model.segments) {
        // Each filled block is fully paid for: represented <= actual spend.
        expect(seg.filledBlocks * seg.blockValueCents).toBeLessThanOrEqual(Math.max(0, seg.spentCents));
        expect(seg.filledBlocks).toBeGreaterThanOrEqual(0);
        expect(seg.filledBlocks).toBeLessThanOrEqual(seg.blocks);
      }
      // Ring blocks are always exactly the sum of segment blocks.
      const segSum = model.segments.reduce((s, x) => s + x.blocks, 0);
      expect(model.blocks).toHaveLength(segSum);
    }
  });

  it('blockValue is whole cents, round-half-up', () => {
    // 3 blocks over 100c -> 33.33 rounds to 33.
    const one = buildEnvelopeRing([env('a', 100)], 3).segments[0];
    expect(one.blockValueCents).toBe(33);
    // 2 blocks over 101c -> 50.5 rounds up to 51.
    const two = buildEnvelopeRing([env('a', 101)], 2).segments[0];
    expect(two.blockValueCents).toBe(51);
  });
});

describe('buildEnvelopeRing — block geometry & arc order', () => {
  it('block indices are contiguous 0..N-1 with correct angles', () => {
    const model = buildEnvelopeRing([env('a', 3000, 0, 'amber'), env('b', 1000, 0, 'blue')]);
    model.blocks.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.angleDeg).toBeCloseTo(i * model.degPerBlock, 10);
    });
  });

  it('each envelope owns one contiguous single-color arc, in input order', () => {
    const es = [env('a', 2000, 0, 'amber'), env('b', 1000, 0, 'blue'), env('c', 1000, 0, 'pink')];
    const model = buildEnvelopeRing(es);
    // Walk blocks; color changes exactly (segments-1) times = arcs are contiguous.
    let changes = 0;
    for (let i = 1; i < model.blocks.length; i++) {
      if (model.blocks[i].colorKey !== model.blocks[i - 1].colorKey) changes++;
    }
    expect(changes).toBe(model.segments.length - 1);
    // First arc is envelope a's color.
    expect(model.blocks[0].colorKey).toBe('amber');
  });

  it('filled blocks lead each arc (fill in arc order)', () => {
    const model = buildEnvelopeRing([env('a', 4800, 2400)]); // half spent -> first 24 filled
    const filledIdx = model.blocks.filter((b) => b.filled).map((b) => b.index);
    expect(filledIdx).toEqual(Array.from({ length: filledIdx.length }, (_, i) => i));
    expect(filledIdx.length).toBe(24);
  });
});

describe('buildEnvelopeRing — determinism', () => {
  it('produces identical output across repeated calls', () => {
    const es = [env('c', 1000), env('a', 1000), env('b', 1000), env('d', 1000), env('e', 1000)];
    const a = buildEnvelopeRing(es);
    const b = buildEnvelopeRing(es.slice());
    expect(a).toEqual(b);
  });

  it('leftover-block ties break by categoryId (deterministic, not input order)', () => {
    // Five equal envelopes over 48 blocks: 48/5 = 9 remainder 3. The 3 spare
    // blocks go to the three lowest categoryIds. Reordering input must not move them.
    const mk = (ids: string[]) => buildEnvelopeRing(ids.map((id) => env(id, 1000)));
    const forward = mk(['a', 'b', 'c', 'd', 'e']);
    const shuffled = mk(['e', 'c', 'a', 'd', 'b']);
    const blocksById = (m: ReturnType<typeof mk>) =>
      Object.fromEntries(m.segments.map((s) => [s.categoryId, s.blocks]));
    expect(blocksById(forward)).toEqual(blocksById(shuffled));
    // a,b,c get 10; d,e get 9.
    expect(blocksById(forward)).toEqual({ a: 10, b: 10, c: 10, d: 9, e: 9 });
  });
});
