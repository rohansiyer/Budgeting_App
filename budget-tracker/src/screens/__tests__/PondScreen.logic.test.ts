import {
  isDayOnePond,
  envelopePeriodWindow,
  assemblePondRing,
  flockCountLabel,
  FLOCK_DISPLAY_CAP,
  type CategoryPeriodRead,
} from '../PondScreen.logic';

describe('isDayOnePond', () => {
  test('one duck and no evaluations is day one', () => {
    expect(isDayOnePond(1, 0)).toBe(true);
  });

  test('a flock of 1 after a hold-then-loss history is NOT day one', () => {
    // Started at 1, held a partial month, still 1 duck, but a month WAS
    // evaluated, so the starter-duck seed will never fire again.
    expect(isDayOnePond(1, 3)).toBe(false);
  });

  test('two or more ducks is never day one, regardless of evaluations', () => {
    expect(isDayOnePond(2, 0)).toBe(false);
    expect(isDayOnePond(5, 4)).toBe(false);
  });

  test('zero ducks (a 0/3 month) is never day one', () => {
    expect(isDayOnePond(0, 1)).toBe(false);
  });
});

describe('envelopePeriodWindow', () => {
  test('weekly cadence resolves to the Monday of the containing week', () => {
    // 2026-07-11 is a Saturday; its week's Monday is 2026-07-06.
    const w = envelopePeriodWindow('weekly', '2026-07-11');
    expect(w).toEqual({ cadence: 'weekly', weekStart: '2026-07-06' });
  });

  test('weekly cadence on a Monday resolves to itself', () => {
    const w = envelopePeriodWindow('weekly', '2026-07-06');
    expect(w).toEqual({ cadence: 'weekly', weekStart: '2026-07-06' });
  });

  test('monthly cadence resolves to the containing calendar month', () => {
    const w = envelopePeriodWindow('monthly', '2026-07-11');
    expect(w).toEqual({ cadence: 'monthly', month: '2026-07' });
  });

  test('monthly cadence at a month boundary still resolves correctly', () => {
    expect(envelopePeriodWindow('monthly', '2026-01-31')).toEqual({
      cadence: 'monthly',
      month: '2026-01',
    });
    expect(envelopePeriodWindow('monthly', '2026-02-01')).toEqual({
      cadence: 'monthly',
      month: '2026-02',
    });
  });
});

function read(p: Partial<CategoryPeriodRead> & Pick<CategoryPeriodRead, 'categoryId'>): CategoryPeriodRead {
  return {
    categoryName: p.categoryId,
    colorKey: 'violet',
    hasEnvelope: true,
    budgetCents: 0,
    spentCents: 0,
    ...p,
  };
}

describe('assemblePondRing', () => {
  test('only envelope categories reach the ring; fixed categories reach only the legend', () => {
    const reads: CategoryPeriodRead[] = [
      read({ categoryId: 'food', hasEnvelope: true, budgetCents: 30000, spentCents: 12000, colorKey: 'amber' }),
      read({ categoryId: 'rent', hasEnvelope: false, budgetCents: 0, spentCents: 150000, colorKey: 'violet' }),
    ];
    const model = assemblePondRing(reads);
    expect(model.ringEnvelopes).toEqual([
      { categoryId: 'food', colorKey: 'amber', budgetCents: 30000, spentCents: 12000 },
    ]);
    expect(model.legend.map((r) => r.categoryId)).toEqual(['food', 'rent']);
    expect(model.legend.find((r) => r.categoryId === 'rent')).toMatchObject({
      planned: 0,
      actual: 150000,
    });
  });

  test('ring totals sum only enveloped categories, not fixed spend', () => {
    const reads: CategoryPeriodRead[] = [
      read({ categoryId: 'food', hasEnvelope: true, budgetCents: 30000, spentCents: 12000 }),
      read({ categoryId: 'fun', hasEnvelope: true, budgetCents: 20000, spentCents: 8040 }),
      read({ categoryId: 'rent', hasEnvelope: false, budgetCents: 0, spentCents: 150000 }),
    ];
    const model = assemblePondRing(reads);
    expect(model.totalBudgetCents).toBe(50000);
    expect(model.totalSpentCents).toBe(20040);
  });

  test('empty input yields an empty ring and legend with zero totals', () => {
    const model = assemblePondRing([]);
    expect(model.ringEnvelopes).toEqual([]);
    expect(model.legend).toEqual([]);
    expect(model.totalBudgetCents).toBe(0);
    expect(model.totalSpentCents).toBe(0);
  });

  test('a category with envelope but zero budget still reaches the ring input list (buildEnvelopeRing itself drops it)', () => {
    const reads: CategoryPeriodRead[] = [
      read({ categoryId: 'misc', hasEnvelope: true, budgetCents: 0, spentCents: 500 }),
    ];
    const model = assemblePondRing(reads);
    expect(model.ringEnvelopes).toEqual([
      { categoryId: 'misc', colorKey: 'violet', budgetCents: 0, spentCents: 500 },
    ]);
  });
});

describe('flockCountLabel', () => {
  test('formats against the fixed display cap', () => {
    expect(flockCountLabel(8)).toBe('8 of 12 ducks');
    expect(FLOCK_DISPLAY_CAP).toBe(12);
  });

  test('formats zero and larger-than-cap flocks without special-casing', () => {
    expect(flockCountLabel(0)).toBe('0 of 12 ducks');
    expect(flockCountLabel(15)).toBe('15 of 12 ducks');
  });
});
