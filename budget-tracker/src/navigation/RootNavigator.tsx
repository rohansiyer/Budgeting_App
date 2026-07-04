import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as tokens from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { PondScreen } from '../screens/PondScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SetupRoute } from './SetupRoute';
import { openSetup } from './navigationRef';
import type { RootStackParamList } from './navigationRef';

const { color, pixel } = tokens;
const typo = tokens.type;

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Pond: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Pixel tab icon: a square — filled when focused, outlined when not. The Pond
 * tab's pond-tinted square is the placeholder for Team 4's DuckSprite icon,
 * swapped at merge.
 */
function TabIcon({ focused, pond }: { focused: boolean; pond?: boolean }) {
  const tint = pond ? color.pondEdge : color.accent;
  return (
    <View
      style={[
        styles.icon,
        {
          backgroundColor: focused ? tint : color.bg,
          borderColor: focused ? tint : color.textMuted,
        },
      ]}
    />
  );
}

/** The four-tab shell — Home / Calendar / Pond / Settings. */
export const TabsNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: color.text,
        tabBarInactiveTintColor: color.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} /> }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} /> }}
      />
      <Tab.Screen
        name="Pond"
        component={PondScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} pond /> }}
      />
      <Tab.Screen
        name="Settings"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} /> }}
      >
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
    </RootStack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: color.surface,
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.border,
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
  icon: {
    width: 16,
    height: 16,
    borderWidth: pixel.hairlineWidth * 2,
  },
});

export default RootNavigator;
