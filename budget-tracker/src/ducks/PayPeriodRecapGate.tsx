/**
 * Gate 4 wiring: mid-month pay-period recaps (v0.3 §1.4). Sibling to
 * DuckResultsGate, consumed the same way by App.tsx.
 *
 * DuckResultsGate owns the month-end verdict frame ("Time to count ducks!");
 * this gate presents ONLY mid-month pay-period closes, which carry NO duck
 * verdict (verdicts stay FINAL and monthly, engine.ts). It runs once per app
 * session, and acknowledging advances the persisted recap pointer so a close is
 * shown once and only once.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getPayPeriodRecapEngine, useFlock } from './appEngine';
import { DuckSprite } from './DuckSprite';
import { PAY_PERIOD_RECAP_EYEBROW } from './copy';
import type { PayPeriod } from './payPeriods';
import { color, space, type as typo } from '../theme/tokens';

interface Props {
  /** Called when the user dismisses the recap. */
  onDismiss?: () => void;
}

export function PayPeriodRecapGate({ onDismiss }: Props) {
  const [recaps, setRecaps] = useState<readonly PayPeriod[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const flock = useFlock();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    getPayPeriodRecapEngine()
      .getPendingRecaps(today)
      // Only mid-month closes surface here; month-end closes carry the verdict
      // and are presented by DuckResultsGate.
      .then((pending) => setRecaps(pending.filter((p) => p.kind === 'pay_period')))
      .catch(() => {
        // Pre-wizard / no chapter: never block app entry on the recap flow.
      });
  }, []);

  const acknowledge = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Advance past every pending close (all kinds) so the surface clears; the
    // verdict path is independent of this pointer.
    await getPayPeriodRecapEngine().acknowledgePending(today);
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  if (dismissed || recaps.length === 0 || !flock) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.screen]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{PAY_PERIOD_RECAP_EYEBROW}</Text>
        <Text style={styles.title}>
          {recaps.length === 1 ? 'A pay period closed' : `${recaps.length} pay periods closed`}
        </Text>

        <View style={styles.stage}>
          <DuckSprite accessoryTier={flock.accessoryTier} scale={5} animation="idle" />
        </View>

        {recaps.map((p) => (
          <View key={p.closedOn} style={styles.row} accessibilityRole="text">
            <Text style={styles.rowRange}>{`${p.start} to ${p.end}`}</Text>
            <Text style={styles.rowNote}>Nothing counted yet, ducks are tallied at month end.</Text>
          </View>
        ))}

        <Pressable
          style={styles.cta}
          onPress={acknowledge}
          accessibilityRole="button"
          accessibilityLabel="Dismiss pay period recap"
        >
          <Text style={styles.ctaLabel}>Got it</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default PayPeriodRecapGate;

const styles = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.md, paddingBottom: space.xl },
  eyebrow: { ...typo.sectionLabel, color: color.accent, marginBottom: space.xs },
  title: { ...typo.title, color: color.text, marginBottom: space.sm },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.md },
  row: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingVertical: space.sm,
  },
  rowRange: { ...typo.body, color: color.text },
  rowNote: { ...typo.caption, color: color.textMuted, marginTop: 2 },
  cta: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: color.accent,
    backgroundColor: color.accent,
    borderRadius: 0,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  ctaLabel: { ...typo.body, color: color.bg, fontWeight: '800' },
});
