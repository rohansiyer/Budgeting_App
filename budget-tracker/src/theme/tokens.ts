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

/**
 * Focus ring (v0.3 § "Type and accessibility patches"). 1px accent outline,
 * offset 2px, no glow. Kit components apply these as a border/outline on
 * their focused state; there is no RN `outline` primitive so consumers
 * translate width/offset into a border + padding adjustment.
 */
export const focus = {
  width: 1,
  offset: 2,
  color: color.accent,
} as const;

/**
 * Font families (v0.3, design handoff § "Type and accessibility patches").
 * Space Grotesk for general UI, Space Mono for money/labels/tabular
 * contexts. Space Grotesk ships no 800 weight, so tokens specced at 800
 * (hero, title) use the 700 (uiBold) face; RN ignores numeric fontWeight
 * once a custom fontFamily is set, so fontWeight is kept only for layout
 * fallback (system-font error path in App.tsx) and is not load-bearing here.
 */
export const font = {
  ui: 'SpaceGrotesk_400Regular',
  uiMedium: 'SpaceGrotesk_500Medium',
  uiSemiBold: 'SpaceGrotesk_600SemiBold',
  uiBold: 'SpaceGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const type = {
  hero: { fontSize: 56, fontWeight: '800' as const, letterSpacing: -1.5, fontFamily: font.uiBold },
  title: { fontSize: 24, fontWeight: '800' as const, fontFamily: font.uiBold },
  /** Mid-importance numbers: envelope remainders, day KPIs, sheet titles, goal amounts. */
  kpi: { fontSize: 20, fontWeight: '700' as const, fontFamily: font.monoBold },
  body: { fontSize: 14, fontWeight: '600' as const, fontFamily: font.uiSemiBold },
  // 11px stays reserved for sectionLabel only; caption is content-bearing text.
  caption: { fontSize: 12, fontWeight: '500' as const, fontFamily: font.uiMedium },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    fontFamily: font.monoBold,
  },
  /** All money and date columns use tabular numerals in the mono face. */
  tabularNums: { fontVariant: ['tabular-nums'] as const, fontFamily: font.mono },
} as const;
