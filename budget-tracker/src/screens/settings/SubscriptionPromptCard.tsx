import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { PixelBox, HardButton, CategoryChip } from '../../components/kit';
import type { SubscriptionCandidate } from '../../import';
import { subscriptionPromptCopy, titleCaseMerchant } from './subscriptionPrompt.logic';

const { color, space } = tokens;
const typo = tokens.type;

/**
 * "Looks like a subscription" PixelBox (handoff v3 §3.8 mockup "Subscription
 * detection · an insight rule"): pink CategoryChip identity mark, the
 * deterministic sentence, primary "Mark as bill" / ghost "Ignore".
 */
export function SubscriptionPromptCard({
  candidate,
  onMarkAsBill,
  onIgnore,
}: {
  candidate: SubscriptionCandidate;
  onMarkAsBill: () => void;
  onIgnore: () => void;
}) {
  const name = titleCaseMerchant(candidate.merchant);

  return (
    <PixelBox style={styles.card}>
      <View style={styles.headerRow}>
        <CategoryChip colorKey="pink" size={11} />
        <Text style={styles.headerText}>Looks like a subscription</Text>
      </View>
      <Text style={styles.body}>{subscriptionPromptCopy(candidate)}</Text>
      <View style={styles.actions}>
        <HardButton
          label="Mark as bill"
          onPress={onMarkAsBill}
          accessibilityLabel={`Mark ${name} as a recurring bill, reserved from safe to spend`}
        />
        <HardButton
          label="Ignore"
          variant="ghost"
          onPress={onIgnore}
          accessibilityLabel={`Ignore the ${name} subscription suggestion`}
        />
      </View>
    </PixelBox>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  headerText: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  body: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 20,
    marginBottom: space.md,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
});

export default SubscriptionPromptCard;
