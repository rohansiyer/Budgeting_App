import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as tokens from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { PondScreen } from '../screens/PondScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

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

export const RootNavigator = () => {
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
        component={SettingsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} /> }}
      />
    </Tab.Navigator>
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
