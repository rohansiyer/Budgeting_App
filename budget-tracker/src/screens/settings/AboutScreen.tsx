import React from 'react';
import { Text, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { Screen, Row } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { useStore } from '../../providers/StoreProvider';

const { color, space } = tokens;
const typo = tokens.type;

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const chapter = store.getActiveChapter();

  return (
    <Screen scroll>
      <SubscreenHeader title="About" onBack={onBack} />

      <InfoRow label="App" value="Ducks in a Row" />
      <InfoRow label="Version" value="2.0.0" />
      <InfoRow label="Chapter" value={chapter.name} />
      <InfoRow label="Theme" value="Midnight" />

      <Text style={styles.footnote}>
        All data lives on this device only — no accounts, no cloud sync, no tracking. Use Backup to
        export or import a copy.
      </Text>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={styles.infoRow}>
      <Text style={styles.rowSub}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  rowSub: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
  infoValue: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  footnote: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.lg,
    lineHeight: 18,
  },
});

export default AboutScreen;
