import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';

interface TransactionContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const TransactionContextMenu: React.FC<TransactionContextMenuProps> = ({
  visible,
  onClose,
  onEdit,
  onDelete,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} onPress={onEdit}>
            <Ionicons name="pencil" size={20} color={colors.accent.primary} />
            <Text style={styles.menuText}>Edit</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={onDelete}>
            <Ionicons name="trash" size={20} color={colors.status.error} />
            <Text style={[styles.menuText, styles.menuTextDanger]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  menuText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  menuTextDanger: {
    color: colors.status.error,
  },
  divider: {
    height: 1,
    backgroundColor: colors.card,
  },
});
