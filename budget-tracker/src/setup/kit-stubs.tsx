// TODO(team3): replace with real kit — these are placeholder
// implementations of src/components/kit/types.ts only good enough for
// the setup wizard (Team 2) to compile and be exercised in Expo Go
// before Team 3's real component kit lands. They follow the token/
// a11y rules (no literal colors, accessibilityLabel everywhere) so
// swapping them out is a drop-in replacement, not a rewrite.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type {
  BlockMeterProps,
  CategoryChipProps,
  DuckSpriteProps,
  HardButtonProps,
  PixelBoxProps,
  RuledListProps,
} from '../components/kit/types';
import { color, pixel, space, type } from '../theme/tokens';

export function PixelBox({ children, padded, style }: PixelBoxProps) {
  return (
    <View
      style={[
        {
          borderWidth: pixel.hairlineWidth,
          borderColor: color.border,
          backgroundColor: color.surface,
          padding: padded === false ? 0 : space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function BlockMeter({
  budget,
  spent,
  blockValue,
  bonus,
  debt,
  warnAt = 0.9,
  accessibilityLabel,
}: BlockMeterProps) {
  const totalBlocks = Math.max(1, Math.floor(budget / Math.max(1, blockValue)));
  const remaining = budget + (bonus ?? 0) - spent - (debt ?? 0);
  const fraction = budget > 0 ? Math.min(1, Math.max(0, spent / budget)) : 0;
  const fillColor = spent > budget ? color.danger : fraction >= warnAt ? color.warn : color.accent;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: `${remaining} of ${budget} remaining` }}
      style={{ flexDirection: 'row', gap: pixel.blockGap }}
    >
      {Array.from({ length: totalBlocks }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 10,
            height: pixel.blockHeight,
            backgroundColor: i * blockValue < spent ? fillColor : color.hairline,
            borderWidth: pixel.hairlineWidth,
            borderColor: color.border,
          }}
        />
      ))}
    </View>
  );
}

export function HardButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  accessibilityLabel,
}: HardButtonProps) {
  const bg =
    variant === 'danger' ? color.danger : variant === 'ghost' ? color.surface : color.accent;
  const textColor = variant === 'ghost' ? color.text : color.bg;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        backgroundColor: bg,
        opacity: disabled ? 0.5 : 1,
        borderWidth: pixel.hairlineWidth,
        borderColor: color.border,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        // Hard offset shadow, no elevation/blur (§3 — square, pixel-true).
        shadowColor: color.bg,
        shadowOffset: { width: pixel.shadowOffset, height: pixel.shadowOffset },
        shadowOpacity: 1,
        shadowRadius: 0,
      }}
    >
      <Text style={[type.body, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function RuledList<T>({ data, renderRow, keyExtractor, sectionLabel }: RuledListProps<T>) {
  return (
    <View>
      {sectionLabel ? (
        <Text style={[type.sectionLabel, { color: color.textMuted, marginBottom: space.xs }]}>
          {sectionLabel}
        </Text>
      ) : null}
      {data.map((item, index) => (
        <View
          key={keyExtractor(item)}
          style={{
            borderBottomWidth: pixel.hairlineWidth,
            borderBottomColor: color.hairline,
            paddingVertical: space.sm,
          }}
        >
          {renderRow(item, index)}
        </View>
      ))}
    </View>
  );
}

export function CategoryChip({ colorKey, size = 11 }: CategoryChipProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color.category[colorKey],
        borderWidth: pixel.hairlineWidth,
        borderColor: color.border,
      }}
    />
  );
}

export function DuckSprite({ scale }: DuckSpriteProps) {
  // Setup wizard never renders live ducks; a static placeholder square is
  // enough for this stub to satisfy the prop contract if a screen imports it.
  return (
    <View
      accessible
      accessibilityLabel="duck"
      style={{ width: 14 * scale, height: 12 * scale, backgroundColor: color.accent }}
    />
  );
}
