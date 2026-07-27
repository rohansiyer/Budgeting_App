import { buildStepBlocks } from '../StepTrack.logic';

describe('buildStepBlocks', () => {
  test('fills exactly `completed` blocks from the front', () => {
    expect(buildStepBlocks(4, 2)).toEqual([true, true, false, false]);
  });

  test('zero completed fills nothing', () => {
    expect(buildStepBlocks(4, 0)).toEqual([false, false, false, false]);
  });

  test('completed equal to total fills every block', () => {
    expect(buildStepBlocks(3, 3)).toEqual([true, true, true]);
  });

  test('clamps completed above total rather than overflowing', () => {
    expect(buildStepBlocks(3, 99)).toEqual([true, true, true]);
  });

  test('clamps negative completed to zero', () => {
    expect(buildStepBlocks(3, -5)).toEqual([false, false, false]);
  });

  test('clamps a negative total to an empty track', () => {
    expect(buildStepBlocks(-2, 1)).toEqual([]);
  });

  test('floors non-integer inputs', () => {
    expect(buildStepBlocks(4.9, 2.9)).toEqual([true, true, false, false]);
  });

  test('non-finite inputs degrade to an empty track', () => {
    expect(buildStepBlocks(NaN, 2)).toEqual([]);
    expect(buildStepBlocks(4, NaN)).toEqual([false, false, false, false]);
  });
});
