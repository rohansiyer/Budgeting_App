/**
 * Gate 4 wiring: monthly-evaluation catch-up on app open (§9.6).
 * Runs evaluatePendingMonthsDetailed once per app session; when new
 * verdicts were issued, presents the Results flow as a full-screen
 * overlay before the user continues into the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ResultsScreen } from './ResultsScreen';
import { getDuckEngine, useFlock } from './appEngine';
import { useBudgetStore } from '../store';
import type { DuckEvaluation } from '../types/contracts';
import { color } from '../theme/tokens';

interface Props {
  /** Called when the user chooses "Visit the pond". */
  onGoToPond: () => void;
}

export function DuckResultsGate({ onGoToPond }: Props) {
  const [results, setResults] = useState<
    ReadonlyArray<{ evaluation: DuckEvaluation; bigWin: boolean }>
  >([]);
  const [dismissed, setDismissed] = useState(false);
  const [flockKey, setFlockKey] = useState(0);
  const flock = useFlock(flockKey);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    getDuckEngine()
      .evaluatePendingMonthsDetailed(today)
      .then((issued) => {
        if (issued.length > 0) {
          setResults(issued);
          setFlockKey((k) => k + 1);
        }
      })
      .catch(() => {
        // No chapter yet (pre-wizard) or recoverable duck-state error:
        // never block app entry on the results flow.
      });
  }, []);

  const nameDuck = useCallback(async (duckId: string, name: string) => {
    await useBudgetStore.getState().duckPersistence.renameDuck(duckId, name);
    setFlockKey((k) => k + 1);
  }, []);

  if (dismissed || results.length === 0 || !flock) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color.bg }]}>
      <ResultsScreen
        results={results}
        flock={flock}
        onNameDuck={nameDuck}
        onGoToPond={() => {
          setDismissed(true);
          onGoToPond();
        }}
        onReviewBills={() => setDismissed(true)}
      />
    </View>
  );
}
