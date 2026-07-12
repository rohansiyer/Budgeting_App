/**
 * Pure mapping between React Navigation's bottom-tab route list and the kit
 * TabBar's tabs/activeKey contract (kit/types.ts TabBarProps). Split out so it
 * can be unit tested without rendering the navigator (this repo's Jest setup
 * cannot transform JSX — see kit/__tests__ for the rest of the story).
 */
import type { TabDescriptor } from '../components/kit/types';

/** Route name -> the label the kit TabBar renders (handoff v3 §3.1). */
const TAB_LABEL_BY_ROUTE: Record<string, string> = {
  Home: 'HOME',
  Calendar: 'CALENDAR',
  Pond: 'POND',
  Settings: 'SETTINGS',
};

/** Falls back to an uppercased route name for any route not in the known map. */
export function tabLabelForRoute(routeName: string): string {
  return TAB_LABEL_BY_ROUTE[routeName] ?? routeName.toUpperCase();
}

/** Builds the kit TabBar's `tabs` list from the navigator's route names, in order. */
export function buildTabDescriptors(routeNames: readonly string[]): TabDescriptor[] {
  return routeNames.map((name) => ({ key: name, label: tabLabelForRoute(name) }));
}

/** The currently focused route name, or undefined for an out-of-range index. */
export function activeRouteName(
  routeNames: readonly string[],
  index: number,
): string | undefined {
  return routeNames[index];
}
