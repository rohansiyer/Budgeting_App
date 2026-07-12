import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { SettingsRoot } from './settings/SettingsRoot';
import { BackupScreen } from './settings/BackupScreen';
import { SecurityScreen } from './settings/SecurityScreen';
import { NotificationsScreen } from './settings/NotificationsScreen';
import { BillsScreen } from './settings/BillsScreen';
import { SearchLedgerScreen } from './settings/SearchLedgerScreen';
import { GoalsScreen } from './goals/GoalsScreen';
import { AboutScreen } from './settings/AboutScreen';
import {
  NEW_CHAPTER_CONFIRM_TITLE,
  NEW_CHAPTER_CONFIRM_MESSAGE,
  RootSettingsItem,
  SetupMode,
  SettingsRouteName,
} from './settings/config';

export type { SetupMode } from './settings/config';

/**
 * Typed seam the orchestrator wires to the root Setup route at merge (Team
 * 2's setup wizard). 'edit' opens the existing setup for editing; 'newChapter'
 * opens it after the user has confirmed archiving the current one.
 */
export type OnOpenSetup = (mode: SetupMode) => void;

export interface SettingsScreenProps {
  onOpenSetup?: OnOpenSetup;
}

// wired by orchestrator to the root Setup route at merge
const noopOpenSetup: OnOpenSetup = () => {};

/**
 * Settings tab. Renders its own small self-contained "stack" — plain React
 * state driving which subscreen is on top, no navigator library involved —
 * so Backup/Security/Notifications/About can be pushed and popped without
 * touching src/navigation/RootNavigator.tsx or App.tsx, which are owned by a
 * different in-flight agent for this release.
 */
export function SettingsScreen({ onOpenSetup = noopOpenSetup }: SettingsScreenProps) {
  const [route, setRoute] = useState<SettingsRouteName>('root');

  const goRoot = useCallback(() => setRoute('root'), []);

  const handleSelect = useCallback(
    (id: RootSettingsItem['id']) => {
      switch (id) {
        case 'setup':
          onOpenSetup('edit');
          break;
        case 'newChapter':
          Alert.alert(NEW_CHAPTER_CONFIRM_TITLE, NEW_CHAPTER_CONFIRM_MESSAGE, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Start new chapter', onPress: () => onOpenSetup('newChapter') },
          ]);
          break;
        case 'backup':
        case 'security':
        case 'notifications':
        case 'bills':
        case 'searchLedger':
        case 'goals':
        case 'about':
          setRoute(id);
          break;
      }
    },
    [onOpenSetup],
  );

  switch (route) {
    case 'backup':
      return <BackupScreen onBack={goRoot} />;
    case 'security':
      return <SecurityScreen onBack={goRoot} />;
    case 'notifications':
      return <NotificationsScreen onBack={goRoot} />;
    case 'bills':
      return <BillsScreen onBack={goRoot} />;
    case 'searchLedger':
      return <SearchLedgerScreen onBack={goRoot} />;
    case 'goals':
      return <GoalsScreen onBack={goRoot} />;
    case 'about':
      return <AboutScreen onBack={goRoot} />;
    case 'root':
    default:
      return <SettingsRoot onSelect={handleSelect} />;
  }
}

export default SettingsScreen;
