import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as tokens from '../../theme/tokens';
import { HardButton } from '../../components/kit';
import { Screen } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { exportBackup, importBackupFromPicker } from '../../backup/exportImport';
import { createDrizzleBackupPort } from '../../backup/drizzleBackupPort';
import { BackupValidationError } from '../../backup/types';
import { LAST_BACKUP_EXPORT_KEY, IMPORT_CONFIRM_TITLE, IMPORT_CONFIRM_MESSAGE, formatExportTimestamp } from './config';

const { color, space } = tokens;
const typo = tokens.type;

type Feedback = { kind: 'success' | 'error'; text: string } | null;

export function BackupScreen({ onBack }: { onBack: () => void }) {
  // Real Drizzle-backed port (CONTRACTS.md: backup ships wired to Team 1's
  // schema, not the fake port used by the module's own unit tests).
  const port = useMemo(() => createDrizzleBackupPort(), []);
  const [lastExportIso, setLastExportIso] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LAST_BACKUP_EXPORT_KEY).then((v) => {
      if (!cancelled) setLastExportIso(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = async () => {
    setFeedback(null);
    setExporting(true);
    try {
      const result = await exportBackup(port);
      await AsyncStorage.setItem(LAST_BACKUP_EXPORT_KEY, result.file.exportedAt);
      setLastExportIso(result.file.exportedAt);
      setFeedback({ kind: 'success', text: 'Backup exported and ready to share.' });
    } catch (e) {
      setFeedback({ kind: 'error', text: `Export failed: ${(e as Error).message}` });
    } finally {
      setExporting(false);
    }
  };

  const runImport = async () => {
    setFeedback(null);
    setImporting(true);
    try {
      const outcome = await importBackupFromPicker(port);
      if (outcome === null) {
        // User cancelled the file picker — not an error, nothing to report.
        return;
      }
      setFeedback({ kind: 'success', text: 'Backup imported. Your data has been replaced.' });
    } catch (e) {
      if (e instanceof BackupValidationError) {
        const detail = e.issues.length ? ` (${e.issues.join('; ')})` : '';
        setFeedback({ kind: 'error', text: `That file isn't a valid backup${detail}.` });
      } else {
        setFeedback({ kind: 'error', text: `Import failed: ${(e as Error).message}` });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleImportPress = () => {
    Alert.alert(IMPORT_CONFIRM_TITLE, IMPORT_CONFIRM_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace everything', style: 'destructive', onPress: () => void runImport() },
    ]);
  };

  const lastExportLabel = formatExportTimestamp(lastExportIso);
  const busy = exporting || importing;

  return (
    <Screen scroll>
      <SubscreenHeader title="Backup" onBack={onBack} />

      <Text style={styles.body}>
        Export writes every account, envelope, transaction, and duck to a file you choose where to
        save (Drive, email, local storage, …). Import replaces everything currently in the app with
        a previously exported file.
      </Text>

      <Text style={styles.lastExport}>
        {lastExportLabel ? `Last export: ${lastExportLabel}` : 'No export yet on this device.'}
      </Text>

      <View style={styles.actions}>
        <HardButton
          label={exporting ? 'Exporting…' : 'Export backup'}
          onPress={() => void handleExport()}
          disabled={busy}
          accessibilityLabel="Export backup and open the share sheet"
        />
        <HardButton
          label={importing ? 'Importing…' : 'Import backup'}
          variant="danger"
          onPress={handleImportPress}
          disabled={busy}
          accessibilityLabel="Import a backup file, replacing all current data"
        />
      </View>

      {busy ? <ActivityIndicator color={color.accent} style={styles.spinner} /> : null}

      {feedback ? (
        <Text
          style={[
            styles.feedback,
            feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess,
          ]}
          accessibilityLiveRegion="polite"
        >
          {feedback.text}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 20,
    marginBottom: space.md,
  },
  lastExport: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginBottom: space.lg,
  },
  actions: {
    marginBottom: space.md,
  },
  spinner: {
    marginBottom: space.md,
  },
  feedback: {
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
  },
  feedbackSuccess: {
    color: color.accent,
  },
  feedbackError: {
    color: color.danger,
  },
});

export default BackupScreen;
