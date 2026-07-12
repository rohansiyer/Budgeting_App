import { cents } from '../../../lib/money';
import {
  deriveFixedBillsStatus,
  deriveGoalStatus,
  deriveSavingsRateStatus,
  deriveVariableBudgetsStatus,
  overallGoalStatus,
  topWarning,
  type VariableEnvelopeInput,
} from '../goalStatus.logic';

const food: VariableEnvelopeInput = {
  categoryId: 'food',
  categoryName: 'Food',
  planned: cents(10000),
  actual: cents(5000),
};
const gas: VariableEnvelopeInput = {
  categoryId: 'gas',
  categoryName: 'Gas',
  planned: cents(10000),
  actual: cents(9500), // 95%, near threshold, still under
};
const fun: VariableEnvelopeInput = {
  categoryId: 'fun',
  categoryName: 'Fun',
  planned: cents(10000),
  actual: cents(11000), // over budget
};

describe('deriveFixedBillsStatus', () => {
  test('checking while the async read is still loading', () => {
    expect(deriveFixedBillsStatus(null)).toBe('checking');
  });
  test('on_track once all expected bills are paid', () => {
    expect(deriveFixedBillsStatus({ expected: 3, paid: 3 })).toBe('on_track');
  });
  test('at_risk while bills remain unpaid', () => {
    expect(deriveFixedBillsStatus({ expected: 3, paid: 1 })).toBe('at_risk');
  });
  test('vacuously on_track when nothing is expected', () => {
    expect(deriveFixedBillsStatus({ expected: 0, paid: 0 })).toBe('on_track');
  });
});

describe('deriveSavingsRateStatus', () => {
  test('checking while loading', () => {
    expect(deriveSavingsRateStatus(null)).toBe('checking');
  });
  test('on_track once something has been saved', () => {
    expect(deriveSavingsRateStatus(cents(1))).toBe('on_track');
  });
  test('at_risk at zero saved', () => {
    expect(deriveSavingsRateStatus(cents(0))).toBe('at_risk');
  });
});

describe('deriveVariableBudgetsStatus', () => {
  test('on_track when every envelope is comfortably under budget', () => {
    const result = deriveVariableBudgetsStatus([food]);
    expect(result.status).toBe('on_track');
    expect(result.warnings).toEqual([]);
    expect(result.overspent).toEqual([]);
  });

  test('at_risk with a warning for a near-threshold envelope still under budget', () => {
    const result = deriveVariableBudgetsStatus([food, gas]);
    expect(result.status).toBe('at_risk');
    expect(result.overspent).toEqual([]);
    expect(result.warnings).toEqual([{ categoryId: 'gas', categoryName: 'Gas', percent: 95 }]);
  });

  test('at_risk with an overspent envelope, no warning entry for it', () => {
    const result = deriveVariableBudgetsStatus([food, fun]);
    expect(result.status).toBe('at_risk');
    expect(result.overspent).toEqual([{ categoryId: 'fun', categoryName: 'Fun' }]);
    expect(result.warnings).toEqual([]);
  });

  test('no envelopes to check is vacuously on_track', () => {
    const result = deriveVariableBudgetsStatus([]);
    expect(result.status).toBe('on_track');
  });

  test('an unbudgeted (planned 0) category never warns or overspends', () => {
    const zeroPlanned: VariableEnvelopeInput = {
      categoryId: 'z',
      categoryName: 'Z',
      planned: cents(0),
      actual: cents(500),
    };
    const result = deriveVariableBudgetsStatus([zeroPlanned]);
    expect(result.status).toBe('on_track');
  });
});

describe('topWarning', () => {
  test('null when there are no warnings', () => {
    expect(topWarning(deriveVariableBudgetsStatus([food]))).toBeNull();
  });

  test('picks the highest-percent warning when several fire', () => {
    const closer: VariableEnvelopeInput = {
      categoryId: 'closer',
      categoryName: 'Closer',
      planned: cents(10000),
      actual: cents(9900), // 99%
    };
    const result = deriveVariableBudgetsStatus([gas, closer]);
    expect(topWarning(result)?.categoryId).toBe('closer');
  });

  test('an overspent envelope alone produces no warning to ease off', () => {
    expect(topWarning(deriveVariableBudgetsStatus([fun]))).toBeNull();
  });
});

describe('deriveGoalStatus + overallGoalStatus', () => {
  test('all three checking while loading', () => {
    const result = deriveGoalStatus({ bills: null, savings: null, variable: [food] });
    expect(overallGoalStatus(result)).toBe('checking');
  });

  test('on_track when every goal is met', () => {
    const result = deriveGoalStatus({
      bills: { expected: 2, paid: 2 },
      savings: cents(500),
      variable: [food],
    });
    expect(overallGoalStatus(result)).toBe('on_track');
  });

  test('at_risk wins over checking when at least one goal is already at risk', () => {
    const result = deriveGoalStatus({
      bills: { expected: 2, paid: 0 },
      savings: null,
      variable: [food],
    });
    expect(overallGoalStatus(result)).toBe('at_risk');
  });
});
