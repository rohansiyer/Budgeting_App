import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, metrics, layout, type } from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { PondScreen } from '../screens/PondScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Pond: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Pixel tab icon: a small square. Filled when focused, outline when not.
 * The Pond tab uses a distinct pond-coloured square as the Team 4 DuckSprite
 * placeholder — swapped for the real sprite icon at merge.
 */
function TabIcon({ focused, pond }: { focused: boolean; pond?: boolean }) {
  const fill = pond ? colors.accent.pond : colors.accent.base;
  return (
    <View
      style={[
        styles.icon,
        {
          backgroundColor: focused ? fill : colors.transparent,
          borderColor: focused ? fill : colors.text.muted,
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
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: colors.text.muted,
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
    backgroundColor: colors.bg.panel,
    borderTopWidth: metrics.hairline,
    borderTopColor: colors.border.hairline,
    height: layout.tabBarHeight,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 1,
  },
  icon: {
    width: 16,
    height: 16,
    borderWidth: metrics.hairline * 2,
    borderRadius: metrics.radius,
  },
});

export default RootNavigator;
