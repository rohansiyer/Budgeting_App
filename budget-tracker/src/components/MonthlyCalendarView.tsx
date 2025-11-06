import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, theme } from '../theme/colors';
import {
  getDaysInMonth,
  format,
  toISODate,
  isToday,
  startOfMonth,
  getDay,
} from '../utils/dateUtils';
import { calculateDailyTotal, formatCurrency } from '../utils/calculations';
import { Transaction } from '../types';

interface MonthlyCalendarViewProps {
  currentDate: Date;
  transactions: Transaction[];
  onDayPress?: (date: Date) => void;
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  currentDate,
  transactions,
  onDayPress,
}) => {
  const daysInMonth = getDaysInMonth(currentDate);
  const monthStart = startOfMonth(currentDate);
  const startDayOfWeek = getDay(monthStart);

  // Create empty slots for days before the month starts
  const emptyDays = Array(startDayOfWeek).fill(null);

  const getIntensityColor = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (amount > 0) {
      // Positive (income) - shades of green
      if (absAmount > 1000) return colors.status.success + 'FF';
      if (absAmount > 500) return colors.status.success + 'CC';
      if (absAmount > 100) return colors.status.success + '99';
      return colors.status.success + '66';
    } else if (amount < 0) {
      // Negative (expenses) - shades of red/orange
      if (absAmount > 1000) return colors.status.error + 'FF';
      if (absAmount > 500) return colors.status.error + 'CC';
      if (absAmount > 100) return colors.status.error + '99';
      return colors.status.error + '66';
    }
    return colors.surface;
  };

  return (
    <View style={styles.container}>
      {/* Day of week headers */}
      <View style={styles.weekDaysRow}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <Text key={day} style={styles.weekDayText}>
            {day}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.monthGrid}>
        {/* Empty cells before month starts */}
        {emptyDays.map((_, index) => (
          <View key={`empty-${index}`} style={styles.emptyDay} />
        ))}

        {/* Days of the month */}
        {daysInMonth.map((day) => {
          const dayStr = toISODate(day);
          const dayTransactions = transactions.filter((txn) => txn.date === dayStr);
          const dayTotal = calculateDailyTotal(dayTransactions);
          const today = isToday(day);
          const intensityColor = getIntensityColor(dayTotal);

          return (
            <TouchableOpacity
              key={dayStr}
              style={[
                styles.dayCell,
                { backgroundColor: intensityColor },
                today && styles.dayCellToday,
              ]}
              onPress={() => onDayPress?.(day)}
            >
              <Text style={[styles.dayNumber, today && styles.dayNumberToday]}>
                {format(day, 'd')}
              </Text>
              {dayTotal !== 0 && (
                <Text
                  style={[
                    styles.dayAmount,
                    dayTotal > 0 && styles.dayAmountPositive,
                    dayTotal < 0 && styles.dayAmountNegative,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(Math.abs(dayTotal))}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.sm,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.sm,
  },
  weekDayText: {
    width: '14%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  emptyDay: {
    width: '13.5%',
    aspectRatio: 1,
  },
  dayCell: {
    width: '13.5%',
    aspectRatio: 1,
    padding: 4,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  dayNumberToday: {
    color: colors.accent.primary,
  },
  dayAmount: {
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  dayAmountPositive: {
    color: colors.status.success,
  },
  dayAmountNegative: {
    color: colors.status.error,
  },
});
