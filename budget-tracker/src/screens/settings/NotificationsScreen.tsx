import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { RuledList } from '../../components/kit';
import { Screen, Row } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { getAllNotificationSettings, setNotificationKindEnabled } from '../../notifications/settings';
import { getPermissionState, requestPermission } from '../../notifications/permissions';
import { scheduleBillReminder, cancelBillReminder } from '../../notifications/scheduler';
import type { NotificationKind } from '../../notifications/types';
import { NOTIFICATION_TOGGLES, NotificationToggleConfig } from './config';

const { color, space } = tokens;
const typo = tokens.type;

type EnabledMap = Record<NotificationKind, boolean>;
type DeniedMap = Partial<Record<NotificationKind, boolean>>;

export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<EnabledMap>({
    billReminder: false,
    envelopeWarning: false,
    payday: false,
  });
  const [denied, setDenied] = useState<DeniedMap>({});

  useEffect(() => {
    let cancelled = false;
    getAllNotificationSettings().then((settings) => {
      if (!cancelled) {
        setEnabled(settings);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async (kind: NotificationKind, value: boolean) => {
    setDenied((d) => ({ ...d, [kind]: false }));

    if (!value) {
      setEnabled((s) => ({ ...s, [kind]: false }));
      await setNotificationKindEnabled(kind, false);
      if (kind === 'billReminder') await cancelBillReminder();
      return;
    }

    // Turning on: gate on OS permission, requesting it if not yet determined.
    let permission = await getPermissionState();
    if (permission !== 'granted') {
      permission = await requestPermission();
    }
    if (permission !== 'granted') {
      // Denied (or dismissed) — toggle stays off, surface why inline.
      setDenied((d) => ({ ...d, [kind]: true }));
      return;
    }

    setEnabled((s) => ({ ...s, [kind]: true }));
    await setNotificationKindEnabled(kind, true);
    if (kind === 'billReminder') await scheduleBillReminder();
  }, []);

  if (loading) {
    return (
      <Screen scroll>
        <SubscreenHeader title="Notifications" onBack={onBack} />
        <Text style={styles.hint}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SubscreenHeader title="Notifications" onBack={onBack} />

      <RuledList<NotificationToggleConfig>
        data={NOTIFICATION_TOGGLES}
        keyExtractor={(t) => t.kind}
        renderRow={(t) => (
          <View>
            <Row style={styles.toggleRow}>
              <View style={styles.toggleMeta}>
                <Text style={styles.rowTitle}>{t.title}</Text>
                <Text style={styles.rowSub}>{t.subtitle}</Text>
              </View>
              <Switch
                value={enabled[t.kind]}
                onValueChange={(v) => void handleToggle(t.kind, v)}
                trackColor={{ false: color.surface, true: color.accent }}
                thumbColor={color.text}
                accessibilityLabel={`${t.title}, currently ${enabled[t.kind] ? 'on' : 'off'}`}
              />
            </Row>
            {denied[t.kind] ? (
              <Text style={styles.deniedText} accessibilityLiveRegion="polite">
                Notifications are turned off for this app in system settings, so {t.title.toLowerCase()}{' '}
                couldn't be enabled. Allow notifications in your device Settings, then try again.
              </Text>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: color.textMuted,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
  toggleRow: {
    justifyContent: 'space-between',
  },
  toggleMeta: {
    flex: 1,
    marginRight: space.md,
  },
  rowTitle: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  rowSub: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: 2,
  },
  deniedText: {
    color: color.danger,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.xs,
    lineHeight: 16,
  },
});

export default NotificationsScreen;
