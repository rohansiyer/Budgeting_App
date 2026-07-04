import React, { ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, metrics, space, type } from '../theme/tokens';

/**
 * Bottom sheet built on Modal. Square top edge, hairline border, hard backdrop.
 * Used for the borrow-confirm sheet, add expense/income forms and the
 * transaction context menu.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={styles.sheet}>
        <View style={styles.handleRow}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Text style={styles.close}>CLOSE</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg.panel,
    borderTopWidth: metrics.hairline,
    borderColor: colors.border.strong,
    borderRadius: metrics.radius,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  handleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  title: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.title,
    fontWeight: type.weight.bold,
  },
  close: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    letterSpacing: 1.5,
  },
});
