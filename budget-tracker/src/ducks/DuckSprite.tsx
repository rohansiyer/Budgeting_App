/**
 * Team 4 (Pond) — DuckSprite renderer.
 *
 * Implements the DuckSpriteProps contract (src/components/kit/types.ts) by
 * drawing sprite cells as react-native-svg <Rect>s. Motion is STEPPED (one
 * discrete frame at a time, never interpolated) at the cadence in the motion
 * tokens. Reduced motion → a single static frame, no timers.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Svg, { Rect, G } from 'react-native-svg';
import { motion } from '../theme/tokens';
import type { DuckSpriteProps } from '../components/kit/types';
import {
  COLORS,
  FRAMES,
  resolveCells,
  SPRITE_H,
  SPRITE_W,
  type AnimationName,
  type Frame,
} from './sprites';

/**
 * v0.3 adds swim/float/preen to AnimationName; DuckSpriteProps (kit/types)
 * still lists only the v0.2 names for source compatibility with existing
 * callers. Extend optionally here so new callers (e.g. the Pond) can reach
 * the new animations without widening the shared contract type.
 */
type DuckSpriteExtendedProps = Omit<DuckSpriteProps, 'animation'> & {
  animation?: AnimationName;
};

/** Idle/swim/float loop forever; the one-shot animations fire onAnimationEnd and settle. */
const LOOPING: Record<AnimationName, boolean> = {
  idle: true,
  'waddle-in': false,
  'walk-off': false,
  'happy-dance': false,
  swim: true,
  float: true,
  preen: false,
};

function frameDurationMs(animation: AnimationName, frame: Frame): number {
  // Explicit override wins (e.g. preen's uneven 900/350/1200/350 holds).
  if (frame.durationMs != null) return frame.durationMs;
  const hold = frame.hold ?? 1;
  if (animation === 'idle') {
    // 2-frame bob spread across the bob period.
    return (motion.bobPeriodMs / FRAMES.idle.length) * hold;
  }
  return (1000 / motion.spriteFps) * hold;
}

export const DuckSprite: React.FC<DuckSpriteExtendedProps> = ({
  accessoryTier,
  scale,
  flip = false,
  animation = 'idle',
  onAnimationEnd,
}) => {
  const frames = FRAMES[animation];
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);

  // Respect the OS reduced-motion setting (contract: reduced-motion → static).
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Reset when the animation changes.
  useEffect(() => {
    setIndex(0);
    endedRef.current = false;
  }, [animation]);

  useEffect(() => {
    if (motion.reducedMotionRespect && reduceMotion) {
      // Static: hold the first frame, but still honor onAnimationEnd once so
      // callers waiting on a transition don't hang.
      if (!LOOPING[animation] && !endedRef.current) {
        endedRef.current = true;
        onAnimationEnd?.();
      }
      return;
    }
    const current = frames[index] ?? frames[0];
    timer.current = setTimeout(() => {
      setIndex((i) => {
        const next = i + 1;
        if (next >= frames.length) {
          if (LOOPING[animation]) return 0;
          if (!endedRef.current) {
            endedRef.current = true;
            onAnimationEnd?.();
          }
          return i; // settle on the last frame
        }
        return next;
      });
    }, frameDurationMs(animation, current));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, animation, frames, reduceMotion, onAnimationEnd]);

  const frame = frames[index] ?? frames[0];
  const effectiveFlip = flip !== Boolean(frame.flipX); // XOR: prop flip vs per-frame look-back
  const cells = resolveCells(frame.grid, accessoryTier);
  const width = SPRITE_W * scale;
  const height = SPRITE_H * scale;

  return (
    <Svg
      width={width}
      height={height}
      accessibilityRole="image"
      accessibilityLabel="Pixel duck"
    >
      <G
        transform={effectiveFlip ? `translate(${width}, 0) scale(-1, 1)` : undefined}
      >
        {cells.map((cell) => {
          const hex = COLORS[cell.ch];
          if (!hex) return null;
          return (
            <Rect
              key={`${cell.r}:${cell.c}`}
              x={cell.c * scale}
              y={cell.r * scale}
              width={scale}
              height={scale}
              fill={hex}
            />
          );
        })}
      </G>
    </Svg>
  );
};

export default DuckSprite;
