import { buildTabDescriptors, activeRouteName, tabLabelForRoute } from '../TabBar.logic';

describe('tabLabelForRoute', () => {
  test('maps each known tab route to its tracked-uppercase label', () => {
    expect(tabLabelForRoute('Home')).toBe('HOME');
    expect(tabLabelForRoute('Calendar')).toBe('CALENDAR');
    expect(tabLabelForRoute('Pond')).toBe('POND');
    expect(tabLabelForRoute('Settings')).toBe('SETTINGS');
  });

  test('falls back to an uppercased route name for an unknown route', () => {
    expect(tabLabelForRoute('Widgets')).toBe('WIDGETS');
  });
});

describe('buildTabDescriptors', () => {
  test('builds one descriptor per route, in order, keyed by route name', () => {
    expect(buildTabDescriptors(['Home', 'Calendar', 'Pond', 'Settings'])).toEqual([
      { key: 'Home', label: 'HOME' },
      { key: 'Calendar', label: 'CALENDAR' },
      { key: 'Pond', label: 'POND' },
      { key: 'Settings', label: 'SETTINGS' },
    ]);
  });

  test('empty route list yields an empty tab list', () => {
    expect(buildTabDescriptors([])).toEqual([]);
  });
});

describe('activeRouteName', () => {
  const routes = ['Home', 'Calendar', 'Pond', 'Settings'];

  test('resolves the route name at the focused index', () => {
    expect(activeRouteName(routes, 0)).toBe('Home');
    expect(activeRouteName(routes, 2)).toBe('Pond');
  });

  test('returns undefined for an out-of-range index', () => {
    expect(activeRouteName(routes, 99)).toBeUndefined();
    expect(activeRouteName(routes, -1)).toBeUndefined();
  });
});
