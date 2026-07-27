import { cents } from '../../../lib/money';
import { buildStepChart } from '../steppedChart.logic';

/** Every M/H/V step in a path is either a pure horizontal or pure vertical
 * move (never diagonal) — parses the `d` string into command pairs. */
function assertStepShape(path: string) {
  if (path === '') return;
  const commands = path.match(/[MHV][^MHV]+/g) ?? [];
  expect(commands.length).toBeGreaterThan(0);
  expect(commands[0]?.[0]).toBe('M');
  for (let i = 1; i < commands.length; i++) {
    expect(['H', 'V']).toContain(commands[i][0]);
  }
}

function xsOf(points: readonly { x: number }[]): number[] {
  return points.map((p) => p.x);
}

describe('buildStepChart', () => {
  it('produces a monotone, step-shaped path for a typical history + projection', () => {
    const history = [0, 100, 150, 300, 250].map((v) => cents(v * 100));
    const projection = [250, 400, 550].map((v) => cents(v * 100)); // [0] overlaps history's last
    const result = buildStepChart({
      history,
      projection,
      targetCents: cents(70000),
      width: 328,
      height: 140,
    });

    assertStepShape(result.historyPath);
    assertStepShape(result.projectionPath);

    const allXs = [...xsOf(result.historyPoints), ...xsOf(result.projectionPoints)];
    for (let i = 1; i < allXs.length; i++) {
      expect(allXs[i]).toBeGreaterThanOrEqual(allXs[i - 1]);
    }
    // The boundary point (today) is shared: history's last x equals
    // projection's first x, and equals todayX.
    expect(result.historyPoints[result.historyPoints.length - 1].x).toBe(
      result.projectionPoints[0].x,
    );
    expect(result.todayX).toBe(result.historyPoints[result.historyPoints.length - 1].x);
  });

  it('scales y exactly against a known cent domain', () => {
    const result = buildStepChart({
      history: [cents(0), cents(50000), cents(100000)],
      projection: [],
      targetCents: null,
      width: 300,
      height: 100,
      topPadding: 0,
      bottomPadding: 0,
    });
    // domain 0..100000 over 100px inner height: 0 -> y100, 50000 -> y50, 100000 -> y0.
    expect(result.historyPoints[0].y).toBeCloseTo(100);
    expect(result.historyPoints[1].y).toBeCloseTo(50);
    expect(result.historyPoints[2].y).toBeCloseTo(0);
  });

  it('places the dashed target hairline at the exact scaled y', () => {
    const result = buildStepChart({
      history: [cents(0)],
      projection: [cents(0), cents(100000)],
      targetCents: cents(75000),
      width: 300,
      height: 100,
      topPadding: 0,
      bottomPadding: 0,
    });
    expect(result.targetY).toBeCloseTo(25);
  });

  it('handles an empty history (projection only) without throwing', () => {
    const result = buildStepChart({
      history: [],
      projection: [cents(10000), cents(20000)],
      targetCents: null,
      width: 200,
      height: 100,
    });
    expect(result.historyPath).toBe('');
    expect(result.projectionPath).not.toBe('');
    expect(result.todayX).toBe(0);
    assertStepShape(result.projectionPath);
  });

  it('handles a short (single-point) history without a division by zero', () => {
    const result = buildStepChart({
      history: [cents(10000)],
      projection: [],
      targetCents: null,
      width: 200,
      height: 100,
    });
    expect(result.historyPoints).toHaveLength(1);
    expect(result.historyPath).toBe(`M0,${result.historyPoints[0].y}`);
    expect(result.todayX).toBe(0);
  });

  it('handles both series empty without throwing', () => {
    const result = buildStepChart({
      history: [],
      projection: [],
      targetCents: cents(1000),
      width: 200,
      height: 100,
    });
    expect(result.historyPath).toBe('');
    expect(result.projectionPath).toBe('');
    expect(result.todayX).toBe(0);
    expect(result.targetY).toBeNull();
  });

  it('pads a flat (zero-variance) domain instead of dividing by zero', () => {
    const result = buildStepChart({
      history: [cents(50000), cents(50000)],
      projection: [],
      targetCents: null,
      width: 200,
      height: 100,
    });
    expect(Number.isFinite(result.historyPoints[0].y)).toBe(true);
    expect(Number.isFinite(result.historyPoints[1].y)).toBe(true);
    expect(result.historyPoints[0].y).toBeCloseTo(result.historyPoints[1].y);
  });
});
