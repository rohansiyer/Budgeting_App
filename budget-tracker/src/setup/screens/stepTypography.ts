/**
 * Shared "one question per screen" heading styles for the wizard step
 * screens (handoff v3 §3.2, "Wizard step" mockup). Neither `type.title`
 * (24px) nor `type.kpi` (20px but mono, reserved for money/tabular
 * figures) matches the mockup's 20px/800 UI-face question title, so it's
 * composed directly from tokens here rather than bent out of an existing
 * type-scale entry.
 */
import { color, font, type as typeScale } from '../../theme/tokens';

export const stepTitleStyle = {
  fontSize: 20,
  fontWeight: '800' as const,
  letterSpacing: -0.3,
  fontFamily: font.uiBold,
  color: color.text,
};

/** 12px muted subtext under the question title. */
export const stepSubtextStyle = {
  fontSize: typeScale.caption.fontSize,
  fontWeight: typeScale.caption.fontWeight,
  fontFamily: typeScale.caption.fontFamily,
  color: color.textMuted,
};
