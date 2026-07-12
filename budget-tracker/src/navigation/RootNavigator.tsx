import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as tokens from '../theme/tokens';
import { TabBar } from '../components/kit';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { PondScreen } from '../screens/PondScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SafeToSpendLedger } from '../screens/ledger/SafeToSpendLedger';
import { EnvelopeLedgerScreen } from '../screens/ledger/EnvelopeLedgerScreen';
import { SetupRoute } from './SetupRoute';
import { openSetup, openSafeToSpendLedger, openEnvelopeLedger } from './navigationRef';
import { buildTabDescriptors, activeRouteName } from './TabBar.logic';
import type { RootStackParamList } from './navigationRef';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

const { color } = tokens;

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Pond: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Adapts React Navigation's bottom-tab state/events to the kit TabBar's
 * tabs/activeKey/onPress contract (handoff v3 §3.1: the one fixed chrome
 * element, 56px, mint underline). Emits the standard `tabPress` event before
 * navigating so any per-screen listeners (e.g. scroll-to-top on re-tap) keep
 * working exactly as they would with the default tab bar.
 */
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tabs = buildTabDescriptors(state.routeNames);
  const activeName = activeRouteName(state.routeNames, state.index);

  return (
    <View style={[styles.tabBarWrap, { paddingBottom: insets.bottom }]}>
      <TabBar
        tabs={tabs}
        activeKey={activeName ?? tabs[0]?.key ?? ''}
        onPress={(key) => {
          const route = state.routes.find((r) => r.name === key);
          if (!route) return;
          const isFocused = route.name === activeName;
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
      />
    </View>
  );
}

/** The four-tab shell — Home / Calendar / Pond / Settings. */
export const TabsNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Home">
        {() => (
          <HomeScreen
            onOpenLedger={() => openSafeToSpendLedger()}
            onOpenEnvelope={(categoryId) => openEnvelopeLedger(categoryId)}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Pond" component={PondScreen} />
      <Tab.Screen name="Settings">
        {() => <SettingsScreen onOpenSetup={(mode) => openSetup(mode)} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

/** Route wrapper: reads the `mode` param and hands it to the setup host. */
function SetupScreen({ route }: { route: { params: RootStackParamList['Setup'] } }) {
  return <SetupRoute mode={route.params?.mode ?? 'edit'} />;
}

type LedgerNavProps = NativeStackScreenProps<RootStackParamList, 'SafeToSpendLedger'>;
type EnvelopeLedgerNavProps = NativeStackScreenProps<RootStackParamList, 'EnvelopeLedger'>;

/**
 * Route wrapper for the safe-to-spend drill-down (v0.3 §3.7). Mounted as a
 * full-screen modal on the root stack — the same "local full-screen overlay"
 * shape DailyDetailScreen uses via AppShell, reached through React Navigation
 * since AppShell.tsx belongs to a different wave's ownership this round.
 */
function SafeToSpendLedgerRoute({ navigation }: LedgerNavProps) {
  return (
    <SafeToSpendLedger
      onClose={() => navigation.goBack()}
      onOpenEnvelope={(categoryId) => openEnvelopeLedger(categoryId)}
    />
  );
}

/** Route wrapper for one envelope's full ledger. */
function EnvelopeLedgerRoute({ route, navigation }: EnvelopeLedgerNavProps) {
  return (
    <EnvelopeLedgerScreen
      categoryId={route.params.categoryId}
      onClose={() => navigation.goBack()}
    />
  );
}

/**
 * Root navigator: the tab shell wrapped in a native stack so the setup wizard
 * can present full-screen over the tabs (first-run gate, "Edit setup", "New
 * chapter"). Tabs are always the base route; Setup is a modal above them.
 */
export const RootNavigator = () => {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
      }}
    >
      <RootStack.Screen name="Tabs" component={TabsNavigator} />
      <RootStack.Screen
        name="Setup"
        component={SetupScreen}
        options={{ presentation: 'fullScreenModal' }}
        initialParams={{ mode: 'edit' }}
      />
      <RootStack.Screen
        name="SafeToSpendLedger"
        component={SafeToSpendLedgerRoute}
        options={{ presentation: 'fullScreenModal' }}
      />
      <RootStack.Screen
        name="EnvelopeLedger"
        component={EnvelopeLedgerRoute}
        options={{ presentation: 'fullScreenModal' }}
      />
    </RootStack.Navigator>
  );
};

const styles = StyleSheet.create({
  // The kit TabBar itself is a fixed 56px; this wrap just extends its
  // `surface` background under the safe area so the inset reads as part of
  // the same fixed chrome element rather than a gap (handoff v3 §3.1).
  tabBarWrap: {
    backgroundColor: color.surface,
  },
});

export default RootNavigator;
