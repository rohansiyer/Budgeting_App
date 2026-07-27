import { buildSparkColumns } from '../SparkBlocks.logic';
import { cents } from '../../../lib/money';

describe('buildSparkColumns', () => {
  test('one block equals blockValue, rounded to the nearest block', () => {
    const out = buildSparkColumns(
      [
        { label: 'Jan', value: cents(10000) },
        { label: 'Feb', value: cents(15499) },
      ],
      cents(5000),
    );
    expect(out).toEqual([
      { label: 'Jan', value: cents(10000), blockCount: 2 },
      { label: 'Feb', value: cents(15499), blockCount: 3 }, // 3.0998 rounds to 3
    ]);
  });

  test('caps a column at maxBlocks so one outlier does not dwarf the rest', () => {
    const out = buildSparkColumns([{ label: 'Dec', value: cents(100000) }], cents(1000), 6);
    expect(out[0].blockCount).toBe(6);
  });

  test('negative values floor to zero blocks, never a negative column', () => {
    const out = buildSparkColumns([{ label: 'Refund', value: cents(-2000) }], cents(1000));
    expect(out[0].blockCount).toBe(0);
  });

  test('zero value renders zero blocks', () => {
    const out = buildSparkColumns([{ label: 'Quiet', value: cents(0) }], cents(1000));
    expect(out[0].blockCount).toBe(0);
  });

  test('guards against a zero or negative blockValue by treating it as 1 cent', () => {
    const out = buildSparkColumns([{ label: 'X', value: cents(3) }], cents(0));
    expect(out[0].blockCount).toBe(3);
  });

  test('preserves column order and passes label/value through untouched', () => {
    const out = buildSparkColumns(
      [
        { label: 'A', value: cents(100) },
        { label: 'B', value: cents(200) },
      ],
      cents(100),
    );
    expect(out.map((c) => c.label)).toEqual(['A', 'B']);
    expect(out.map((c) => c.value)).toEqual([cents(100), cents(200)]);
  });
});
