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
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme } from '../theme/colors';
import { useBudgetStore } from '../store';
import { formatCurrency } from '../utils/calculations';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const SettingsScreen = () => {
  const { accounts, categories, updateAccount, updateCategory, getAccountBalance } =
    useBudgetStore();

  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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

  const exportData = async () => {
    try {
      const data = {
        accounts,
        categories,
        exportedAt: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(data, null, 2);
      const fileName = `budget_backup_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, jsonString);

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

      {/* Data Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DATA</Text>
        <TouchableOpacity style={styles.actionCard} onPress={exportData}>
          <Ionicons name="download-outline" size={24} color={colors.accent.primary} />
          <View style={styles.actionText}>
            <Text style={styles.actionTitle}>Export Data</Text>
            <Text style={styles.actionDescription}>
              Backup your accounts and categories
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.disabled} />
        </TouchableOpacity>
      </View>

      {/* Preferences */}
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
          <Ionicons name="notifications" size={24} color={colors.accent.primary} />
          <View style={styles.preferenceText}>
            <Text style={styles.preferenceTitle}>Notifications</Text>
            <Text style={styles.preferenceValue}>Enabled</Text>
          </View>
        </View>
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
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
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

export default SettingsScreen;
