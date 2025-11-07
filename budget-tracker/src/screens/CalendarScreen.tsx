import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import {
  getDaysInWeek,
  getWeekBoundaries,
  formatWeekRange,
  toISODate,
  getPreviousWeek,
  getNextWeek,
  isToday,
  format,
  formatMonthYear,
  addMonths,
  subMonths,
} from '../utils/dateUtils';
import { calculateDailyTotal, formatCurrency } from '../utils/calculations';
import { MonthlyCalendarView } from '../components/MonthlyCalendarView';
import { DailyDetailScreen } from './DailyDetailScreen';

const CalendarScreen = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { transactions, accounts, getAccountBalance, isLoading, loadData } =
    useBudgetStore();

  useEffect(() => {
    loadData();
  }, []);

  const { start: weekStart, end: weekEnd } = getWeekBoundaries(currentDate);
  const daysInWeek = getDaysInWeek(currentDate);

  const startingBalance = accounts.reduce((total, acc) => {
    return total + getAccountBalance(acc.id, toISODate(weekStart));
  }, 0);

  const endingBalance = accounts.reduce((total, acc) => {
    return total + getAccountBalance(acc.id, toISODate(weekEnd));
  }, 0);

  const handlePrevious = () => {
    if (viewMode === 'week') {
      setCurrentDate(getPreviousWeek(currentDate));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(getNextWeek(currentDate));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'week' ? 'month' : 'week');
  };

  const getHeaderTitle = () => {
    if (viewMode === 'week') {
      return formatWeekRange(weekStart, weekEnd);
    } else {
      return formatMonthYear(currentDate);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with navigation */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevious} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={handleToday} style={styles.todayButton}>
              <Text style={styles.todayText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleViewMode} style={styles.viewModeButton}>
              <Ionicons
                name={viewMode === 'week' ? 'calendar' : 'list'}
                size={16}
                color={colors.accent.primary}
              />
              <Text style={styles.viewModeText}>
                {viewMode === 'week' ? 'Month' : 'Week'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={handleNext} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {viewMode === 'week' ? (
        <>
          {/* Starting balance */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Starting Balance</Text>
            <View style={styles.accountBalances}>
              {accounts.map((acc) => (
                <Text key={acc.id} style={styles.accountText}>
                  {acc.name}: {formatCurrency(getAccountBalance(acc.id, toISODate(weekStart)))}
                </Text>
              ))}
            </View>
          </View>

          {/* Weekly calendar grid */}
          <ScrollView style={styles.scrollView}>
            <View style={styles.weekGrid}>
              {daysInWeek.map((day) => {
                const dayStr = toISODate(day);
                const dayTransactions = transactions.filter((txn) => txn.date === dayStr);
                const dayTotal = calculateDailyTotal(dayTransactions);
                const today = isToday(day);

                return (
                  <TouchableOpacity
                    key={dayStr}
                    style={[styles.dayCard, today && styles.dayCardToday]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text style={[styles.dayName, today && styles.dayNameToday]}>
                      {format(day, 'EEE')}
                    </Text>
                    <Text style={[styles.dayNumber, today && styles.dayNumberToday]}>
                      {format(day, 'd')}
                    </Text>
                    <Text
                      style={[
                        styles.dayAmount,
                        dayTotal > 0 && styles.dayAmountPositive,
                        dayTotal < 0 && styles.dayAmountNegative,
                      ]}
                    >
                      {dayTotal > 0 ? '+' : ''}
                      {formatCurrency(dayTotal)}
                    </Text>
                    <Text style={styles.dayTransactionCount}>
                      {dayTransactions.length} transactions
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Ending balance */}
            <TouchableOpacity style={styles.endingBalanceCard}>
              <Text style={styles.balanceLabel}>Ending Balance</Text>
              <View style={styles.accountBalances}>
                {accounts.map((acc) => (
                  <Text key={acc.id} style={styles.accountText}>
                    {acc.name}: {formatCurrency(getAccountBalance(acc.id, toISODate(weekEnd)))}
                  </Text>
                ))}
              </View>
              <View style={styles.netChangeContainer}>
                <Text style={styles.netChangeLabel}>Net Change: </Text>
                <Text
                  style={[
                    styles.netChangeAmount,
                    endingBalance - startingBalance > 0 && styles.dayAmountPositive,
                    endingBalance - startingBalance < 0 && styles.dayAmountNegative,
                  ]}
                >
                  {endingBalance - startingBalance > 0 ? '+' : ''}
                  {formatCurrency(endingBalance - startingBalance)}
                </Text>
              </View>
              <Text style={styles.clickForDetails}>Tap for weekly breakdown</Text>
            </TouchableOpacity>
          </ScrollView>
        </>
      ) : (
        <ScrollView style={styles.scrollView}>
          <MonthlyCalendarView
            currentDate={currentDate}
            transactions={transactions}
            onDayPress={(day) => setSelectedDay(day)}
          />
        </ScrollView>
      )}

      {/* Daily Detail Modal */}
      {selectedDay && (
        <DailyDetailScreen date={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
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
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.card,
    borderRadius: 4,
  },
  viewModeText: {
    color: colors.accent.primary,
    fontSize: 14,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
    margin: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: theme.spacing.sm,
  },
  accountBalances: {
    gap: 4,
  },
  accountText: {
    fontSize: 16,
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  scrollView: {
    flex: 1,
  },
  weekGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    width: '48%',
    marginBottom: theme.spacing.sm,
  },
  dayCardToday: {
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  dayName: {
    fontSize: 12,
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  dayNameToday: {
    color: colors.accent.primary,
    fontWeight: 'bold',
  },
  dayNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginVertical: theme.spacing.xs,
  },
  dayNumberToday: {
    color: colors.accent.primary,
  },
  dayAmount: {
    fontSize: 18,
    fontFamily: 'monospace',
    color: colors.text.primary,
    marginBottom: 4,
  },
  dayAmountPositive: {
    color: colors.status.success,
  },
  dayAmountNegative: {
    color: colors.status.error,
  },
  dayTransactionCount: {
    fontSize: 12,
    color: colors.text.disabled,
  },
  endingBalanceCard: {
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
    margin: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  netChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  netChangeLabel: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  netChangeAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  clickForDetails: {
    fontSize: 12,
    color: colors.accent.secondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});

export default CalendarScreen;
