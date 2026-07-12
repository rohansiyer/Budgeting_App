import { cents } from '../../../lib/money';
import { GOAL_CARD_LABEL, monthNameOf, goalAmountParts, goalPaceLine } from '../goalCard.logic';
import type { GoalFunding } from '../../../projections';

describe('GOAL_CARD_LABEL', () => {
  it('is the static tracked-uppercase label', () => {
    expect(GOAL_CARD_LABEL).toBe('GOAL');
  });
});

describe('monthNameOf', () => {
  it('resolves a two-digit month to its full name', () => {
    expect(monthNameOf('2027-03-15')).toBe('March');
    expect(monthNameOf('2026-01-01')).toBe('January');
    expect(monthNameOf('2026-12-31')).toBe('December');
  });
});

describe('goalAmountParts', () => {
  it('formats the exact dollar strings from the mockup', () => {
    expect(goalAmountParts(cents(34000), cents(120000))).toEqual({
      currentText: '$340.00',
      targetText: 'of $1,200.00',
    });
  });

  it('formats a zero current amount', () => {
    expect(goalAmountParts(cents(0), cents(50000))).toEqual({
      currentText: '$0.00',
      targetText: 'of $500.00',
    });
  });
});

describe('goalPaceLine', () => {
  const today = '2026-07-12';

  it('never invents a date: falls back to an action prompt when pace is unknown', () => {
    const funding: GoalFunding = { fundedAroundISO: null, weeklyPaceCents: null };
    expect(goalPaceLine(funding, today)).toBe('Add to savings to start the clock');
  });

  it('falls back to the same prompt when a pace exists but never funds the goal', () => {
    const funding: GoalFunding = { fundedAroundISO: null, weeklyPaceCents: cents(-500) };
    expect(goalPaceLine(funding, today)).toBe('Add to savings to start the clock');
  });

  it('reports already funded when the date is today or in the past', () => {
    const funding: GoalFunding = { fundedAroundISO: today, weeklyPaceCents: cents(1000) };
    expect(goalPaceLine(funding, today)).toBe('Fully funded');
    const past: GoalFunding = { fundedAroundISO: '2026-01-01', weeklyPaceCents: cents(1000) };
    expect(goalPaceLine(past, today)).toBe('Fully funded');
  });

  it('renders a month-only pace line for a real future date', () => {
    const funding: GoalFunding = { fundedAroundISO: '2027-03-09', weeklyPaceCents: cents(2500) };
    expect(goalPaceLine(funding, today)).toBe('At your pace: fully funded around March.');
  });
});
