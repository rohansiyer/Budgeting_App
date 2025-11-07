# Budget Tracker - Personal Finance Manager

A comprehensive React Native budget tracking app built with Expo, designed for managing personal finances with a beautiful dark-mode interface.

## Features

### Calendar View
- **Weekly View**: Track daily transactions with running balances
- **Monthly View**: Color-coded calendar showing spending intensity
- Toggle between views seamlessly
- Navigate through weeks/months
- Tap any day to see detailed breakdown

### Transaction Management
- Add income and expenses by category
- Real-time account balance calculations
- Multiple account support (PNC Spending, DCU Savings)
- Transaction notes and categorization
- Edit and delete transactions
- Account-to-account transfers

### Analytics & Insights
- **Dual-layer pie chart**: Planned vs Actual spending visualization
- Category-wise spending breakdown
- Budget adherence tracking with progress bars
- Savings rate calculation
- Smart insights and warnings
- Month-over-month comparisons
- Over-budget category alerts

### Settings & Management
- Edit account balances
- Manage category budgets
- View recurring expenses
- Data export (JSON backup)
- Share/backup capabilities
- Dark mode (always on)
- Notification preferences

### Weekly Breakdown
- Detailed weekly financial summary
- Starting and ending balances by account
- Income breakdown by source
- Expense breakdown by category
- Net change tracking with trend indicators

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Database**: SQLite with drizzle-orm
- **State Management**: Zustand
- **UI Components**: React Native Paper, custom components
- **Charts**: Custom SVG-based dual-layer pie chart
- **Date Handling**: date-fns
- **Navigation**: React Navigation (Bottom Tabs)
- **Build**: EAS Build for APK generation

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- EAS CLI (for building)

### Setup

1. **Clone the repository**
   ```bash
   cd budget-tracker
   npm install
   ```

2. **Start the development server**
   ```bash
   npm start
   ```

3. **Run on Android**
   ```bash
   npm run android
   ```

4. **Run on iOS** (macOS only)
   ```bash
   npm run ios
   ```

5. **Run on Web**
   ```bash
   npm run web
   ```

## Building for Production

### Build APK for Sideloading

1. **Install EAS CLI**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**
   ```bash
   eas login
   ```

3. **Configure build**
   ```bash
   eas build:configure
   ```

4. **Build APK**
   ```bash
   eas build -p android --profile preview
   ```

5. **Download and install**
   - Download APK from the provided link
   - Transfer to Android device
   - Enable "Install from Unknown Sources"
   - Install the APK

### Build for Play Store

```bash
eas build -p android --profile production
```

## Project Structure

```
budget-tracker/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── DualLayerPieChart.tsx
│   │   ├── MonthlyCalendarView.tsx
│   │   └── TransactionContextMenu.tsx
│   ├── db/                  # Database layer
│   │   ├── client.ts        # SQLite client & init
│   │   ├── schema.ts        # Drizzle ORM schemas
│   │   └── seed.ts          # Initial data seeding
│   ├── navigation/          # App navigation
│   │   └── RootNavigator.tsx
│   ├── screens/             # Main app screens
│   │   ├── AnalyticsScreen.tsx
│   │   ├── CalendarScreen.tsx
│   │   ├── DailyDetailScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── WeeklyBreakdownScreen.tsx
│   ├── store/               # Zustand state management
│   │   └── index.ts
│   ├── theme/               # Design system
│   │   └── colors.ts
│   ├── types/               # TypeScript definitions
│   │   └── index.ts
│   └── utils/               # Utility functions
│       ├── calculations.ts  # Financial calculations
│       └── dateUtils.ts     # Date manipulation
├── App.tsx                  # App entry point
├── eas.json                 # EAS Build configuration
├── package.json
└── tsconfig.json
```

## Default Configuration

### Accounts
- **PNC Spending**: Starting balance $810.63 (checking)
- **DCU Savings**: Starting balance $347.42 (savings)

### Income
- Weekly paycheck: $1,158.05 every Wednesday
  - 70% → PNC ($810.63)
  - 30% → DCU ($347.42)
- Tutoring: $200-$400/month (variable)

### Expense Categories

**Fixed Monthly** (Auto-deduct on 1st):
- Rent: $975
- Electricity: $30
- Internet: $65
- Phone: $55
- Car Payment: $400
- Car Insurance: $90

**Variable**:
- Gas: $40/week (~$173/month)
- Food: $35/week (~$152/month)
- Fun Money: $400/month

## Usage Guide

### Adding Transactions

1. **From Calendar**: Tap any day card
2. **Add Income**: Tap "Add Income" button
3. **Add Expense**: Tap "+ Add expense" under any category
4. Fill in amount, note (optional), and select account
5. Transactions save automatically

### Viewing Analytics

1. Navigate to Analytics tab
2. Use left/right arrows to navigate months
3. Tap "This Month" to return to current month
4. View dual-layer pie chart showing planned vs actual
5. Scroll down for detailed category breakdown
6. Check insights section for personalized advice

### Managing Budgets

1. Go to Settings tab
2. Scroll to "EXPENSE CATEGORIES"
3. Tap edit icon next to any category
4. Enter new monthly budget amount
5. Weekly budget auto-calculates (monthly / 4.33)

### Weekly Breakdown

1. In Calendar view (weekly mode)
2. Tap the "Ending Balance" card at the bottom
3. View comprehensive weekly summary
4. See income/expense breakdown by category
5. Check budget adherence for each category

### Exporting Data

1. Go to Settings tab
2. Scroll to "DATA" section
3. Tap "Export Data"
4. Choose app to share backup file
5. Backup includes accounts and categories

## Database Schema

The app uses SQLite with the following main tables:

- `accounts`: Financial accounts (checking, savings)
- `transactions`: All financial transactions
- `categories`: Expense and income categories
- `income_configs`: Income source configurations
- `income_splits`: Auto-split rules for income
- `recurring_statuses`: Recurring expense tracking
- `settings`: App preferences

All data is stored locally on the device. No cloud sync (yet).

## Customization

### Changing Starting Balances

Edit in Settings → Accounts → Tap edit icon

### Modifying Categories

Edit budgets in Settings → Categories → Tap edit icon

### Adding New Categories

Currently requires database modification. Feature coming soon.

## Troubleshooting

### Database not initializing
- Clear app data and restart
- Check console for initialization errors

### Transactions not appearing
- Ensure correct date is selected
- Check if transactions were saved successfully
- Verify account selection

### Build failures
- Run `npm install` to ensure dependencies are current
- Clear Expo cache: `expo start -c`
- Check EAS build logs for specific errors

## Performance

- Optimized for 1000+ transactions
- SQLite indexing on dates and accounts
- Memoized calculations in React components
- Lazy loading of transaction history

## Security

- All data stored locally (no transmission)
- No external API calls
- No personal data collection
- Backup files are unencrypted JSON

## Future Enhancements

- [ ] Cloud backup and sync
- [ ] Receipt photo attachments
- [ ] Custom category creation
- [ ] Bill payment reminders
- [ ] Investment tracking
- [ ] Multi-device support
- [ ] Bank account integration (Plaid)
- [ ] Widgets
- [ ] Search and filter transactions

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

MIT License - feel free to use and modify for personal use.

## Support

For issues or questions, please check:
1. This README
2. Console logs for errors
3. Expo documentation
4. React Navigation docs

## Acknowledgments

Built with:
- Expo team for amazing tools
- React Native community
- Drizzle ORM contributors
- date-fns team

---

**Version**: 1.0.0
**Last Updated**: 2025-11-07
**Author**: Budget Tracker Team
