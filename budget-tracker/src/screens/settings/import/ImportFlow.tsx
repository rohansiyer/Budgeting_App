import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import * as tokens from '../../../theme/tokens';
import { HardButton, Snackbar } from '../../../components/kit';
import { Screen } from '../../../components/Primitives';
import { SubscreenHeader } from '../SubscreenHeader';
import { useStore } from '../../../providers/StoreProvider';
import { withTransaction } from '../../../store';
import { todayISO } from '../../../format/dates';
import {
  buildImportSession,
  commitImportSession,
  parseImportCsv,
  sessionCounts,
  type CommitResult,
  type ImportCommitPort,
  type MatchContext,
} from '../../../import';
import { pickCsvFile, readCsvFile } from './importFile';
import {
  acceptReviewSuggestion,
  assembleCommitPayload,
  buildReviewState,
  changeReviewCategory,
  commitResultCopy,
  setDuplicateIncluded,
  skipReviewRow,
  toExistingTxns,
  type ImportReviewState,
} from './importFlow.logic';
import { ImportReviewScreen } from './ImportReviewScreen';

const { color, space } = tokens;
const typo = tokens.type;

type Stage =
  | { kind: 'entry' }
  | { kind: 'reading' }
  | { kind: 'review'; state: ImportReviewState; malformedCount: number }
  | { kind: 'committing'; state: ImportReviewState }
  | { kind: 'result'; result: CommitResult }
  | { kind: 'error'; message: string };

/**
 * CSV import flow entry point (v0.3 handoff §3.8, "F11 · Data layer"). Hosted
 * inside BackupScreen's own local state stack (CLAUDE.md: Settings
 * subscreens use the local state stack, not the root navigator) rather than
 * pushed as a fresh navigator route. Owns the whole pick -> parse -> review
 * -> commit sequence; nothing here ever writes without the user hitting the
 * review screen's "Import N transactions" button.
 */
export function ImportFlow({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const [stage, setStage] = useState<Stage>({ kind: 'entry' });

  const accounts = store.listAccounts();
  const spendingAccount = accounts.find((a) => a.kind === 'spending') ?? accounts[0];

  const buildMatchContext = (): MatchContext => ({
    categories: store.listCategories(),
    corrections: store.getMerchantCorrections(),
  });

  const handlePick = async () => {
    setStage({ kind: 'reading' });
    try {
      const picked = await pickCsvFile();
      if (!picked) {
        setStage({ kind: 'entry' }); // cancelled — not an error, nothing to report
        return;
      }
      const text = await readCsvFile(picked.uri);
      const parsed = parseImportCsv(text);
      if (parsed.rows.length === 0) {
        setStage({
          kind: 'error',
          message:
            parsed.malformed.length > 0
              ? `Couldn't read any transactions from ${picked.name}. Every row had a problem: missing or unparseable dates, amounts, or descriptions.`
              : `${picked.name} doesn't have any rows to import.`,
        });
        return;
      }

      const chapter = store.getActiveChapter();
      const ctx = buildMatchContext();
      const existingTransactions = toExistingTxns(
        store.getTransactions({ from: chapter.startedAt, to: todayISO() }),
      );
      const session = buildImportSession(parsed.rows, { ...ctx, existingTransactions });
      const reviewState = buildReviewState(picked.name, session, ctx);
      setStage({ kind: 'review', state: reviewState, malformedCount: parsed.malformed.length });
    } catch (e) {
      setStage({ kind: 'error', message: `Import failed: ${(e as Error).message}` });
    }
  };

  const withReviewState = (fn: (s: ImportReviewState) => ImportReviewState) => {
    if (stage.kind !== 'review') return;
    setStage({ ...stage, state: fn(stage.state) });
  };

  const handleConfirm = async () => {
    if (stage.kind !== 'review' || !spendingAccount) return;
    const reviewState = stage.state;
    setStage({ kind: 'committing', state: reviewState });
    try {
      const decisions = assembleCommitPayload(reviewState, spendingAccount.id);
      const port: ImportCommitPort = {
        withTransaction,
        addExpense: (input) => store.addExpense(input),
        upsertMerchantCorrection: (input) => store.upsertMerchantCorrection(input),
      };
      const result = await commitImportSession(decisions, port);
      setStage({ kind: 'result', result });
    } catch (e) {
      setStage({ kind: 'error', message: `Import failed: ${(e as Error).message}` });
    }
  };

  if (stage.kind === 'review') {
    const counts = sessionCounts({
      matched: [...stage.state.matched],
      needsReview: stage.state.review.map((r) => r.result),
      duplicates: stage.state.duplicates.map((d) => d.dupe),
    });
    return (
      <ImportReviewScreen
        state={stage.state}
        counts={counts}
        categories={store.listCategories()}
        busy={false}
        malformedCount={stage.malformedCount}
        onAccept={(index) => withReviewState((s) => acceptReviewSuggestion(s, index))}
        onChangeCategory={(index, categoryId) =>
          withReviewState((s) => changeReviewCategory(s, index, categoryId))
        }
        onSkip={(index) => withReviewState((s) => skipReviewRow(s, index))}
        onToggleDuplicate={(index, included) =>
          withReviewState((s) => setDuplicateIncluded(s, index, included))
        }
        onConfirm={() => void handleConfirm()}
        onBack={onBack}
      />
    );
  }

  if (stage.kind === 'committing') {
    const counts = sessionCounts({
      matched: [...stage.state.matched],
      needsReview: stage.state.review.map((r) => r.result),
      duplicates: stage.state.duplicates.map((d) => d.dupe),
    });
    return (
      <ImportReviewScreen
        state={stage.state}
        counts={counts}
        categories={store.listCategories()}
        busy
        onAccept={() => {}}
        onChangeCategory={() => {}}
        onSkip={() => {}}
        onToggleDuplicate={() => {}}
        onConfirm={() => {}}
        onBack={onBack}
      />
    );
  }

  if (stage.kind === 'result') {
    return (
      <Screen scroll>
        <SubscreenHeader title="Import CSV" onBack={onBack} />
        <Text style={styles.body}>{commitResultCopy(stage.result)}</Text>
        <Snackbar
          visible
          message={commitResultCopy(stage.result)}
          actionLabel="Done"
          onAction={onBack}
          onTimeout={() => {}}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SubscreenHeader title="Import CSV" onBack={onBack} />
      <Text style={styles.body}>
        Pick a CSV bank or card statement. Matching happens on your phone: merchants are matched
        against your categories and anything you've corrected before; you'll always review what
        it found before anything is written.
      </Text>
      {!spendingAccount ? (
        <Text style={styles.errorText}>
          Add a spending account in Setup before importing a statement.
        </Text>
      ) : null}
      {stage.kind === 'error' ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {stage.message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <HardButton
          label={stage.kind === 'reading' ? 'Reading file…' : 'Choose CSV file'}
          onPress={() => void handlePick()}
          disabled={stage.kind === 'reading' || !spendingAccount}
          accessibilityLabel="Choose a CSV file to import"
        />
      </View>
      <Text style={styles.footerCaption}>
        Matching happens on your phone. Nothing is uploaded, ever.
      </Text>
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
  actions: {
    marginBottom: space.md,
  },
  errorText: {
    color: color.danger,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginBottom: space.md,
  },
  footerCaption: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 18,
    marginTop: space.md,
  },
});

export default ImportFlow;
