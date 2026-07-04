/**
 * Shared navigation ref + typed navigate helpers.
 *
 * These helpers let any screen drive top-level navigation (open the setup
 * wizard, switch tabs) WITHOUT importing React Navigation param types or the
 * navigator itself — the orchestrator wires Settings to `openSetup` at merge,
 * and screens call `openTab` for cross-tab jumps. All calls are no-ops until
 * the NavigationContainer is mounted, so they are safe to fire eagerly.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootTabParamList } from './RootNavigator';

/**
 * How the Setup route is entered:
 * - `firstRun`  — no accounts yet; skippable first-run gate.
 * - `edit`      — re-enter setup against the active chapter.
 * - `newChapter`— archive the active chapter, start a fresh one, re-run setup.
 */
export type SetupMode = 'firstRun' | 'edit' | 'newChapter';

export type RootStackParamList = {
  Tabs: { screen?: keyof RootTabParamList } | undefined;
  Setup: { mode: SetupMode };
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Open the setup wizard as a full-screen modal. Callable from any screen
 * (e.g. Settings' "Edit setup" / "New chapter") without importing nav types.
 */
export function openSetup(mode: SetupMode = 'edit'): void {
  if (navigationRef.isReady()) navigationRef.navigate('Setup', { mode });
}

/** Switch to a bottom tab, dismissing the Setup modal if it is open. */
export function openTab(tab: keyof RootTabParamList): void {
  if (navigationRef.isReady()) navigationRef.navigate('Tabs', { screen: tab });
}

/** Return to the tab stack (Home by default), collapsing any modal above it. */
export function goToTabs(tab: keyof RootTabParamList = 'Home'): void {
  openTab(tab);
}
