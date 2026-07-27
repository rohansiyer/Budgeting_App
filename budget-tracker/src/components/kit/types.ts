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
import type { KeyboardTypeOptions, StyleProp, ViewStyle } from 'react-native';
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
  /**
   * 'envelope' (default): spent > available renders the danger/overflow
   * color (overspending a budget is bad). 'goal': spent >= available (target
   * met or exceeded) renders in the normal fill/accent color — hitting or
   * beating a savings goal is a good outcome, never a danger color.
   */
  variant?: 'envelope' | 'goal';
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
  animation?: 'idle' | 'waddle-in' | 'walk-off' | 'happy-dance' | 'swim' | 'float' | 'preen';
  onAnimationEnd?: () => void;
}

/**
 * WAVE-1 CONTRACT — Form-layer kit (handoff v3 §3.1, "the missing component
 * layer"). Same treatment rules as WAVE-0: no rounded cards, square corners
 * only, every touchable REQUIRES accessibilityLabel, token colors only.
 */

/**
 * Text/amount input. 48px min height, `surfaceDeep` well, 1px `border`.
 * Focused swaps the border to `accent` (1px, no glow); `error` swaps it to
 * `danger` and renders a message line below the well. Label renders above in
 * the 11px tracked-uppercase `sectionLabel` style.
 */
export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  /** Danger border + message line when set. */
  error?: string;
  accessibilityLabel: string;
}

/** One option in a ChoiceRow / Toggle. */
export interface ChoiceOption {
  key: string;
  label: string;
}

/**
 * Segmented options built from ghost-HardButton-style square cells in a row.
 * The selected cell gets an `accent` border + `accent` text; unselected
 * cells stay `border` + `textMuted`. Never pill-shaped.
 */
export interface ChoiceRowProps {
  options: readonly ChoiceOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  accessibilityLabel: string;
}

/** Two-state square toggle sharing ChoiceRow's cell visuals (no pill shape). */
export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Cell label shown when value is false / true. */
  offLabel: string;
  onLabel: string;
  accessibilityLabel: string;
}

/**
 * Wizard progress: N discrete blocks, 8px tall, 3px gaps (`pixel.blockGap`).
 * Filled = `accent`, unfilled = `surfaceDeep` + 1px border. Never renders as
 * a continuous bar.
 */
export interface StepTrackProps {
  total: number;
  completed: number;
  accessibilityLabel: string;
}

/**
 * Transient undo bar ("undo, never confirm" — handoff v3 §4 copy rules).
 * `surface` bg, 1px border, message left + ghost HardButton action right.
 * Self-dismisses after `durationMs` (default ~5000) unless the host flips
 * `visible` off first; the timer is cleared on unmount either way.
 */
export interface SnackbarProps {
  message: string;
  /** Default "Undo". */
  actionLabel?: string;
  /** Omit for a message-only snackbar (no action button rendered). */
  onAction?: () => void;
  onTimeout?: () => void;
  durationMs?: number;
  visible: boolean;
}

/** One tab descriptor for TabBar. */
export interface TabDescriptor {
  key: string;
  label: string;
}

/**
 * The one fixed chrome element (handoff v3 §3.1). 56px tall, `surface` bg,
 * top hairline. Active tab = `text` color + a 24x3px `accent` underline
 * block; inactive = `textMuted`. Each tab is a 48px-min touch target.
 * Presentational only — wiring to navigation lands in a later wave.
 */
export interface TabBarProps {
  tabs: readonly TabDescriptor[];
  activeKey: string;
  onPress: (key: string) => void;
}

/**
 * Zero-state block: PixelBox + duck slot + one sentence + one action.
 * Follows DuckChipSlot's inject seam (`renderDuck`/`duckProps`) so kit stays
 * decoupled from `src/ducks`; a pixel-square fallback holds the layout until
 * a renderer is supplied.
 */
export interface EmptyStateProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  duckProps?: Partial<DuckSpriteProps>;
  renderDuck?: (props: DuckSpriteProps) => ReactNode;
  accessibilityLabel: string;
}

/**
 * CategoryChip + one plain-language sentence, the dollar figure rendered in
 * mono `accent`. Explicit `prefix`/`amountText`/`suffix` parts keep the money
 * text exact rather than templating a string. Hairline top divider, full
 * bleed like RuledList rows.
 */
export interface InsightRowProps {
  colorKey: import('../../types/contracts').CategoryColorKey;
  prefix: string;
  /** Pre-formatted dollar figure, e.g. "$26.60"; rendered mono + accent. */
  amountText: string;
  suffix?: string;
  accessibilityLabel?: string;
}

/** One column's input for SparkBlocks. */
export interface SparkColumn {
  label: string;
  value: Cents;
}

/**
 * Vertical BlockMeter-style columns for multi-month trends. One block =
 * `blockValue`; `maxBlocks` caps a column's height so a single outlier month
 * can't dwarf the rest. Discrete blocks only, never a smooth bar.
 */
export interface SparkBlocksProps {
  columns: readonly SparkColumn[];
  blockValue: Cents;
  maxBlocks?: number;
  accessibilityLabel: string;
}
