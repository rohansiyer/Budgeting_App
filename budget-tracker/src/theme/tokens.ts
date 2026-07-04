/**
 * Ducks in a Row — "Midnight" design tokens (v2).
 *
 * CONTRACT FILE / single source of truth for colour + spatial values.
 * RULE: no literal hex may appear anywhere else in the app. Every component,
 * screen and SVG pulls colour from here.
 *
 * The pixel/blocky system is defined by fixed spatial constants — the numbers
 * the spec pins down: notch 4px, block gap 3px, hard-shadow 3px, hairline 1px.
 * Corners are square (radius 0) everywhere; PixelBox chamfers with a 4px notch.
 */

import { Platform } from 'react-native';
import type { ColorKey } from '../types/contracts';

/** Raw palette — the only place hex literals are allowed. */
const palette = {
  // Midnight surfaces (cool near-black, faintly blue).
  ink: '#0E0E13',
  panel: '#16161E',
  panelRaised: '#1E1E28',
  panelSunken: '#0A0A0F',

  // Hairlines / borders.
  line: '#2C2C38',
  lineStrong: '#3D3D4C',

  // Hard shadow is pure black, always offset — never blurred.
  shadow: '#000000',

  // Text.
  textPrimary: '#F1F1F5',
  textSecondary: '#9EA0B0',
  textMuted: '#65667A',
  textOnAccent: '#0E0E13',

  // Brand accent (midnight violet) + pond teal.
  accent: '#7C5CFC',
  accentDim: '#4B3E8F',
  pond: '#31C7B6',

  // Semantic status.
  income: '#3FB984',
  spend: '#F2635A',
  overflow: '#F2A93B',
  payday: '#5AA9F2',

  transparent: 'transparent',
  scrim: 'rgba(6,6,10,0.72)',

  // Category swatches.
  catRent: '#4C8DF2',
  catFood: '#3FB984',
  catGas: '#E8C23D',
  catFun: '#F2913B',
  catUtilities: '#2FB6A8',
  catCar: '#A265D6',
  catInsurance: '#5C6BD6',
  catOther: '#7A7A88',
} as const;

export const colors = {
  bg: {
    base: palette.ink,
    panel: palette.panel,
    raised: palette.panelRaised,
    sunken: palette.panelSunken,
  },
  border: {
    hairline: palette.line,
    strong: palette.lineStrong,
  },
  shadow: palette.shadow,
  text: {
    primary: palette.textPrimary,
    secondary: palette.textSecondary,
    muted: palette.textMuted,
    onAccent: palette.textOnAccent,
  },
  accent: {
    base: palette.accent,
    dim: palette.accentDim,
    pond: palette.pond,
  },
  status: {
    income: palette.income,
    spend: palette.spend,
    overflow: palette.overflow,
    payday: palette.payday,
  },
  /** Envelope carryover-state colours (keyed by EnvelopeState). */
  envelope: {
    normal: palette.accent,
    bonus: palette.income,
    debt: palette.spend,
    overflow: palette.overflow,
    borrowed: palette.accent,
    rolled: palette.pond,
  },
  transparent: palette.transparent,
  scrim: palette.scrim,
} as const;

/** Category key -> swatch. Only route category colour through this map. */
export const categoryColors: Record<ColorKey, string> = {
  rent: palette.catRent,
  food: palette.catFood,
  gas: palette.catGas,
  fun: palette.catFun,
  utilities: palette.catUtilities,
  car: palette.catCar,
  insurance: palette.catInsurance,
  other: palette.catOther,
};

/**
 * Spatial constants. The load-bearing pixel values from the spec are named
 * explicitly so they can never drift.
 */
export const metrics = {
  notch: 4, // PixelBox chamfer
  blockGap: 3, // BlockMeter segment gap
  hardShadow: 3, // HardButton offset
  hairline: 1, // border width
  radius: 0, // square everything
} as const;

/** 4px base spacing scale. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const type = {
  family: {
    // System UI for text; monospace for every money numeral (spec).
    text: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  size: {
    micro: 11,
    caption: 13,
    body: 15,
    label: 17,
    title: 22,
    hero: 40,
  },
  weight: {
    regular: '400',
    medium: '600',
    bold: '800',
  },
} as const;

export const layout = {
  screenPadding: space.lg,
  tabBarHeight: 60,
  blockMeter: {
    height: 18,
    minSegment: 8,
  },
  touchTarget: 48,
} as const;

export type Colors = typeof colors;
export const tokens = { colors, categoryColors, metrics, space, type, layout } as const;
export default tokens;
