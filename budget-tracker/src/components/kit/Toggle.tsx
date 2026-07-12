import React from 'react';
import { ChoiceRow } from './ChoiceRow';
import type { ToggleProps } from './types';

/**
 * Two-state square toggle (§3.1). Literally a two-option ChoiceRow so it
 * shares its cell visuals exactly, no pill shape anywhere.
 */
export function Toggle({ value, onValueChange, offLabel, onLabel, accessibilityLabel }: ToggleProps) {
  return (
    <ChoiceRow
      options={[
        { key: 'off', label: offLabel },
        { key: 'on', label: onLabel },
      ]}
      selectedKey={value ? 'on' : 'off'}
      onSelect={(key) => onValueChange(key === 'on')}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export default Toggle;
