/**
 * WAVE-C (v0.3) — Pond envelope-pie ring (handoff_v3 README §2.2).
 *
 * One thin ring of discrete blocks around the pond. Each envelope owns a
 * contiguous arc sized by budget share, its category color at 22% opacity for
 * the plan, blocks turning solid (100%) as spending lands. Zero radius, no
 * gradients, no animation: fills change discretely with the data, never tween.
 *
 * Reference geometry (README): 312px container, 12x8px blocks at radius ~152,
 * 7.5 degrees apart. All geometry scales linearly from the `size` prop against
 * that 312px reference, so the ring stays pixel-proportioned at any size.
 *
 * Layout logic lives in envelopeRing.logic.ts (pure, unit-tested); this file
 * is render-only.
 */

import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { color } from '../../theme/tokens';
import { cents, formatCents } from '../../lib/money';
import {
  buildEnvelopeRing,
  DEFAULT_BLOCK_COUNT,
  type RingEnvelopeInput,
} from './envelopeRing.logic';

/** Reference container the geometry constants are authored against. */
const REF_SIZE = 312;
/** Block footprint at reference scale (README §2.2). */
const REF_BLOCK_W = 12;
const REF_BLOCK_H = 8;
/** Inset of a block's outer edge from the container top at reference scale. */
const REF_TOP_INSET = 4;

const PLAN_OPACITY = 0.22;
const FILLED_OPACITY = 1;

export interface EnvelopeRingProps {
  envelopes: readonly RingEnvelopeInput[];
  /** Rendered diameter in px. Geometry scales from the 312px reference. */
  size?: number;
  blockCount?: number;
}

export const EnvelopeRing: React.FC<EnvelopeRingProps> = ({
  envelopes,
  size = REF_SIZE,
  blockCount = DEFAULT_BLOCK_COUNT,
}) => {
  const model = buildEnvelopeRing(envelopes, blockCount);

  const k = size / REF_SIZE;
  const center = size / 2;
  const blockW = REF_BLOCK_W * k;
  const blockH = REF_BLOCK_H * k;
  const topInset = REF_TOP_INSET * k;
  const x = center - blockW / 2;

  const label =
    `${formatCents(cents(model.totalSpentCents))} of ` +
    `${formatCents(cents(model.totalBudgetCents))} spent across ` +
    `${model.envelopeCount} ${model.envelopeCount === 1 ? 'envelope' : 'envelopes'}`;

  return (
    <Svg
      width={size}
      height={size}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {model.blocks.map((block) => (
        <Rect
          key={block.index}
          x={x}
          y={topInset}
          width={blockW}
          height={blockH}
          fill={color.category[block.colorKey]}
          fillOpacity={block.filled ? FILLED_OPACITY : PLAN_OPACITY}
          origin={`${center}, ${center}`}
          rotation={block.angleDeg}
        />
      ))}
    </Svg>
  );
};

export default EnvelopeRing;
