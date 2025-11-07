import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import {
  formatMonthYear,
  toISODate,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from '../utils/dateUtils';
import {
  formatCurrency,
  calculateCategorySpendingBreakdown,
  calculateSavingsRate,
  calculateIncomeTotal,
  calculateExpenseTotal,
} from '../utils/calculations';
import { DualLayerPieChart } from '../components/DualLayerPieChart';

const AnalyticsScreen = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { transactions, categories, accounts, getTotalBalance } = useBudgetStore();

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const monthTransactions = useMemo(() => {
    const start = toISODate(monthStart);
    const end = toISODate(monthEnd);
    return transactions.filter((txn) => txn.date >= start && txn.date <= end);
  }, [transactions, monthStart, monthEnd]);

  const monthlyIncome = useMemo(
    () => calculateIncomeTotal(monthTransactions),
    [monthTransactions]
  );
  const monthlyExpenses = useMemo(
    () => calculateExpenseTotal(monthTransactions),
    [monthTransactions]
  );
  const savingsRate = useMemo(
    () => calculateSavingsRate(monthlyIncome, monthlyExpenses),
    [monthlyIncome, monthlyExpenses]
  );

  const categorySpending = useMemo(
    () => calculateCategorySpendingBreakdown(monthTransactions, categories),
    [monthTransactions, categories]
  );

  const totalBalance = getTotalBalance(toISODate(monthEnd));

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  return (
    <View style={styles.container}>
      {/* Header with month navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePreviousMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{formatMonthYear(currentMonth)}</Text>
          <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
            <Text style={styles.todayText}>This Month</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Monthly Summary Cards */}
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <Ionicons name="arrow-down-circle" size={24} color={colors.status.success} />
            <Text style={styles.summaryLabel}>Income</Text>
            <Text style={[styles.summaryAmount, styles.incomeText]}>
              {formatCurrency(monthlyIncome)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="arrow-up-circle" size={24} color={colors.status.error} />
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={[styles.summaryAmount, styles.expenseText]}>
              {formatCurrency(monthlyExpenses)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="trending-up" size={24} color={colors.accent.primary} />
            <Text style={styles.summaryLabel}>Savings Rate</Text>
            <Text style={styles.summaryAmount}>{savingsRate.toFixed(1)}%</Text>
          </View>
        </View>

        {/* Total Balance */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
          <View style={styles.accountsList}>
            {accounts.map((acc) => (
              <View key={acc.id} style={styles.accountRow}>
                <Text style={styles.accountName}>{acc.name}</Text>
                <Text style={styles.accountAmount}>
                  {formatCurrency(acc.startingBalance)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Dual-Layer Pie Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Spending This Month</Text>
          <DualLayerPieChart
            data={categorySpending}
            categories={categories}
            size={320}
          />
          <View style={styles.legendContainer}>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { opacity: 0.4 }]} />
                <Text style={styles.legendText}>Planned</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendDot} />
                <Text style={styles.legendText}>Actual</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Category Breakdown */}
        <View style={styles.categorySection}>
          <Text style={styles.sectionTitle}>Category Breakdown</Text>
          {categorySpending
            .filter((item) => item.actual > 0 || item.planned > 0)
            .sort((a, b) => b.actual - a.actual)
            .map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              if (!category) return null;

              const isOverBudget = item.percentage > 100;
              const progressColor = isOverBudget
                ? colors.status.error
                : item.percentage > 80
                ? colors.status.warning
                : colors.status.success;

              return (
                <View key={item.categoryId} style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryTitleRow}>
                      <View
                        style={[styles.categoryDot, { backgroundColor: category.color }]}
                      />
                      <Text style={styles.categoryName}>{category.name}</Text>
                    </View>
                    <Text style={styles.categoryPercentage}>
                      {item.percentage.toFixed(0)}%
                    </Text>
                  </View>

                  <View style={styles.categoryAmounts}>
                    <Text style={styles.categoryActual}>
                      {formatCurrency(item.actual)} <Text style={styles.categoryOf}>of</Text>{' '}
                      {formatCurrency(item.planned)}
                    </Text>
                  </View>

                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: progressColor,
                        },
                      ]}
                    />
                  </View>

                  {isOverBudget && (
                    <Text style={styles.overBudgetText}>
                      Over budget by {formatCurrency(item.actual - item.planned)}
                    </Text>
                  )}
                </View>
              );
            })}
        </View>

        {/* Insights */}
        <View style={styles.insightsSection}>
          <Text style={styles.sectionTitle}>Insights</Text>
          <View style={styles.insightCard}>
            <Ionicons name="information-circle" size={20} color={colors.accent.secondary} />
            <View style={styles.insightText}>
              <Text style={styles.insightTitle}>
                {savingsRate > 20
                  ? 'Great job saving!'
                  : savingsRate > 10
                  ? 'You\'re on track'
                  : 'Consider reducing expenses'}
              </Text>
              <Text style={styles.insightDescription}>
                {savingsRate > 20
                  ? `You're saving ${savingsRate.toFixed(1)}% of your income. Keep it up!`
                  : savingsRate > 10
                  ? `Your savings rate is ${savingsRate.toFixed(1)}%. Try to reach 20% for a healthy buffer.`
                  : `Your savings rate is ${savingsRate.toFixed(1)}%. Look for areas to cut back.`}
              </Text>
            </View>
          </View>

          {categorySpending.some((item) => item.percentage > 100) && (
            <View style={[styles.insightCard, styles.warningCard]}>
              <Ionicons name="warning" size={20} color={colors.status.warning} />
              <View style={styles.insightText}>
                <Text style={styles.insightTitle}>Over-budget categories detected</Text>
                <Text style={styles.insightDescription}>
                  {categorySpending.filter((item) => item.percentage > 100).length} categories
                  are over budget this month.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  navButton: {
    padding: theme.spacing.sm,
  },
  todayButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  todayText: {
    color: colors.accent.primary,
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  summaryCards: {
    flexDirection: 'row',
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  incomeText: {
    color: colors.status.success,
  },
  expenseText: {
    color: colors.status.error,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    margin: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    fontFamily: 'monospace',
    marginBottom: theme.spacing.md,
  },
  accountsList: {
    gap: 8,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accountName: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  accountAmount: {
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  chartSection: {
    backgroundColor: colors.surface,
    margin: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: theme.spacing.md,
    alignSelf: 'flex-start',
  },
  legendContainer: {
    marginTop: theme.spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent.primary,
  },
  legendText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  categorySection: {
    padding: theme.spacing.sm,
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
  categoryTitleRow: {
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
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  categoryPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  categoryAmounts: {
    marginBottom: theme.spacing.sm,
  },
  categoryActual: {
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  categoryOf: {
    fontSize: 12,
    color: colors.text.disabled,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: colors.card,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  overBudgetText: {
    fontSize: 12,
    color: colors.status.error,
    marginTop: 4,
  },
  insightsSection: {
    padding: theme.spacing.sm,
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  warningCard: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.status.warning,
  },
  insightText: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});

export default AnalyticsScreen;
