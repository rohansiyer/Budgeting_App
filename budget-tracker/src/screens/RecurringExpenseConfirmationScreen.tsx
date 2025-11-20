import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import { formatCurrency } from '../utils/calculations';
import { toISODate } from '../utils/dateUtils';

interface RecurringItem {
  categoryId: string;
  name: string;
  confirmed: boolean;
  skipped: boolean;
  amount: number;
  defaultAmount: number;
  color: string;
}

interface RecurringExpenseConfirmationScreenProps {
  month: string; // YYYY-MM
  onClose: () => void;
}

export const RecurringExpenseConfirmationScreen: React.FC<
  RecurringExpenseConfirmationScreenProps
> = ({ month, onClose }) => {
  const { categories, accounts, getAccountBalance, addTransaction } = useBudgetStore();

  const [items, setItems] = useState<RecurringItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  useEffect(() => {
    // Initialize recurring items from categories
    const recurringCategories = categories.filter((cat) => cat.recurring);
    const initialItems: RecurringItem[] = recurringCategories.map((cat) => ({
      categoryId: cat.id,
      name: cat.name,
      confirmed: false,
      skipped: false,
      amount: cat.plannedMonthly,
      defaultAmount: cat.plannedMonthly,
      color: cat.color,
    }));
    setItems(initialItems);
  }, [categories]);

  const totalAmount = items
    .filter((item) => !item.skipped)
    .reduce((sum, item) => sum + item.amount, 0);

  const pncBalance = getAccountBalance('pnc', `${month}-01`);
  const afterDeduction = pncBalance - totalAmount;

  const toggleConfirm = (categoryId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.categoryId === categoryId && !item.skipped
          ? { ...item, confirmed: !item.confirmed }
          : item
      )
    );
  };

  const handleEdit = (categoryId: string, currentAmount: number) => {
    setEditingItem(categoryId);
    setEditAmount(currentAmount.toString());
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number');
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.categoryId === editingItem ? { ...item, amount: newAmount } : item
      )
    );

    setEditingItem(null);
    setEditAmount('');
  };

  const handleSkip = (categoryId: string) => {
    const item = items.find((i) => i.categoryId === categoryId);
    if (!item) return;

    Alert.alert(
      'Skip Expense',
      `Skip ${item.name} ($${item.amount.toFixed(2)}) for ${new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => {
            setItems((prev) =>
              prev.map((i) =>
                i.categoryId === categoryId
                  ? { ...i, skipped: true, confirmed: false }
                  : i
              )
            );
          },
        },
      ]
    );
  };

  const handleUnskip = (categoryId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.categoryId === categoryId ? { ...item, skipped: false } : item
      )
    );
  };

  const handleConfirmAll = async () => {
    const unconfirmedItems = items.filter((item) => !item.confirmed && !item.skipped);

    if (unconfirmedItems.length > 0) {
      Alert.alert(
        'Incomplete Confirmation',
        `You have ${unconfirmedItems.length} unconfirmed items. Confirm all first or skip them.`
      );
      return;
    }

    const confirmedItems = items.filter((item) => item.confirmed);

    if (confirmedItems.length === 0) {
      Alert.alert('No Items', 'No expenses confirmed. Please confirm at least one item.');
      return;
    }

    // Create transactions for confirmed items on the 1st of the month
    const firstOfMonth = `${month}-01`;
    const timestamp = new Date(`${firstOfMonth}T00:00:00`).toISOString();

    try {
      for (const item of confirmedItems) {
        await addTransaction({
          amount: item.amount,
          type: 'expense',
          categoryId: item.categoryId,
          accountId: 'pnc', // All recurring expenses from PNC
          date: firstOfMonth,
          timestamp,
          note: `Monthly ${item.name}`,
        });
      }

      Alert.alert('Success', 'Recurring expenses have been recorded!', [
        { text: 'OK', onPress: onClose },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to record expenses. Please try again.');
      console.error('Error confirming recurring expenses:', error);
    }
  };

  const handleReviewLater = () => {
    Alert.alert(
      'Review Later',
      'You can access this screen anytime from Settings > Manage Recurring Bills',
      [{ text: 'OK', onPress: onClose }]
    );
  };

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Monthly Recurring - {new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.content}>
          {/* Recurring Items */}
          {items.map((item) => (
            <View
              key={item.categoryId}
              style={[
                styles.itemCard,
                item.skipped && styles.itemCardSkipped,
              ]}
            >
              <View style={styles.itemRow}>
                <TouchableOpacity
                  onPress={() => toggleConfirm(item.categoryId)}
                  disabled={item.skipped}
                  style={styles.checkbox}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      item.confirmed && styles.checkboxBoxChecked,
                      item.skipped && styles.checkboxBoxDisabled,
                    ]}
                  >
                    {item.confirmed && (
                      <Ionicons name="checkmark" size={16} color={colors.background} />
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.itemInfo}>
                  <View style={styles.itemNameRow}>
                    <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
                    <Text
                      style={[
                        styles.itemName,
                        item.skipped && styles.itemNameSkipped,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.itemAmount,
                      item.skipped && styles.itemAmountSkipped,
                    ]}
                  >
                    {formatCurrency(item.amount)}
                  </Text>
                </View>

                <View style={styles.itemActions}>
                  {!item.skipped ? (
                    <>
                      <TouchableOpacity
                        onPress={() => handleEdit(item.categoryId, item.amount)}
                        style={styles.actionButton}
                      >
                        <Text style={styles.actionButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSkip(item.categoryId)}
                        style={styles.actionButton}
                      >
                        <Text style={[styles.actionButtonText, styles.skipText]}>Skip</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleUnskip(item.categoryId)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionButtonText}>Restore</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {item.amount !== item.defaultAmount && !item.skipped && (
                <Text style={styles.editNote}>
                  Edited from {formatCurrency(item.defaultAmount)}
                </Text>
              )}
            </View>
          ))}

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total:</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(totalAmount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>PNC Balance:</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(pncBalance)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
              <Text style={styles.summaryLabelBold}>After Deduction:</Text>
              <Text
                style={[
                  styles.summaryAmountBold,
                  afterDeduction < 0 && styles.summaryAmountNegative,
                ]}
              >
                {formatCurrency(afterDeduction)}
              </Text>
            </View>
            {afterDeduction < 0 && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={20} color={colors.status.warning} />
                <Text style={styles.warningText}>
                  Insufficient funds! You may need to skip some expenses.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={handleReviewLater} style={styles.footerButton}>
            <Text style={styles.footerButtonText}>Review Later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleConfirmAll}
            style={[styles.footerButton, styles.footerButtonPrimary]}
          >
            <Text style={styles.footerButtonTextPrimary}>Confirm All</Text>
          </TouchableOpacity>
        </View>

        {/* Edit Amount Modal */}
        <Modal
          visible={editingItem !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setEditingItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Amount</Text>
              <Text style={styles.modalSubtitle}>
                {items.find((i) => i.categoryId === editingItem)?.name}
              </Text>
              <Text style={styles.modalNote}>
                This change applies to this month only
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Amount"
                placeholderTextColor={colors.text.disabled}
                keyboardType="decimal-pad"
                value={editAmount}
                onChangeText={setEditAmount}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setEditingItem(null);
                    setEditAmount('');
                  }}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSave]}
                  onPress={handleSaveEdit}
                >
                  <Text style={styles.modalButtonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
  },
  closeButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  itemCardSkipped: {
    opacity: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: theme.spacing.sm,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.text.secondary,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  checkboxBoxDisabled: {
    borderColor: colors.text.disabled,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  itemNameSkipped: {
    textDecorationLine: 'line-through',
    color: colors.text.disabled,
  },
  itemAmount: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.secondary,
  },
  itemAmountSkipped: {
    color: colors.text.disabled,
  },
  itemActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  actionButtonText: {
    fontSize: 14,
    color: colors.accent.primary,
  },
  skipText: {
    color: colors.status.warning,
  },
  editNote: {
    fontSize: 12,
    color: colors.accent.secondary,
    marginTop: theme.spacing.xs,
    marginLeft: 32,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  summaryRowHighlight: {
    borderTopWidth: 1,
    borderTopColor: colors.card,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  summaryLabelBold: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  summaryAmount: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  summaryAmountBold: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  summaryAmountNegative: {
    color: colors.status.error,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: `${colors.status.warning}20`,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginTop: theme.spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.status.warning,
  },
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.card,
  },
  footerButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  footerButtonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  footerButtonText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  footerButtonTextPrimary: {
    fontSize: 16,
    color: colors.background,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  modalNote: {
    fontSize: 12,
    color: colors.accent.secondary,
    marginBottom: theme.spacing.md,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.card,
  },
  modalButtonSave: {
    backgroundColor: colors.accent.primary,
  },
  modalButtonText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  modalButtonTextPrimary: {
    fontSize: 16,
    color: colors.background,
    fontWeight: 'bold',
  },
});
