/**
 * Component kit contract (v2). CONTRACT FILE — Team 3 authors, other teams
 * consume. Implementations in this folder must match these props exactly.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';
import type {
  ColorKey,
  DuckSpriteProps,
  EnvelopeState,
} from '../../types/contracts';

/** Square container with 4px notched (chamfered) corners and a 1px border. */
export interface PixelBoxProps {
  children?: ReactNode;
  /** Fill colour token value. Defaults to the panel surface. */
  fill?: string;
  /** Border colour token value. Defaults to the hairline. */
  borderColor?: string;
  /** Corner notch size in px. Defaults to the 4px spec value. */
  notch?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  /** Passthrough for grouping semantics / labels. */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Segmented block progress meter. Renders `blocks` cells with a 3px gap.
 * State drives colour + overflow/bonus rendering; always exposes an
 * accessibilityValue and a text fallback for the colour-only state.
 */
export interface BlockMeterProps {
  /** Current value (spent / saved). */
  value: number;
  /** Plan / target the blocks represent. */
  max: number;
  /** Segment count. */
  blocks?: number;
  /** Carryover-aware state (bonus / debt / overflow / borrowed / rolled). */
  state?: EnvelopeState;
  /** Signed carryover, rendered as leading/hanging blocks when non-zero. */
  carryover?: number;
  /** Overrides the auto colour (e.g. category swatch). */
  fillColor?: string;
  height?: number;
  /** Visible label placed above the meter. */
  label?: string;
  /** Human-readable value text ("$18 of $40 · borrowed"). Falls back to auto. */
  valueText?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Chunky button with a 3px hard offset shadow; pressed state sinks into it. */
export interface HardButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  /** Optional leading node (e.g. a swatch square) — no emoji. */
  leading?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export interface RuledListItem {
  key: string;
}

/** Divider-ruled list — hairline separators, never rounded cards. */
export interface RuledListProps<T extends RuledListItem> {
  data: T[];
  renderItem: (item: T, index: number) => ReactNode;
  onPressItem?: (item: T, index: number) => void;
  onLongPressItem?: (item: T, index: number) => void;
  /** Rendered when data is empty. */
  emptyLabel?: string;
  itemAccessibilityLabel?: (item: T, index: number) => string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Small square category tag: swatch + label. */
export interface CategoryChipProps {
  label: string;
  colorKey: ColorKey;
  selected?: boolean;
  onPress?: () => void;
  /** Optional trailing amount text. */
  amountText?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Team 4 seam: a duck-chip slot on Home and the pond-centre slot on Pond.
 * Both accept a render function for Team 4's DuckSprite; until merge they draw
 * an on-brand placeholder square.
 */
export interface DuckSlotProps {
  size?: number;
  duckProps?: DuckSpriteProps;
  /** Team 4 injects their sprite renderer here at merge. */
  renderDuck?: (props: DuckSpriteProps) => ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
