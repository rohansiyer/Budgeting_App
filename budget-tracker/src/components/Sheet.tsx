import React, { ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Bottom sheet on Modal: square top edge, hairline border, dimmed backdrop
 * (token bg at reduced opacity — no literal colors). Hosts the borrow
 * confirm, add/edit forms, the Monday prompt and the txn context menu.
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
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={styles.sheet}>
        <View style={styles.headRow}>
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
    backgroundColor: color.bg,
    opacity: 0.82,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopWidth: pixel.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
    paddingBottom: space.xl,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  title: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  close: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
});
