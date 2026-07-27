import { buildBlockMeter, MAX_CELLS } from '../BlockMeter.logic';
import { cents } from '../../../lib/money';

describe('buildBlockMeter (envelope variant, default)', () => {
  it('renders empty cells for an unspent budget', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(0), blockValue: cents(1000) });
    expect(out.cells).toEqual(Array(10).fill('empty'));
  });

  it('fills cells proportionally to spend', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(5000), blockValue: cents(1000) });
    expect(out.cells).toEqual([...Array(5).fill('fill'), ...Array(5).fill('empty')]);
  });

  it('switches to warn color at/above the warnAt fraction', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(9500), blockValue: cents(1000) });
    // 9500/10000 = 0.95 >= 0.9 warnAt -> every filled cell is warn.
    expect(out.cells.filter((c) => c === 'warn').length).toBeGreaterThan(0);
    expect(out.cells).not.toContain('over');
  });

  it('renders an overflow (danger) cell when spend exceeds the budget', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(12000), blockValue: cents(1000) });
    expect(out.cells.filter((c) => c === 'over').length).toBeGreaterThan(0);
    // base cells all show over too (existing envelope semantics).
    expect(out.cells.slice(0, 10).every((c) => c === 'over')).toBe(true);
  });

  it('reports exact valueText regardless of the block scale', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(3000), blockValue: cents(1000) });
    expect(out.valueText).toBe('$70.00 left of $100.00');
  });

  it('reports an "over" valueText when spend exceeds available', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(12000), blockValue: cents(1000) });
    expect(out.valueText).toBe('$20.00 over $100.00');
  });

  it('renders outlined bonus cells for rolled-in amounts and hollow debt cells', () => {
    const out = buildBlockMeter({
      budget: cents(10000),
      spent: cents(11000),
      blockValue: cents(1000),
      bonus: cents(2000),
      debt: cents(1000),
    });
    expect(out.cells).toContain('bonus-fill');
    expect(out.cells).toContain('bonus-empty');
    expect(out.cells).toContain('debt');
  });
});

describe('buildBlockMeter cell cap (F4-3)', () => {
  it('never renders more than ~MAX_CELLS base cells for a huge budget', () => {
    // budget/blockValue = 100_000_000 / 100 = 1,000,000 raw cells.
    const out = buildBlockMeter({
      budget: cents(100_000_000),
      spent: cents(0),
      blockValue: cents(100),
    });
    expect(out.cells.length).toBeLessThanOrEqual(MAX_CELLS);
    expect(out.cells.length).toBeGreaterThan(0);
  });

  it('does not clamp a small/normal budget below its natural cell count', () => {
    const out = buildBlockMeter({ budget: cents(10000), spent: cents(0), blockValue: cents(1000) });
    expect(out.cells.length).toBe(10);
  });

  it('keeps the accessibility value (available/remaining) exact to the cent under the cap', () => {
    const out = buildBlockMeter({
      budget: cents(100_000_000),
      spent: cents(3_000_000),
      blockValue: cents(100),
    });
    expect(out.available).toBe(100_000_000);
    expect(out.valueText).toBe('$970,000.00 left of $1,000,000.00');
  });
});

describe('buildBlockMeter goal variant (F4-2)', () => {
  it('meeting the target exactly renders fill cells, never over', () => {
    const out = buildBlockMeter({
      budget: cents(100000),
      spent: cents(100000),
      blockValue: cents(10000),
      variant: 'goal',
    });
    expect(out.cells).not.toContain('over');
    expect(out.cells.every((c) => c === 'fill')).toBe(true);
  });

  it('exceeding the target renders fill cells, never over, and emits no extra overflow cell', () => {
    const out = buildBlockMeter({
      budget: cents(150000),
      spent: cents(250000),
      blockValue: cents(10000),
      variant: 'goal',
    });
    expect(out.cells).not.toContain('over');
    expect(out.cells.every((c) => c === 'fill')).toBe(true);
    // 150000 / 10000 = 15 base cells; no appended overflow cell for goals.
    expect(out.cells.length).toBe(15);
  });

  it('below-target progress still uses normal fill/warn coloring, no danger', () => {
    const out = buildBlockMeter({
      budget: cents(100000),
      spent: cents(40000),
      blockValue: cents(10000),
      variant: 'goal',
    });
    expect(out.cells).not.toContain('over');
    expect(out.cells.filter((c) => c === 'fill').length).toBe(4);
  });

  it('a huge goal target is still cell-capped like the envelope variant', () => {
    const out = buildBlockMeter({
      budget: cents(100_000_000),
      spent: cents(120_000_000),
      blockValue: cents(100),
      variant: 'goal',
    });
    expect(out.cells.length).toBeLessThanOrEqual(MAX_CELLS);
    expect(out.cells).not.toContain('over');
  });

  it('the envelope variant is unaffected (default, zero behavior change)', () => {
    const goalStyle = buildBlockMeter({
      budget: cents(100000),
      spent: cents(120000),
      blockValue: cents(10000),
      variant: 'goal',
    });
    const envelopeStyle = buildBlockMeter({
      budget: cents(100000),
      spent: cents(120000),
      blockValue: cents(10000),
    });
    expect(goalStyle.cells).not.toContain('over');
    expect(envelopeStyle.cells).toContain('over');
  });
});
