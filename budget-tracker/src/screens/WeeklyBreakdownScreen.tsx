import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import { formatWeekRange, toISODate } from '../utils/dateUtils';
import { formatCurrency, calculateWeeklyBreakdown } from '../utils/calculations';

interface WeeklyBreakdownScreenProps {
  weekStart: Date;
  weekEnd: Date;
  onClose: () => void;
}

export const WeeklyBreakdownScreen: React.FC<WeeklyBreakdownScreenProps> = ({
  weekStart,
  weekEnd,
  onClose,
}) => {
  const { transactions, accounts, categories } = useBudgetStore();

  const weeklyData = useMemo(() => {
    return calculateWeeklyBreakdown(
      transactions,
      accounts,
      toISODate(weekStart),
      toISODate(weekEnd)
    );
  }, [transactions, accounts, weekStart, weekEnd]);

  const getCategoryName = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.name || 'Other';
  };

  const getCategoryColor = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId)?.color || colors.categories.other;
  };

  return (
    <Modal animationType="slide" transparent={false} visible={true}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {formatWeekRange(weekStart, weekEnd)}
          </Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView style={styles.content}>
          {/* Starting Balance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Starting Balance</Text>
            <View style={styles.card}>
              {accounts.map((acc) => (
                <View key={acc.id} style={styles.balanceRow}>
                  <Text style={styles.accountLabel}>{acc.name}:</Text>
                  <Text style={styles.accountAmount}>
                    {formatCurrency(weeklyData.startingBalance[acc.id] || 0)}
                  </Text>
                </View>
              ))}
              <View style={[styles.balanceRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalAmount}>
                  {formatCurrency(
                    Object.values(weeklyData.startingBalance).reduce((sum, val) => sum + val, 0)
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Income This Week */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Income This Week</Text>
            <View style={styles.card}>
              {Object.entries(weeklyData.income.byCategory).length > 0 ? (
                <>
                  {Object.entries(weeklyData.income.byCategory).map(([categoryId, amount]) => (
                    <View key={categoryId} style={styles.categoryRow}>
                      <View style={styles.categoryInfo}>
                        <View
                          style={[
                            styles.categoryDot,
                            { backgroundColor: getCategoryColor(categoryId) },
                          ]}
                        />
                        <Text style={styles.categoryName}>{getCategoryName(categoryId)}</Text>
                      </View>
                      <Text style={styles.incomeAmount}>+{formatCurrency(amount)}</Text>
                    </View>
                  ))}
                  <View style={[styles.categoryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total:</Text>
                    <Text style={styles.incomeAmountTotal}>
                      +{formatCurrency(weeklyData.income.total)}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>No income this week</Text>
              )}
            </View>
          </View>

          {/* Expenses This Week */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expenses This Week</Text>
            <View style={styles.card}>
              {Object.entries(weeklyData.expenses.byCategory).length > 0 ? (
                <>
                  {Object.entries(weeklyData.expenses.byCategory)
                    .sort(([, a], [, b]) => b - a) // Sort by amount descending
                    .map(([categoryId, amount]) => {
                      const category = categories.find((c) => c.id === categoryId);
                      const budget = category
                        ? category.plannedWeekly || category.plannedMonthly / 4.33
                        : 0;
                      const percentage = budget > 0 ? (amount / budget) * 100 : 0;

                      return (
                        <View key={categoryId} style={styles.expenseCard}>
                          <View style={styles.categoryRow}>
                            <View style={styles.categoryInfo}>
                              <View
                                style={[
                                  styles.categoryDot,
                                  { backgroundColor: getCategoryColor(categoryId) },
                                ]}
                              />
                              <Text style={styles.categoryName}>
                                {getCategoryName(categoryId)}
                              </Text>
                            </View>
                            <Text style={styles.expenseAmount}>
                              -{formatCurrency(amount)}
                            </Text>
                          </View>
                          {budget > 0 && (
                            <>
                              <Text style={styles.budgetText}>
                                Budget: {formatCurrency(budget)} ({percentage.toFixed(0)}%)
                              </Text>
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
                            </>
                          )}
                        </View>
                      );
                    })}
                  <View style={[styles.categoryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total:</Text>
                    <Text style={styles.expenseAmountTotal}>
                      -{formatCurrency(weeklyData.expenses.total)}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>No expenses this week</Text>
              )}
            </View>
          </View>

          {/* Ending Balance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ending Balance</Text>
            <View style={styles.card}>
              {accounts.map((acc) => (
                <View key={acc.id} style={styles.balanceRow}>
                  <Text style={styles.accountLabel}>{acc.name}:</Text>
                  <Text style={styles.accountAmount}>
                    {formatCurrency(weeklyData.endingBalance[acc.id] || 0)}
                  </Text>
                </View>
              ))}
              <View style={[styles.balanceRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalAmount}>
                  {formatCurrency(
                    Object.values(weeklyData.endingBalance).reduce((sum, val) => sum + val, 0)
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Net Change Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Net Change</Text>
            <Text
              style={[
                styles.summaryAmount,
                weeklyData.netChange > 0 && styles.summaryAmountPositive,
                weeklyData.netChange < 0 && styles.summaryAmountNegative,
              ]}
            >
              {weeklyData.netChange > 0 ? '+' : ''}
              {formatCurrency(weeklyData.netChange)}
            </Text>
            {weeklyData.netChange > 0 ? (
              <View style={styles.summaryIcon}>
                <Ionicons name="trending-up" size={32} color={colors.status.success} />
              </View>
            ) : weeklyData.netChange < 0 ? (
              <View style={styles.summaryIcon}>
                <Ionicons name="trending-down" size={32} color={colors.status.error} />
              </View>
            ) : null}
          </View>
        </ScrollView>
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
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.secondary,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  accountLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  accountAmount: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.card,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    fontSize: 14,
    color: colors.text.primary,
  },
  incomeAmount: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.status.success,
  },
  incomeAmountTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.status.success,
  },
  expenseCard: {
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  expenseAmount: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  expenseAmountTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.status.error,
  },
  budgetText: {
    fontSize: 12,
    color: colors.text.disabled,
    marginTop: 4,
    marginLeft: 24,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.card,
    borderRadius: 2,
    marginTop: 6,
    marginLeft: 24,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.disabled,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    padding: theme.spacing.lg,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
  summaryAmountPositive: {
    color: colors.status.success,
  },
  summaryAmountNegative: {
    color: colors.status.error,
  },
  summaryIcon: {
    marginTop: theme.spacing.sm,
  },
});
