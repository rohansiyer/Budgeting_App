import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import { formatDateDisplay, toISODate } from '../utils/dateUtils';
import { formatCurrency, calculateCategorySpending } from '../utils/calculations';
import { Transaction } from '../types';

interface DailyDetailScreenProps {
  date: Date;
  onClose: () => void;
}

export const DailyDetailScreen: React.FC<DailyDetailScreenProps> = ({ date, onClose }) => {
  const {
    transactions,
    categories,
    accounts,
    incomeConfigs,
    addTransaction,
    getAccountBalance,
  } = useBudgetStore();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('pnc');
  const [hasCheckedPaycheck, setHasCheckedPaycheck] = useState(false);

  const dateStr = toISODate(date);
  const dayTransactions = useMemo(
    () => transactions.filter((txn) => txn.date === dateStr),
    [transactions, dateStr]
  );

  // Check if this is paycheck day and auto-add paycheck if needed
  useEffect(() => {
    if (hasCheckedPaycheck) return;

    const dayOfWeek = date.getDay(); // 0 = Sunday, 3 = Wednesday
    const paycheckConfig = incomeConfigs.find((config) => config.type === 'weekly_paycheck');

    // If it's the configured paycheck day
    if (paycheckConfig && paycheckConfig.dayOfWeek === dayOfWeek && paycheckConfig.amount) {
      const existingPaycheck = dayTransactions.find(
        (txn) => txn.type === 'income' && txn.note?.toLowerCase().includes('paycheck')
      );

      // Only add if no paycheck exists for this day
      if (!existingPaycheck) {
        const addPaychecks = async () => {
          const pncAmount = paycheckConfig.amount! * 0.7; // 70% to PNC
          const dcuAmount = paycheckConfig.amount! * 0.3; // 30% to DCU

          try {
            await addTransaction({
              amount: pncAmount,
              type: 'income',
              categoryId: 'paycheck',
              accountId: 'pnc',
              date: dateStr,
              timestamp: new Date().toISOString(),
              note: 'Weekly Paycheck (PNC)',
            });

            await addTransaction({
              amount: dcuAmount,
              type: 'income',
              categoryId: 'paycheck',
              accountId: 'dcu',
              date: dateStr,
              timestamp: new Date().toISOString(),
              note: 'Weekly Paycheck (DCU)',
            });
          } catch (error) {
            console.error('Error adding automatic paycheck:', error);
          }
        };

        addPaychecks();
      }

      setHasCheckedPaycheck(true);
    } else {
      setHasCheckedPaycheck(true);
    }
  }, [date, incomeConfigs, dayTransactions, hasCheckedPaycheck, addTransaction, dateStr]);

  const incomeTransactions = dayTransactions.filter((txn) => txn.type === 'income');
  const expenseTransactions = dayTransactions.filter((txn) => txn.type === 'expense');

  const dailyIncome = incomeTransactions.reduce((sum, txn) => sum + txn.amount, 0);
  const dailyExpenses = expenseTransactions.reduce((sum, txn) => sum + txn.amount, 0);
  const dailyTotal = dailyIncome - dailyExpenses;

  const handleAddExpense = async (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setShowAddExpense(true);
  };

  const handleAddIncome = () => {
    setShowAddIncome(true);
  };

  const handleSaveExpense = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    await addTransaction({
      amount: parseFloat(amount),
      type: 'expense',
      categoryId: selectedCategoryId,
      accountId: selectedAccountId,
      date: dateStr,
      timestamp: new Date().toISOString(),
      note: note || undefined,
    });

    setAmount('');
    setNote('');
    setShowAddExpense(false);
  };

  const handleSaveIncome = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    await addTransaction({
      amount: parseFloat(amount),
      type: 'income',
      categoryId: 'paycheck',
      accountId: selectedAccountId,
      date: dateStr,
      timestamp: new Date().toISOString(),
      note: note || undefined,
    });

    setAmount('');
    setNote('');
    setShowAddIncome(false);
  };

  const getCategoryTransactions = (categoryId: string) => {
    return expenseTransactions.filter((txn) => txn.categoryId === categoryId);
  };

  const getCategoryTotal = (categoryId: string) => {
    return getCategoryTransactions(categoryId).reduce((sum, txn) => sum + txn.amount, 0);
  };

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{formatDateDisplay(date)}</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView style={styles.content}>
          {/* Income Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>INCOME</Text>
              <TouchableOpacity onPress={handleAddIncome} style={styles.addButton}>
                <Ionicons name="add-circle" size={20} color={colors.accent.primary} />
                <Text style={styles.addButtonText}>Add Income</Text>
              </TouchableOpacity>
            </View>

            {incomeTransactions.length > 0 ? (
              incomeTransactions.map((txn) => (
                <View key={txn.id} style={styles.transactionRow}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionNote}>
                      {txn.note || 'Income'}
                    </Text>
                    <Text style={styles.transactionAccount}>
                      {accounts.find((a) => a.id === txn.accountId)?.name}
                    </Text>
                  </View>
                  <Text style={styles.transactionAmountPositive}>
                    +{formatCurrency(txn.amount)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No income recorded</Text>
            )}
          </View>

          {/* Expenses Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EXPENSES</Text>

            {categories
              .filter((cat) => !cat.recurring)
              .map((category) => {
                const categoryTotal = getCategoryTotal(category.id);
                const categoryTxns = getCategoryTransactions(category.id);
                const budget = category.plannedWeekly || category.plannedMonthly / 4.33;
                const percentage = budget > 0 ? (categoryTotal / budget) * 100 : 0;

                return (
                  <View key={category.id} style={styles.categoryCard}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryBudget}>
                        {formatCurrency(categoryTotal)} / {formatCurrency(budget)}
                      </Text>
                    </View>

                    {/* Progress bar */}
                    <View style={styles.progressBarContainer}>
                      <View
                        style={[
                          styles.progressBar,
                          {
                            width: `${Math.min(percentage, 100)}%`,
                            backgroundColor:
                              percentage > 100
                                ? colors.status.error
                                : percentage > 80
                                ? colors.status.warning
                                : colors.status.success,
                          },
                        ]}
                      />
                    </View>

                    {/* Transactions for this category */}
                    {categoryTxns.map((txn) => (
                      <View key={txn.id} style={styles.expenseRow}>
                        <Text style={styles.expenseNote}>{txn.note || 'Expense'}</Text>
                        <Text style={styles.expenseAmount}>
                          {formatCurrency(txn.amount)}
                        </Text>
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={() => handleAddExpense(category.id)}
                      style={styles.addExpenseButton}
                    >
                      <Ionicons name="add" size={16} color={colors.accent.primary} />
                      <Text style={styles.addExpenseText}>Add expense</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </View>

          {/* Daily Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Daily Total</Text>
            <Text
              style={[
                styles.summaryAmount,
                dailyTotal > 0 && styles.summaryAmountPositive,
                dailyTotal < 0 && styles.summaryAmountNegative,
              ]}
            >
              {dailyTotal > 0 ? '+' : ''}
              {formatCurrency(dailyTotal)}
            </Text>

            <View style={styles.summaryDetails}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryDetailLabel}>Income:</Text>
                <Text style={styles.summaryDetailValue}>
                  +{formatCurrency(dailyIncome)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryDetailLabel}>Expenses:</Text>
                <Text style={styles.summaryDetailValue}>
                  -{formatCurrency(dailyExpenses)}
                </Text>
              </View>
            </View>

            <View style={styles.accountBalancesSection}>
              <Text style={styles.accountBalancesLabel}>Account Balances:</Text>
              {accounts.map((acc) => (
                <View key={acc.id} style={styles.accountBalanceRow}>
                  <Text style={styles.accountName}>{acc.name}:</Text>
                  <Text style={styles.accountBalance}>
                    {formatCurrency(getAccountBalance(acc.id, dateStr))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Add Expense Modal */}
        <Modal
          visible={showAddExpense}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAddExpense(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Add {categories.find((c) => c.id === selectedCategoryId)?.name} Expense
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Amount"
                placeholderTextColor={colors.text.disabled}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />

              <TextInput
                style={styles.input}
                placeholder="Note (optional)"
                placeholderTextColor={colors.text.disabled}
                value={note}
                onChangeText={setNote}
              />

              <Text style={styles.inputLabel}>Account</Text>
              <View style={styles.accountSelector}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountOption,
                      selectedAccountId === acc.id && styles.accountOptionSelected,
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Text
                      style={[
                        styles.accountOptionText,
                        selectedAccountId === acc.id && styles.accountOptionTextSelected,
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowAddExpense(false);
                    setAmount('');
                    setNote('');
                  }}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSave]}
                  onPress={handleSaveExpense}
                >
                  <Text style={styles.modalButtonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Add Income Modal */}
        <Modal
          visible={showAddIncome}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAddIncome(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Income</Text>

              <TextInput
                style={styles.input}
                placeholder="Amount"
                placeholderTextColor={colors.text.disabled}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />

              <TextInput
                style={styles.input}
                placeholder="Note (optional)"
                placeholderTextColor={colors.text.disabled}
                value={note}
                onChangeText={setNote}
              />

              <Text style={styles.inputLabel}>Account</Text>
              <View style={styles.accountSelector}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountOption,
                      selectedAccountId === acc.id && styles.accountOptionSelected,
                    ]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Text
                      style={[
                        styles.accountOptionText,
                        selectedAccountId === acc.id && styles.accountOptionTextSelected,
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowAddIncome(false);
                    setAmount('');
                    setNote('');
                  }}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSave]}
                  onPress={handleSaveIncome}
                >
                  <Text style={styles.modalButtonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: colors.accent.primary,
    fontSize: 14,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionNote: {
    fontSize: 16,
    color: colors.text.primary,
  },
  transactionAccount: {
    fontSize: 12,
    color: colors.text.disabled,
    marginTop: 2,
  },
  transactionAmountPositive: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.status.success,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.disabled,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.sm,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  categoryBudget: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.secondary,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.card,
    borderRadius: 2,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  expenseNote: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  expenseAmount: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.sm,
  },
  addExpenseText: {
    fontSize: 14,
    color: colors.accent.primary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  summaryAmountPositive: {
    color: colors.status.success,
  },
  summaryAmountNegative: {
    color: colors.status.error,
  },
  summaryDetails: {
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryDetailLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  summaryDetailValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  accountBalancesSection: {
    borderTopWidth: 1,
    borderTopColor: colors.card,
    paddingTop: theme.spacing.md,
  },
  accountBalancesLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  accountBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  accountName: {
    fontSize: 14,
    color: colors.text.primary,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
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
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: theme.spacing.md,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  accountSelector: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  accountOption: {
    flex: 1,
    padding: theme.spacing.md,
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
  },
  accountOptionSelected: {
    backgroundColor: colors.accent.primary,
  },
  accountOptionText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  accountOptionTextSelected: {
    color: colors.background,
    fontWeight: 'bold',
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
