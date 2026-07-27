/**
 * Team 4 (Pond) — pond centerpiece (handoff v3 §2.2, "The Pond, redrawn").
 *
 * Flat water (no gradients, per the design system's aesthetic invariants):
 * a solid `pondDeep` disc with a 6px `pondEdge` stroke, a handful of 4px
 * pixel-ripple squares whose opacity alternates on a stepped ~800ms timer
 * (no easing), and a deterministic wandering flock driven by
 * `src/ducks/wander.logic.ts`:
 *   - SHORE ducks walk a fixed-radius band just outside the water on land
 *     poses (idle / preen), flipping to face their direction of travel.
 *   - FLOATER ducks drift inside the water disc on the legless float pose.
 *
 * Movement is stepped (~400ms ticks advancing a pure tickIndex through
 * wander.logic's `step`), never tweened, and freezes entirely under the OS
 * reduced-motion setting (both the wander and the ripple flicker).
 *
 * Public contract unchanged from v0.2: a fixed-square View sized by `size`,
 * dropped into a PondCenterSlot; ducks stay Pressable and invoke
 * onDuckPress (Results/Pond wire the name prompt).
 */

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { color, motion } from '../theme/tokens';
import type { Duck } from '../types/contracts';
import { DuckSprite } from './DuckSprite';
import { SPRITE_H, SPRITE_W } from './sprites';
import { TICK_MS, initWander, step as wanderStep, type WanderState } from './wander.logic';

export interface PondViewProps {
  ducks: readonly Duck[];
  accessoryTier: 0 | 1 | 2 | 3;
  /** Pond diameter in px. Default 240. */
  size?: number;
  onDuckPress?: (duck: Duck) => void;
}

/** Water disc radius as a fraction of the usable (margin-adjusted) radius. */
const WATER_R_FRACTION = 0.66;
/** Ripple flicker cadence, per handoff §2.2 ("a stepped timer"). */
const RIPPLE_MS = 800;
/** Fixed, deterministic ripple placements (unit-disk fractions of water radius). */
const RIPPLE_SPOTS: readonly { ox: number; oy: number; phase: 0 | 1 }[] = [
  { ox: -0.4, oy: -0.15, phase: 0 },
  { ox: 0.3, oy: 0.35, phase: 1 },
  { ox: 0.05, oy: -0.45, phase: 0 },
  { ox: -0.3, oy: 0.3, phase: 1 },
  { ox: 0.45, oy: -0.05, phase: 0 },
];
const RIPPLE_OPACITY_LOW = 0.22;
const RIPPLE_OPACITY_HIGH = 0.42;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return motion.reducedMotionRespect ? reduced : false;
}

export const PondView: React.FC<PondViewProps> = ({ ducks, accessoryTier, size = 240, onDuckPress }) => {
  const reducedMotion = useReducedMotion();
  const ids = ducks.map((d) => d.id);
  const idsKey = ids.join('|');

  const [wander, setWander] = useState<WanderState>(() => initWander(ids));
  const tickRef = useRef(0);

  // Duck roster changed (gained/lost a duck) — reseed the wander state so
  // ids stay in sync; wander.logic assigns role/trajectory purely from id.
  useEffect(() => {
    tickRef.current = 0;
    setWander(initWander(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    if (reducedMotion) return; // frozen: no timer at all
    const interval = setInterval(() => {
      setWander((prev) => wanderStep(prev, tickRef.current));
      tickRef.current += 1;
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [reducedMotion, idsKey]);

  const [rippleFlip, setRippleFlip] = useState(false);
  useEffect(() => {
    if (reducedMotion) return; // frozen: hold the last ripple state
    const interval = setInterval(() => setRippleFlip((v) => !v), RIPPLE_MS);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const count = ducks.length;
  const scale = count <= 3 ? 3 : count <= 7 ? 2.4 : 2;
  const spriteW = SPRITE_W * scale;
  const spriteH = SPRITE_H * scale;
  // Larger flocks scale sprites below the 48px tap-target minimum; pad the
  // touchable area back out symmetrically rather than resizing the sprite
  // itself (a11y hit-slop fix, no visual/layout change).
  const duckHitSlopX = Math.max(0, (48 - spriteW) / 2);
  const duckHitSlopY = Math.max(0, (48 - spriteH) / 2);
  const R = size / 2;
  const margin = Math.max(spriteW, spriteH) / 2 + 8;
  const usable = Math.max(0, R - margin);
  const waterR = usable * WATER_R_FRACTION;

  const wanderById = new Map(wander.ducks.map((d) => [d.id, d] as const));

  const placed = ducks.map((duck) => {
    const w = wanderById.get(duck.id);
    const ox = w?.ox ?? 0;
    const oy = w?.oy ?? 0;
    const cx = R + ox * usable;
    const cy = R + oy * usable;
    return {
      duck,
      left: cx - spriteW / 2,
      top: cy - spriteH / 2,
      flip: w?.flip ?? false,
      animation: w?.animation ?? 'idle',
    };
  });

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Flat pond fill: no gradients, per the aesthetic invariants. */}
        <Circle cx={R} cy={R} r={waterR} fill={color.pondDeep} stroke={color.pondEdge} strokeWidth={6} />
        {RIPPLE_SPOTS.map((spot, i) => {
          const lit = spot.phase === 0 ? rippleFlip : !rippleFlip;
          const cx = R + spot.ox * waterR;
          const cy = R + spot.oy * waterR;
          return (
            <Rect
              key={`ripple-${i}`}
              x={cx - 2}
              y={cy - 2}
              width={4}
              height={4}
              fill={color.pondEdge}
              opacity={lit ? RIPPLE_OPACITY_HIGH : RIPPLE_OPACITY_LOW}
            />
          );
        })}
      </Svg>

      {placed.map(({ duck, left, top, flip, animation }) => {
        const label = duck.name ? `Duck named ${duck.name}. Tap to rename.` : 'Unnamed duck. Tap to name.';
        return (
          <Pressable
            key={duck.id}
            onPress={() => onDuckPress?.(duck)}
            disabled={!onDuckPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={{
              top: duckHitSlopY,
              bottom: duckHitSlopY,
              left: duckHitSlopX,
              right: duckHitSlopX,
            }}
            style={[styles.duck, { left, top, width: spriteW, height: spriteH }]}
          >
            <DuckSprite accessoryTier={accessoryTier} scale={scale} flip={flip} animation={animation} />
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
