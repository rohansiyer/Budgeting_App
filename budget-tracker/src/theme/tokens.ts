/**
 * WAVE-0 CONTRACT — Midnight design tokens
 *
 * Single-theme (dark by design, DucksInARow_DesignDoc_v2.md §3).
 * Components consume ONLY these tokens — no literal colors in screens.
 * Category palette is CVD-validated against `surface`; do not reorder
 * adjacent hues in charts without re-validating.
 */

export const color = {
  bg: '#060707',
  surface: '#131917',
  surfaceDeep: '#0C100F',
  border: '#2E3833',
  hairline: '#1C2422',
  text: '#EAF2EE',
  textSecondary: '#C9D6D0',
  textMuted: '#7C8A84',

  accent: '#46E0B4', // mint — positive / brand / payday
  warn: '#F2B84B', // envelope ≥90%
  danger: '#E0645C', // over budget / duck loss / rent spike
  spendFill: '#2E7D68', // week-bar ordinary spend

  pondEdge: '#17454E',
  pondDeep: '#0C262D',

  category: {
    violet: '#9D6FE0', // Fixed
    amber: '#BA8329', // Food
    mint: '#2FA383', // Savings
    blue: '#5B82D9', // Gas / Transit
    pink: '#C75E86', // Fun
  },
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Pixel-HUD constants (§3 container treatment). */
export const pixel = {
  /** Corner notch size for PixelBox clip. */
  notch: 4,
  /** Gap between BlockMeter segments. */
  blockGap: 3,
  blockHeight: 12,
  /** HardButton offset shadow. */
  shadowOffset: 3,
  hairlineWidth: 1,
} as const;

/** Motion: stepped, never smooth (pixel-true). */
export const motion = {
  /** 2-frame idle bob period (ms). */
  bobPeriodMs: 1150,
  /** Frames per second for waddle/walk sequences. */
  spriteFps: 5,
  reducedMotionRespect: true,
} as const;

export const type = {
  hero: { fontSize: 56, fontWeight: '800' as const, letterSpacing: -1.5 },
  title: { fontSize: 24, fontWeight: '800' as const },
  body: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 11.5, fontWeight: '500' as const },
  sectionLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  /** All money and date columns use tabular numerals. */
  tabularNums: { fontVariant: ['tabular-nums'] as const },
} as const;
