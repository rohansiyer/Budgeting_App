/**
 * WAVE-0 CONTRACT — Component kit API (Team 3 implements in this directory)
 *
 * Treatment rules (DucksInARow_DesignDoc_v2.md §3):
 * - RuledList for anything read as a list (transactions, settings).
 * - PixelBox ONLY for game objects: envelopes, goals, pond, prompts.
 * - No rounded-card containers anywhere.
 * - Every interactive component REQUIRES accessibilityLabel.
 */

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Cents } from '../../lib/money';

/** Square container with 4px pixel-notched corners and 1px border. */
export interface PixelBoxProps {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Segmented envelope meter. Renders floor(budget/blockValue) base blocks,
 * outlined bonus blocks for rolled-in amounts, hollowed danger blocks for
 * borrow repayments, and a filled danger block on overflow.
 * Announces state via accessibilityValue (e.g. "33 dollars left of 112").
 */
export interface BlockMeterProps {
  budget: Cents;
  spent: Cents;
  /** Dollar value of one block, e.g. cents(1000) = $10. */
  blockValue: Cents;
  bonus?: Cents; // rolled in
  debt?: Cents; // repaying / borrowed against
  /** 0..1 fraction at which fill turns warn color. Default 0.9. */
  warnAt?: number;
  accessibilityLabel: string;
}

/** Square button with hard 3px offset shadow. */
export interface HardButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  accessibilityLabel: string;
}

/** Hairline-divided list; rows are full-bleed, no container. */
export interface RuledListProps<T> {
  data: readonly T[];
  renderRow: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
  /** Uppercase micro-label rendered above the list. */
  sectionLabel?: string;
}

/** Category identity chip (square, 11px). Never an emoji. */
export interface CategoryChipProps {
  colorKey: import('../../types/contracts').CategoryColorKey;
  size?: number;
}

/**
 * Duck sprite renderer (Team 4 provides sprite data; Team 3 provides the
 * host view). Stepped animation only; disable on reduced motion.
 */
export interface DuckSpriteProps {
  accessoryTier: 0 | 1 | 2 | 3;
  scale: number;
  flip?: boolean;
  animation?: 'idle' | 'waddle-in' | 'walk-off' | 'happy-dance';
  onAnimationEnd?: () => void;
}
