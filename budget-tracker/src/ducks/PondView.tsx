/**
 * Team 4 (Pond) — pond centerpiece.
 *
 * Renders the water (radial gradient) with ripples and lays out the flock by
 * population tier (§ Duck System pond behavior):
 *   1–3  casual   — loosely scattered near the middle
 *   4–7  groupings — two social clusters
 *   8–11 full      — filling the pond in rows
 *   12   formation — a tidy V
 *
 * Designed to drop into Team 3's PondCenterSlot: it is a fixed-square,
 * self-contained View sized by `size`. Tapping a duck invokes onDuckPress
 * (Results/Pond wires the name prompt).
 */

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { color } from '../theme/tokens';
import type { Duck } from '../types/contracts';
import { DuckSprite } from './DuckSprite';
import { SPRITE_H, SPRITE_W } from './sprites';

export interface PondViewProps {
  ducks: readonly Duck[];
  accessoryTier: 0 | 1 | 2 | 3;
  /** Pond diameter in px. Default 240. */
  size?: number;
  onDuckPress?: (duck: Duck) => void;
}

type Offset = { ox: number; oy: number }; // unit-disk offsets in [-1, 1]

function casual(n: number): Offset[] {
  // Loosely along a gentle line through the middle with slight deterministic drift.
  const out: Offset[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5
    out.push({ ox: t * 0.8, oy: (i % 2 === 0 ? 0.06 : -0.06) });
  }
  return out;
}

function clusterAround(cx: number, cy: number, n: number, spread: number): Offset[] {
  const out: Offset[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = n === 1 ? 0 : spread;
    out.push({ ox: cx + Math.cos(a) * r, oy: cy + Math.sin(a) * r });
  }
  return out;
}

function groupings(n: number): Offset[] {
  const leftN = Math.ceil(n / 2);
  const rightN = n - leftN;
  return [
    ...clusterAround(-0.42, 0.0, leftN, 0.22),
    ...clusterAround(0.42, 0.05, rightN, 0.22),
  ];
}

function full(n: number): Offset[] {
  // Fill in up to three rows, spread across the width.
  const rows = 3;
  const perRow = Math.ceil(n / rows);
  const out: Offset[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const oy = (row - (rows - 1) / 2) * 0.42;
    const ox = perRow === 1 ? 0 : (col / (perRow - 1) - 0.5) * 0.86;
    out.push({ ox, oy });
  }
  return out;
}

function formation(n: number): Offset[] {
  // A V: the lead duck at the front, two arms trailing back.
  const out: Offset[] = [{ ox: 0, oy: -0.55 }];
  let placed = 1;
  let step = 1;
  while (placed < n) {
    const depth = step * 0.2;
    out.push({ ox: -step * 0.15, oy: -0.55 + depth });
    placed++;
    if (placed < n) {
      out.push({ ox: step * 0.15, oy: -0.55 + depth });
      placed++;
    }
    step++;
  }
  return out.slice(0, n);
}

function layoutFor(count: number): Offset[] {
  if (count <= 0) return [];
  if (count <= 3) return casual(count);
  if (count <= 7) return groupings(count);
  if (count <= 11) return full(count);
  return formation(count);
}

export const PondView: React.FC<PondViewProps> = ({
  ducks,
  accessoryTier,
  size = 240,
  onDuckPress,
}) => {
  const count = ducks.length;
  const scale = count <= 3 ? 3 : count <= 7 ? 2.4 : 2;
  const spriteW = SPRITE_W * scale;
  const spriteH = SPRITE_H * scale;
  const R = size / 2;
  const margin = Math.max(spriteW, spriteH) / 2 + 8;
  const usable = Math.max(0, R - margin);
  const offsets = layoutFor(count);

  const placed = ducks.map((duck, i) => {
    const off = offsets[i] ?? { ox: 0, oy: 0 };
    const cx = R + off.ox * usable;
    const cy = R + off.oy * usable;
    return { duck, left: cx - spriteW / 2, top: cy - spriteH / 2, footY: cy + spriteH / 2 };
  });

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="water" cx="50%" cy="45%" r="60%">
            <Stop offset="0%" stopColor={color.pondEdge} />
            <Stop offset="100%" stopColor={color.pondDeep} />
          </RadialGradient>
        </Defs>
        <Circle cx={R} cy={R} r={R} fill="url(#water)" />
        {/* Ambient ripple rings. */}
        <Circle cx={R} cy={R} r={R * 0.6} stroke={color.pondEdge} strokeWidth={1} fill="none" opacity={0.35} />
        <Circle cx={R} cy={R} r={R * 0.82} stroke={color.pondEdge} strokeWidth={1} fill="none" opacity={0.2} />
        {/* A small ripple under each duck's feet. */}
        {placed.map(({ duck, left, footY }) => (
          <Ellipse
            key={`ripple-${duck.id}`}
            cx={left + spriteW / 2}
            cy={footY - 2}
            rx={spriteW * 0.42}
            ry={spriteW * 0.14}
            fill={color.pondEdge}
            opacity={0.4}
          />
        ))}
      </Svg>

      {placed.map(({ duck, left, top }) => {
        const label = duck.name
          ? `Duck named ${duck.name}. Tap to rename.`
          : 'Unnamed duck. Tap to name.';
        return (
          <Pressable
            key={duck.id}
            onPress={() => onDuckPress?.(duck)}
            disabled={!onDuckPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={[styles.duck, { left, top, width: spriteW, height: spriteH }]}
          >
            <DuckSprite accessoryTier={accessoryTier} scale={scale} animation="idle" />
          </Pressable>
        );
      })}
    </View>
  );
};

export default PondView;

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignSelf: 'center',
  },
  duck: {
    position: 'absolute',
  },
});
