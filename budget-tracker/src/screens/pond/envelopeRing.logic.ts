/**
 * WAVE-C (v0.3) — Pond envelope-pie ring: pure geometry + apportionment.
 *
 * The Pond ring (handoff_v3 README §2.2) is one thin ring of `blockCount`
 * discrete blocks. Each envelope owns a contiguous arc whose length is
 * proportional to its BUDGET SHARE, drawn in its category color. Blocks fill
 * from plan-opacity to solid as spending lands.
 *
 * COUNTABLE-MONEY RULE: one block represents a fixed dollar denomination for
 * its envelope — `blockValueCents = round(budgetCents / itsBlockCount)`, whole
 * cents, integer math. A block is "filled" only once that many cents are
 * actually spent: `filled = min(blocks, floor(spent / blockValueCents))`.
 * Because of the floor, filled blocks NEVER overstate spending: for every
 * envelope `filledBlocks * blockValueCents <= spentCents`. Overspend caps at
 * the envelope's own blocks and never bleeds into a neighbor's arc.
 *
 * Apportionment is largest-remainder (Hamilton) so blocks sum EXACTLY to
 * blockCount, with a min-1 guarantee for every envelope carrying budget > 0.
 * All ordering ties break deterministically by categoryId.
 *
 * Pure and float-free on money paths (float only decides which bucket gets a
 * spare block, never a cent total) — safe to unit-test without RN.
 */

import type { CategoryColorKey } from '../../types/contracts';

export interface RingEnvelopeInput {
  categoryId: string;
  colorKey: CategoryColorKey;
  /** Planned budget for this envelope, integer cents (>= 0). */
  budgetCents: number;
  /** Spend landed against this envelope, integer cents (may be 0). */
  spentCents: number;
}

/** One drawable block on the ring, in arc order. */
export interface RingBlock {
  /** 0-based position around the ring (0 at 12 o'clock, increasing clockwise). */
  index: number;
  /** Rotation in degrees for this block = index * (360 / blockCount). */
  angleDeg: number;
  colorKey: CategoryColorKey;
  /** true = solid (spend landed here); false = plan (translucent). */
  filled: boolean;
}

/** Per-envelope apportionment result, in ring order (positive budgets only). */
export interface RingSegment {
  categoryId: string;
  colorKey: CategoryColorKey;
  /** Contiguous blocks this envelope owns (>= 1). */
  blocks: number;
  /** Of `blocks`, how many are solid. */
  filledBlocks: number;
  /** Fixed dollar denomination one block represents, integer cents (>= 1). */
  blockValueCents: number;
  budgetCents: number;
  spentCents: number;
}

export interface EnvelopeRingModel {
  blockCount: number;
  degPerBlock: number;
  blocks: RingBlock[];
  segments: RingSegment[];
  totalBudgetCents: number;
  totalSpentCents: number;
  /** Envelopes actually represented on the ring (budget > 0). */
  envelopeCount: number;
}

export const DEFAULT_BLOCK_COUNT = 48;

/** Deterministic string order (byte-wise, locale-independent). */
function byCategoryId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Round to whole cents with round-half-up, using only integer arithmetic. */
function roundDiv(numer: number, denom: number): number {
  // (numer / denom) rounded half-up; numer, denom are non-negative integers.
  return Math.floor((numer * 2 + denom) / (denom * 2));
}

/**
 * Distribute `blockCount` blocks across the positive-budget envelopes.
 * Guarantees: sum === blockCount; every positive envelope gets >= 1 (as long
 * as positiveCount <= blockCount); largest-remainder proportionality; ties by
 * categoryId. Returns block counts aligned to `positives` order.
 */
