/**
 * Pure geometry for the stepped savings chart (v0.3 handoff §3.9, mockup
 * "Savings · stepped trend + 45% projection"). Converts a history + a
 * projection series (both weekly Cents balances, sharing the "today" point
 * at the boundary) plus an optional goal target into scaled SVG step-path
 * point arrays. No store reads, no dates beyond what the caller already
 * resolved into ProjectionPoint[] elsewhere — fully deterministic and cheap
 * to unit test.
 *
 * House rule (§3.9): stepped, never smooth. Every segment is drawn as a
 * horizontal hold at the OLD value out to the new week's x, then a vertical
 * jump to the new value ("H then V") — the same step-after shape as the
 * mockup's hand-authored path data.
 */
import { cents, type Cents } from '../../lib/money';

export interface StepPoint {
  x: number;
  y: number;
}

export interface StepChartInput {
  /** Oldest -> today, inclusive of today's balance as the last element. */
  history: readonly Cents[];
  /** Today -> future. Element 0 is expected to equal history's last element
   * (the shared "today" boundary); may be empty if there is no projection. */
  projection: readonly Cents[];
  targetCents: Cents | null;
  width: number;
  height: number;
  /** Reserved space at the top (for a value label) and bottom. Defaults 16 / 4. */
  topPadding?: number;
  bottomPadding?: number;
}

export interface StepChartResult {
  historyPoints: StepPoint[];
  projectionPoints: StepPoint[];
  /** SVG path `d` attribute, empty string when there are no points to draw. */
  historyPath: string;
  projectionPath: string;
  /** x of the vertical "today" hairline. */
  todayX: number;
  /** y of the dashed goal-target hairline; null when there is no target. */
  targetY: number | null;
  minCents: Cents;
  maxCents: Cents;
}

/** step-after path: M at the first point, then H(next x) V(next y) per point. */
function stepPath(points: readonly StepPoint[]): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${points[i].x} V${points[i].y}`;
  }
  return d;
}

export function buildStepChart(input: StepChartInput): StepChartResult {
  const { history, projection, targetCents, width, height } = input;
  const topPadding = input.topPadding ?? 16;
  const bottomPadding = input.bottomPadding ?? 4;

  const historyLen = history.length;
  const projLen = projection.length;
  // history and projection share one slot (today) when both are present.
  const overlap = historyLen > 0 && projLen > 0 ? 1 : 0;
  const totalSlots = historyLen + projLen - overlap;

  if (totalSlots <= 0) {
    return {
      historyPoints: [],
      projectionPoints: [],
      historyPath: '',
      projectionPath: '',
      todayX: 0,
      targetY: null,
      minCents: cents(0),
      maxCents: cents(0),
    };
  }

  const allValues: number[] = [...history, ...projection];
  if (targetCents !== null) allValues.push(targetCents);
  let minV = Math.min(...allValues);
  let maxV = Math.max(...allValues);
  if (minV === maxV) {
    // Degenerate (flat or single-point) series: pad the domain so the chart
    // draws a visible flat line instead of dividing by zero.
    minV -= 100;
    maxV += 100;
  }

  const innerHeight = height - topPadding - bottomPadding;
  const xStep = totalSlots > 1 ? width / (totalSlots - 1) : 0;
  const yFor = (v: number) => topPadding + ((maxV - v) / (maxV - minV)) * innerHeight;

  const historyPoints: StepPoint[] = history.map((v, i) => ({ x: i * xStep, y: yFor(v) }));
  // Where projection's slot-index 0 falls: right after history's last slot
  // when they overlap, otherwise projection owns slot 0 itself.
  const projStartIndex = historyLen - overlap;
  const projectionPoints: StepPoint[] = projection.map((v, j) => ({
    x: (projStartIndex + j) * xStep,
    y: yFor(v),
  }));

  const todayX =
    historyLen > 0 ? historyPoints[historyLen - 1].x : (projectionPoints[0]?.x ?? 0);
  const targetY = targetCents !== null ? yFor(targetCents) : null;

  return {
    historyPoints,
    projectionPoints,
    historyPath: stepPath(historyPoints),
    projectionPath: stepPath(projectionPoints),
    todayX,
    targetY,
    minCents: cents(Math.round(minV)),
    maxCents: cents(Math.round(maxV)),
  };
}
