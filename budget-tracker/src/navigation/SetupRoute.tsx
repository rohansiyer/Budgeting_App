/**
 * Setup route host (DucksInARow_DesignDoc_v2.md §4 Setup).
 *
 * Resolves the active `Chapter` for the requested {@link SetupMode}, then
 * mounts the adversary-hardened {@link SetupWizard} against it:
 *   - firstRun / edit — ensure a default chapter exists, run setup against it.
 *   - newChapter       — archive the active chapter and start a fresh one
 *                        (via `startNewChapter`), then run setup against it.
 *
 * The wizard's own state machine + validation are untouched; this file only
 * owns chapter lifecycle + navigation seams (land on Home on save, skip to
 * Home on "Explore first"/"Later"). Midnight-themed, full-screen modal.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, type as typo } from '../theme/tokens';
import { HardButton } from '../components/kit';
import { SetupWizard } from '../setup/SetupWizard';
import { prefilledWizardState, type WizardState } from '../setup/wizardState';
import { createStoreSetupWriter } from '../setup/storeSetupWriter';
import { ensureDefaultChapter, startNewChapter } from '../setup/chapterFlow';
import type { SaveResult } from '../setup/save';
import { useBudgetStore } from '../store';
import { todayISO, monthTitle } from '../format/dates';
import type { Chapter } from '../types/contracts';
import type { SetupMode } from './navigationRef';
import { goToTabs } from './navigationRef';

type Phase =
  | { kind: 'preparing' }
  | { kind: 'ready'; chapter: Chapter; initialState?: WizardState }
  | { kind: 'error'; message: string };

export function SetupRoute({ mode }: { mode: SetupMode }) {
  const writer = useMemo(() => createStoreSetupWriter(), []);
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const today = todayISO();
        let chapter: Chapter;
        if (mode === 'newChapter') {
          // Archive the current chapter and open a fresh one (history + flock
          // are untouched — see chapterFlow.ts).
          const result = await startNewChapter(writer, today, monthTitle(today));
          chapter = result.chapter;
        } else {
          chapter = await ensureDefaultChapter(writer, today);
        }
        // Reflect any chapter mutation in the reactive store before the wizard
        // (and the screens behind it) read.
        await useBudgetStore.getState().loadData();
        // Edit mode: seed the wizard with existing config so Save updates in
        // place instead of duplicating (v0.2 verifier finding #1).
        let initialState: WizardState | undefined;
        if (mode === 'edit') {
          const [accounts, incomeSources, categories] = await Promise.all([
            writer.listAccounts(),
            writer.listIncomeSources(),
            writer.listCategories(),
          ]);
          if (accounts.length + incomeSources.length + categories.length > 0) {
            initialState = prefilledWizardState(chapter.name, { accounts, incomeSources, categories });
          }
        }
        if (alive) setPhase({ kind: 'ready', chapter, initialState });
      } catch (e) {
        if (alive) {
          setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Could not start setup.' });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, writer]);

  const skipLabel =
    mode === 'firstRun' ? 'Explore first' : mode === 'newChapter' ? 'Later' : 'Cancel';

  const handleComplete = async (_result: SaveResult) => {
    // Wizard already persisted through the writer; refresh the reactive store
    // so the tabs render the freshly-configured chapter, then land on Home.
    await useBudgetStore.getState().loadData();
    goToTabs('Home');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Text style={styles.heading} accessibilityRole="header">
          {mode === 'newChapter' ? 'New chapter' : 'Set up Ducks in a Row'}
        </Text>
        <HardButton
          label={skipLabel}
          variant="ghost"
          onPress={() => goToTabs('Home')}
          accessibilityLabel={
            mode === 'firstRun'
              ? 'Skip setup and explore the app first'
              : 'Close setup without finishing'
          }
        />
      </View>

      {phase.kind === 'ready' ? (
        <SetupWizard
          writer={writer}
          chapter={phase.chapter}
          initialState={phase.initialState}
          onComplete={handleComplete}
        />
      ) : phase.kind === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't start setup</Text>
          <Text style={styles.errorBody}>{phase.message}</Text>
          <HardButton
            label="Back to app"
            variant="ghost"
            onPress={() => goToTabs('Home')}
            accessibilityLabel="Go back to the app"
          />
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={color.accent} accessibilityLabel="Preparing setup" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  heading: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
    flexShrink: 1,
    marginRight: space.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  errorTitle: {
    color: color.danger,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  errorBody: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    textAlign: 'center',
  },
});

export default SetupRoute;
