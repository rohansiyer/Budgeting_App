import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import { formatCurrency } from '../utils/calculations';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { RecurringExpenseConfirmationScreen } from './RecurringExpenseConfirmationScreen';
import { getScheduledNotifications, scheduleNextMonthNotification } from '../utils/notifications';

const EnhancedSettingsScreen = () => {
  const {
    accounts,
    categories,
    incomeConfigs,
    settings,
    updateAccount,
    updateCategory,
    updateIncomeConfig,
    updateSettings,
    getAccountBalance,
    exportData,
    importData,
    clearAllData,
  } = useBudgetStore();

  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingIncomeConfig, setEditingIncomeConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editField, setEditField] = useState<string>('');
  const [showRecurringScreen, setShowRecurringScreen] = useState(false);
  const [recurringMonth, setRecurringMonth] = useState('');

  const paycheckConfig = incomeConfigs.find((c) => c.type === 'weekly_paycheck');
  const tutoringConfig = incomeConfigs.find((c) => c.type === 'tutoring');

  const handleEditAccount = (accountId: string, currentBalance: number) => {
    setEditingAccount(accountId);
    setEditValue(currentBalance.toString());
  };

  const handleSaveAccount = async () => {
    if (!editingAccount) return;
    const newBalance = parseFloat(editValue);
    if (isNaN(newBalance)) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    await updateAccount(editingAccount, {
      startingBalance: newBalance,
    });

    setEditingAccount(null);
    setEditValue('');
  };

  const handleEditCategory = (categoryId: string, currentBudget: number) => {
    setEditingCategory(categoryId);
    setEditValue(currentBudget.toString());
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    const newBudget = parseFloat(editValue);
    if (isNaN(newBudget) || newBudget < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number');
      return;
    }

    await updateCategory(editingCategory, {
      plannedMonthly: newBudget,
      plannedWeekly: newBudget / 4.33,
    });

    setEditingCategory(null);
    setEditValue('');
  };

  const handleEditIncomeConfig = (configId: string, field: string, currentValue: any) => {
    setEditingIncomeConfig(configId);
    setEditField(field);
    setEditValue(currentValue?.toString() || '');
  };

  const handleSaveIncomeConfig = async () => {
    if (!editingIncomeConfig) return;

    const value = parseFloat(editValue);
    if (editField !== 'dayOfWeek' && (isNaN(value) || value < 0)) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number');
      return;
    }

    if (editField === 'dayOfWeek') {
      const dayValue = parseInt(editValue);
      if (isNaN(dayValue) || dayValue < 0 || dayValue > 6) {
        Alert.alert('Invalid Day', 'Please enter a day number from 0 (Sunday) to 6 (Saturday)');
        return;
      }
      await updateIncomeConfig(editingIncomeConfig, { dayOfWeek: dayValue });
    } else if (editField === 'amount') {
      await updateIncomeConfig(editingIncomeConfig, { amount: value });
    } else if (editField === 'minAmount') {
      await updateIncomeConfig(editingIncomeConfig, { minAmount: value });
    } else if (editField === 'maxAmount') {
      await updateIncomeConfig(editingIncomeConfig, { maxAmount: value });
    }

    setEditingIncomeConfig(null);
    setEditValue('');
    setEditField('');
  };

  const handleExportData = async () => {
    try {
      const jsonData = await exportData();
      const fileName = `budget_backup_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, jsonData);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', `Data exported to: ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export data');
      console.error(error);
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const fileUri = result.assets[0].uri;
      const jsonData = await FileSystem.readAsStringAsync(fileUri);

      Alert.alert(
        'Import Data',
        'This will replace all existing data. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: async () => {
              try {
                await importData(jsonData);
                Alert.alert('Success', 'Data imported successfully!');
              } catch (error) {
                Alert.alert('Import Failed', 'Could not import data. Please check the file format.');
                console.error(error);
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Import Failed', 'Could not import data');
      console.error(error);
    }
  };

  const handleClearAllData = () => {
    Alert.alert(
      '⚠️ Clear All Data',
      'This will delete all transactions and recurring expense records. Your accounts and categories will be preserved. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              Alert.alert('Success', 'All transaction data has been cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
              console.error(error);
            }
          },
        },
      ]
    );
  };

  const handleToggleWeekStart = async () => {
    if (!settings) return;
    const newWeekStart = settings.weekStart === 'sunday' ? 'monday' : 'sunday';
    await updateSettings({ weekStart: newWeekStart });
  };

  const handleToggleNotifications = async () => {
    if (!settings) return;
    const newValue = !settings.notificationsEnabled;
    await updateSettings({ notificationsEnabled: newValue });

    if (newValue) {
      // Schedule next month's notification
      await scheduleNextMonthNotification(settings.recurringNotificationTime);
    }
  };

  const handleManageRecurringBills = () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setRecurringMonth(month);
    setShowRecurringScreen(true);
  };

  const handleTestNotification = async () => {
    const scheduled = await getScheduledNotifications();
    Alert.alert(
      'Scheduled Notifications',
      scheduled.length > 0
        ? `Found ${scheduled.length} scheduled notification(s)`
        : 'No scheduled notifications found',
      [{ text: 'OK' }]
    );
  };

  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <ScrollView style={styles.container}>
      {/* Accounts Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNTS</Text>
        {accounts.map((account) => {
          const currentBalance = getAccountBalance(account.id);
          return (
            <View key={account.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{account.name}</Text>
                <TouchableOpacity
                  onPress={() => handleEditAccount(account.id, account.startingBalance)}
                >
                  <Ionicons name="pencil" size={20} color={colors.accent.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardSubtitle}>{account.type}</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Starting Balance:</Text>
                <Text style={styles.balanceAmount}>
                  {formatCurrency(account.startingBalance)}
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Current Balance:</Text>
                <Text style={[styles.balanceAmount, styles.currentBalance]}>
                  {formatCurrency(currentBalance)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Income Configuration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>INCOME</Text>

        {/* Weekly Paycheck */}
        {paycheckConfig && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Weekly Paycheck</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Amount:</Text>
              <TouchableOpacity
                onPress={() =>
                  handleEditIncomeConfig(paycheckConfig.id, 'amount', paycheckConfig.amount)
                }
                style={styles.settingValueButton}
              >
                <Text style={styles.settingValue}>
                  {formatCurrency(paycheckConfig.amount || 0)}
                </Text>
                <Ionicons name="pencil" size={16} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Day:</Text>
              <TouchableOpacity
                onPress={() =>
                  handleEditIncomeConfig(paycheckConfig.id, 'dayOfWeek', paycheckConfig.dayOfWeek)
                }
                style={styles.settingValueButton}
              >
                <Text style={styles.settingValue}>
                  {paycheckConfig.dayOfWeek !== undefined
                    ? dayOfWeekNames[paycheckConfig.dayOfWeek]
                    : 'Not set'}
                </Text>
                <Ionicons name="pencil" size={16} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Split:</Text>
              <Text style={styles.settingValue}>30% DCU / 70% PNC</Text>
            </View>
          </View>
        )}

        {/* Tutoring Income */}
        {tutoringConfig && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tutoring Range</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Min:</Text>
              <TouchableOpacity
                onPress={() =>
                  handleEditIncomeConfig(tutoringConfig.id, 'minAmount', tutoringConfig.minAmount)
                }
                style={styles.settingValueButton}
              >
                <Text style={styles.settingValue}>
                  {formatCurrency(tutoringConfig.minAmount || 0)}
                </Text>
                <Ionicons name="pencil" size={16} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Max:</Text>
              <TouchableOpacity
                onPress={() =>
                  handleEditIncomeConfig(tutoringConfig.id, 'maxAmount', tutoringConfig.maxAmount)
                }
                style={styles.settingValueButton}
              >
                <Text style={styles.settingValue}>
                  {formatCurrency(tutoringConfig.maxAmount || 0)}
                </Text>
                <Ionicons name="pencil" size={16} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Recurring Expenses Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECURRING EXPENSES</Text>
        <TouchableOpacity style={styles.actionCard} onPress={handleManageRecurringBills}>
          <Ionicons name="repeat" size={24} color={colors.accent.primary} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Manage Recurring Bills</Text>
            <Text style={styles.actionDescription}>
              Edit amounts, add/remove categories, or trigger review
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={handleTestNotification}>
          <Ionicons name="notifications-outline" size={24} color={colors.accent.secondary} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Test Notification</Text>
            <Text style={styles.actionDescription}>Check scheduled notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>
      </View>

      {/* Categories Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EXPENSE CATEGORIES</Text>
        {categories.map((category) => (
          <View key={category.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.categoryTitleRow}>
                <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                <Text style={styles.cardTitle}>{category.name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleEditCategory(category.id, category.plannedMonthly)}
              >
                <Ionicons name="pencil" size={20} color={colors.accent.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Monthly Budget:</Text>
              <Text style={styles.budgetAmount}>
                {formatCurrency(category.plannedMonthly)}
              </Text>
            </View>
            {category.plannedWeekly && (
              <View style={styles.budgetRow}>
                <Text style={styles.budgetLabel}>Weekly Budget:</Text>
                <Text style={styles.budgetAmount}>
                  {formatCurrency(category.plannedWeekly)}
                </Text>
              </View>
            )}
            {category.recurring && (
              <View style={styles.recurringBadge}>
                <Ionicons name="repeat" size={14} color={colors.accent.secondary} />
                <Text style={styles.recurringText}>
                  Recurring on day {category.recurringDay}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PREFERENCES</Text>

        <View style={styles.preferenceCard}>
          <Ionicons name="moon" size={24} color={colors.accent.primary} />
          <View style={styles.preferenceText}>
            <Text style={styles.preferenceTitle}>Theme</Text>
            <Text style={styles.preferenceValue}>Dark Mode (Always On)</Text>
          </View>
        </View>

        <View style={styles.preferenceCard}>
          <Ionicons name="calendar-outline" size={24} color={colors.accent.primary} />
          <View style={styles.preferenceText}>
            <Text style={styles.preferenceTitle}>Week Start</Text>
            <Text style={styles.preferenceValue}>
              {settings?.weekStart === 'sunday' ? 'Sunday' : 'Monday'}
            </Text>
          </View>
          <Switch
            value={settings?.weekStart === 'sunday'}
            onValueChange={handleToggleWeekStart}
            trackColor={{ false: colors.card, true: colors.accent.primary }}
            thumbColor={colors.text.primary}
          />
        </View>

        <View style={styles.preferenceCard}>
          <Ionicons name="notifications" size={24} color={colors.accent.primary} />
          <View style={styles.preferenceText}>
            <Text style={styles.preferenceTitle}>Notifications</Text>
            <Text style={styles.preferenceValue}>
              {settings?.notificationsEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={settings?.notificationsEnabled || false}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: colors.card, true: colors.accent.primary }}
            thumbColor={colors.text.primary}
          />
        </View>
      </View>

      {/* Data Management Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DATA</Text>

        <TouchableOpacity style={styles.actionCard} onPress={handleExportData}>
          <Ionicons name="download-outline" size={24} color={colors.accent.primary} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Export Data</Text>
            <Text style={styles.actionDescription}>Backup your data to JSON file</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={handleImportData}>
          <Ionicons name="cloud-upload-outline" size={24} color={colors.accent.primary} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Import / Restore</Text>
            <Text style={styles.actionDescription}>Restore from backup file</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCard, styles.dangerCard]} onPress={handleClearAllData}>
          <Ionicons name="trash-outline" size={24} color={colors.status.error} />
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, styles.dangerText]}>Clear All Data</Text>
            <Text style={styles.actionDescription}>⚠️ Delete all transactions (irreversible)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>
      </View>

      {/* Edit Account Modal */}
      <Modal
        visible={editingAccount !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingAccount(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Starting Balance</Text>
            <Text style={styles.modalSubtitle}>
              {accounts.find((a) => a.id === editingAccount)?.name}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Starting Balance"
              placeholderTextColor={colors.text.disabled}
              keyboardType="decimal-pad"
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setEditingAccount(null);
                  setEditValue('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveAccount}
              >
                <Text style={styles.modalButtonTextPrimary}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        visible={editingCategory !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingCategory(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Monthly Budget</Text>
            <Text style={styles.modalSubtitle}>
              {categories.find((c) => c.id === editingCategory)?.name}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Monthly Budget"
              placeholderTextColor={colors.text.disabled}
              keyboardType="decimal-pad"
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setEditingCategory(null);
                  setEditValue('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveCategory}
              >
                <Text style={styles.modalButtonTextPrimary}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Income Config Modal */}
      <Modal
        visible={editingIncomeConfig !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingIncomeConfig(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editField === 'dayOfWeek'
                ? 'Edit Paycheck Day'
                : editField === 'amount'
                ? 'Edit Paycheck Amount'
                : editField === 'minAmount'
                ? 'Edit Minimum Amount'
                : 'Edit Maximum Amount'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {incomeConfigs.find((c) => c.id === editingIncomeConfig)?.type}
            </Text>
            {editField === 'dayOfWeek' && (
              <Text style={styles.modalNote}>0 = Sunday, 1 = Monday, ..., 6 = Saturday</Text>
            )}
            <TextInput
              style={styles.input}
              placeholder={editField === 'dayOfWeek' ? 'Day (0-6)' : 'Amount'}
              placeholderTextColor={colors.text.disabled}
              keyboardType={editField === 'dayOfWeek' ? 'number-pad' : 'decimal-pad'}
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setEditingIncomeConfig(null);
                  setEditValue('');
                  setEditField('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveIncomeConfig}
              >
                <Text style={styles.modalButtonTextPrimary}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Recurring Expense Confirmation Screen */}
      {showRecurringScreen && (
        <RecurringExpenseConfirmationScreen
          month={recurringMonth}
          onClose={() => setShowRecurringScreen(false)}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    marginBottom: theme.spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.text.disabled,
    textTransform: 'capitalize',
    marginBottom: theme.spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  balanceAmount: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  currentBalance: {
    fontWeight: 'bold',
    color: colors.accent.primary,
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
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  budgetLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  budgetAmount: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.card,
  },
  recurringText: {
    fontSize: 12,
    color: colors.accent.secondary,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  settingLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  settingValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.primary,
    marginRight: 8,
  },
  settingValueButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.status.error,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  dangerText: {
    color: colors.status.error,
  },
  actionDescription: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  preferenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  preferenceText: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  preferenceValue: {
    fontSize: 12,
    color: colors.text.secondary,
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
    marginBottom: theme.spacing.md,
  },
  modalNote: {
    fontSize: 12,
    color: colors.accent.secondary,
    marginBottom: theme.spacing.sm,
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

export default EnhancedSettingsScreen;