function apportion(
  positives: readonly RingEnvelopeInput[],
  blockCount: number,
): number[] {
  const n = positives.length;
  if (n === 0) return [];

  // Degenerate: more envelopes than blocks — cannot give everyone one. Award a
  // single block to the largest `blockCount` by budget (ties by categoryId);
  // the rest fall off the ring this period.
  if (n > blockCount) {
    const ranked = positives
      .map((e, i) => ({ i, budget: e.budgetCents, id: e.categoryId }))
      .sort((a, b) => b.budget - a.budget || byCategoryId(a.id, b.id));
    const out = new Array<number>(n).fill(0);
    for (let k = 0; k < blockCount; k++) out[ranked[k].i] = 1;
    return out;
  }

  const total = positives.reduce((s, e) => s + e.budgetCents, 0);
  const out = new Array<number>(n).fill(0);

  if (total <= 0) {
    // All-zero budgets among "positives" cannot happen (positives filter on
    // budget > 0), but guard anyway: hand out blocks round-robin by id.
    const order = positives
      .map((e, i) => ({ i, id: e.categoryId }))
      .sort((a, b) => byCategoryId(a.id, b.id));
    for (let k = 0; k < blockCount; k++) out[order[k % n].i] += 1;
    return out;
  }

  // Hamilton largest-remainder on the full blockCount (best proportionality).
  const exact = positives.map((e) => (e.budgetCents * blockCount) / total);
  const floors = exact.map(Math.floor);
  let leftover = blockCount - floors.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) out[i] = floors[i];

  const remOrder = positives
    .map((e, i) => ({ i, frac: exact[i] - floors[i], id: e.categoryId }))
    .sort((a, b) => b.frac - a.frac || byCategoryId(a.id, b.id));
  for (let k = 0; leftover > 0; k = (k + 1) % n, leftover--) {
    out[remOrder[k].i] += 1;
  }

  // Min-1 fixup: bump any positive envelope that rounded to 0 up to 1, and
  // reclaim those blocks from the largest holders (>1) so the sum is preserved.
  const deficits: number[] = [];
  for (let i = 0; i < n; i++) if (out[i] === 0) deficits.push(i);
  let need = deficits.length;
  for (const i of deficits) out[i] = 1;
  while (need > 0) {
    // Steal from the current largest holder with > 1 block; ties by categoryId
    // descending (deterministic, and biases the steal away from the smallest id).
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] <= 1) continue;
      if (
        pick === -1 ||
        out[i] > out[pick] ||
        (out[i] === out[pick] && byCategoryId(positives[i].categoryId, positives[pick].categoryId) > 0)
      ) {
        pick = i;
      }
    }
    if (pick === -1) break; // everyone at 1 already; nothing left to reclaim
    out[pick] -= 1;
    need -= 1;
  }

  return out;
}

/**
 * How many of an envelope's `blocks` are solid, given its spend.
 * Countable-money: floor(spent / blockValue), capped at `blocks`, floored at 0.
 */
function computeFilled(blocks: number, blockValueCents: number, spentCents: number): number {
  if (blocks <= 0) return 0;
  if (blockValueCents <= 0) return spentCents > 0 ? blocks : 0;
  if (spentCents <= 0) return 0;
  const raw = Math.floor(spentCents / blockValueCents);
  return raw < 0 ? 0 : raw > blocks ? blocks : raw;
}

/**
 * Build the ring model from a set of envelopes.
 * Zero (or negative) budget envelopes are dropped — a plan of $0 owns no arc.
 * Input order defines arc order; apportionment ties are id-deterministic.
 */
export function buildEnvelopeRing(
  envelopes: readonly RingEnvelopeInput[],
  blockCount: number = DEFAULT_BLOCK_COUNT,
): EnvelopeRingModel {
  if (!Number.isInteger(blockCount) || blockCount <= 0) {
    throw new Error(`buildEnvelopeRing: blockCount must be a positive integer, got ${blockCount}`);
  }

  const degPerBlock = 360 / blockCount;
  const positives = envelopes.filter((e) => e.budgetCents > 0);

  const totalBudgetCents = envelopes.reduce((s, e) => s + e.budgetCents, 0);
  const totalSpentCents = envelopes.reduce((s, e) => s + e.spentCents, 0);

  if (positives.length === 0) {
    return {
      blockCount,
      degPerBlock,
      blocks: [],
      segments: [],
      totalBudgetCents,
      totalSpentCents,
      envelopeCount: 0,
    };
  }

  const counts = apportion(positives, blockCount);

  const segments: RingSegment[] = [];
  const blocks: RingBlock[] = [];
  let cursor = 0;
  for (let s = 0; s < positives.length; s++) {
    const env = positives[s];
    const nBlocks = counts[s];
    if (nBlocks <= 0) continue; // degenerate overflow case: envelope dropped
    const blockValueCents = roundDiv(env.budgetCents, nBlocks);
    const filledBlocks = computeFilled(nBlocks, blockValueCents, env.spentCents);

    segments.push({
      categoryId: env.categoryId,
      colorKey: env.colorKey,
      blocks: nBlocks,
      filledBlocks,
      blockValueCents,
      budgetCents: env.budgetCents,
      spentCents: env.spentCents,
    });

    for (let b = 0; b < nBlocks; b++, cursor++) {
      blocks.push({
        index: cursor,
        angleDeg: cursor * degPerBlock,
        colorKey: env.colorKey,
        filled: b < filledBlocks,
      });
    }
  }

  return {
    blockCount,
    degPerBlock,
    blocks,
    segments,
    totalBudgetCents,
    totalSpentCents,
    envelopeCount: segments.length,
  };
}
