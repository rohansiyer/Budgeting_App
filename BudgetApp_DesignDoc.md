# Personal Budget Tracker - Android App Design Document

## Project Overview

### Purpose
A personal budget tracking Android application for managing monthly finances with a calendar-based interface. Designed for a user making their first steps into financial independence.

### Target User
- 23-year-old, first job, managing money independently for the first time
- Needs visual, intuitive interface to reduce anxiety around budgeting
- Wants granular daily tracking with weekly and monthly views
- Android user (APK distribution, not Play Store initially)

### Core Philosophy
- **Simple but powerful**: Easy daily data entry, sophisticated analytics
- **Visual feedback**: Charts, color coding, progress indicators
- **Non-judgmental**: Supportive tone, clear information, no shame
- **Dark mode first**: Reduce eye strain, modern aesthetic

---

## Technical Stack Recommendation

### Primary Option: React Native + Expo
**Recommended for this project**

- **Framework**: React Native with Expo
- **State Management**: React Context API + AsyncStorage for local persistence
- **UI Components**: React Native Paper (Material Design with dark theme support)
- **Charts**: react-native-chart-kit or Victory Native
- **Calendar**: react-native-calendars
- **Notifications**: expo-notifications
- **Storage**: @react-native-async-storage/async-storage
- **Build**: EAS Build (Expo Application Services) for APK generation

**Why this stack:**
- Fast development
- Excellent dark mode support
- Easy APK generation without Play Store
- Good charting libraries
- Active community support

### Alternative: Flutter
- If prefer single codebase with iOS future-proofing
- Excellent performance
- Built-in Material Design dark theme

---

## User Financial Profile

### Income
- **Weekly Paycheck**: $1,158.05 (every Wednesday)
  - Auto-split: $347.42 → DCU Savings (30%)
  - Auto-split: $810.63 → PNC Spending
- **Tutoring Income**: $200-$400/month (variable, manual entry)
- **Monthly Total**: ~$5,000-5,400

### Accounts
1. **DCU Savings**: Emergency fund/buffer (30% auto-deposit)
2. **PNC Spending**: Daily expenses and bills

### Starting Balances
- DCU: $347.42
- PNC: $810.63
- Total: $1,158.05

### Expense Categories

#### Fixed Monthly (Auto-deduct on 1st)
- Rent: $975 (PNC)
- Electricity: $30 (PNC)
- Internet: $65 (PNC)
- Phone: $55 (PNC)
- Car Payment: $400 (PNC)
- Car Insurance: $90 (PNC)
- **Total Fixed**: $1,615/month

#### Variable Weekly/Monthly
- Gas: $40/week (~$173/month)
- Food: $35/week (~$152/month, expected to increase)
- Fun Money: $400/month

#### Savings Goals
- Emergency Fund: Building in DCU (auto 30%)
- S&P 500 Investment: $250/month (future, after emergency fund hits $3,500-5,000)

---

## Feature Specifications

### 1. App Structure

#### Main Navigation (Bottom Tab Bar)
1. **Calendar** (Home) - Daily/weekly tracking view
2. **Analytics** - Charts and spending insights
3. **Settings** - Categories, accounts, preferences

---

### 2. Calendar View (Home Screen)

#### Weekly View (Default)
```
┌─────────────────────────────────────────┐
│  Week of Nov 4 - Nov 10, 2025          │
│  Starting: $810.63 (PNC) $347.42 (DCU) │
├─────────────────────────────────────────┤
│  MON 4    TUE 5    WED 6   THU 7   ... │
│  $45.20   $0.00    +$810   $120.50     │
│  [click]  [click]  [click] [click]     │
├─────────────────────────────────────────┤
│  Ending: $1,455.00 [CLICK FOR BREAKDOWN]│
└─────────────────────────────────────────┘
```

**Behavior:**
- Default view shows current week
- Swipe left/right to navigate weeks
- Starting balance on left: Shows PNC + DCU at beginning of week
- Each day shows net total (income is +, expenses are -)
- Ending balance on right: Clickable to show weekly breakdown
- Tap any day to open daily detail view

**Visual Design:**
- Dark background (#121212)
- Cards with subtle elevation (#1E1E1E)
- Positive numbers (income) in green (#4CAF50)
- Negative numbers (expenses) in red/orange (#FF6B6B)
- Current day highlighted with accent color border

#### Monthly Calendar View (Alternate)
- Toggle button to switch between weekly/monthly
- Month grid showing daily totals
- Color intensity indicates spending level
- Tap day to open detail view

---

### 3. Daily Detail View (Click into a day)

```
┌─────────────────────────────────────────┐
│  ← Wednesday, Nov 6, 2025               │
├─────────────────────────────────────────┤
│  INCOME                                  │
│  ✓ Paycheck (PNC)          +$810.63    │
│  ✓ Paycheck (DCU)          +$347.42    │
│  + Add Tutoring Income                  │
├─────────────────────────────────────────┤
│  EXPENSES                                │
│  Food                $0.00 / $35.00     │
│    [+ Add expense]                      │
│  Gas                 $0.00 / $40.00     │
│    [+ Add expense]                      │
│  Fun Money          $0.00 / $400.00     │
│    [+ Add expense]                      │
│  [Show all categories ▼]                │
├─────────────────────────────────────────┤
│  Daily Total: +$1,158.05                │
│  Account Balance:                       │
│  PNC: $1,621.26  DCU: $694.84          │
└─────────────────────────────────────────┘
```

**Behavior:**
- Pre-populated paycheck on Wednesdays (editable)
- Click paycheck amount to edit (handles overtime)
- Each category shows: Spent today / Weekly budget
- Progress bar under each category
- "Add expense" creates inline input field
- Expense entry: Amount + optional note
- Running account balances at bottom
- Auto-saves on input
- Swipe left/right to navigate between days

**Add Expense Flow:**
1. Tap "+ Add expense" under category
2. Number pad appears
3. Optional: Add note/description
4. Select account (PNC/DCU)
5. Auto-saves, updates all totals

---

### 4. Weekly Ending Balance Breakdown (Click right side of week)

```
┌─────────────────────────────────────────┐
│  Week of Nov 4-10 Summary               │
├─────────────────────────────────────────┤
│  Starting Balance                       │
│  PNC: $810.63    DCU: $347.42          │
│                                         │
│  Income This Week                       │
│  Paycheck:       +$1,158.05            │
│  Tutoring:       +$200.00              │
│  Total:          +$1,358.05            │
│                                         │
│  Expenses This Week                     │
│  Food:           -$45.20               │
│  Gas:            -$40.00               │
│  Fun Money:      -$120.50              │
│  Total:          -$205.70              │
│                                         │
│  Ending Balance                         │
│  PNC: $1,255.00   DCU: $708.00         │
│                                         │
│  Net Change: +$1,152.35 ⬆              │
└─────────────────────────────────────────┘
```

---

### 5. Recurring Expenses (1st of Month)

#### Evening Notification (8:00 PM on the 1st)
```
🔔 Monthly Bills Reminder
Time to confirm your recurring expenses for [Month]
Tap to review and confirm payments
```

#### Recurring Expenses Screen
```
┌─────────────────────────────────────────┐
│  Monthly Recurring - December 1         │
├─────────────────────────────────────────┤
│  ☐ Rent              $975.00  [Edit][Skip]│
│  ☐ Electricity       $30.00   [Edit][Skip]│
│  ☐ Internet          $65.00   [Edit][Skip]│
│  ☐ Phone Bill        $55.00   [Edit][Skip]│
│  ☐ Car Payment       $400.00  [Edit][Skip]│
│  ☐ Car Insurance     $90.00   [Edit][Skip]│
├─────────────────────────────────────────┤
│  Total: $1,615.00                       │
│  PNC Balance: $3,500.00                 │
│  After Deduction: $1,885.00             │
│                                         │
│  [Confirm All] [Review Later]           │
└─────────────────────────────────────────┘
```

**Behavior:**
- Notification triggers at 8:00 PM on 1st of month
- User can check each item to confirm payment
- Edit button: Modify amount for this month only
- Skip button: Don't deduct this month (with confirmation dialog)
- Unchecked items don't deduct
- Once confirmed (checked + "Confirm All"), deduct from PNC
- Creates expense entry on December 1st for each confirmed item
- Can access this screen anytime from Settings for manual trigger

**Edit Flow:**
- Tap [Edit] next to expense
- Number pad to change amount
- Saves for this month only (doesn't change default)

**Skip Flow:**
- Tap [Skip]
- Confirmation: "Skip Rent ($975) for December?"
- If yes, grays out and unchecks the item

---

### 6. Analytics Screen

#### Dual-Layer Pie Chart

```
┌─────────────────────────────────────────┐
│  Spending This Month                    │
│                                         │
│         [DUAL-LAYER PIE CHART]          │
│                                         │
│  Outer Ring: Planned (transparent)      │
│  Inner Ring: Actual (solid, progressive)│
│                                         │
├─────────────────────────────────────────┤
│  Category Breakdown:                    │
│  🟦 Rent: $975/$975 (100%)             │
│  🟩 Food: $85/$152 (56%)               │
│  🟨 Gas: $120/$173 (69%)               │
│  🟧 Fun Money: $245/$400 (61%)         │
│  🟥 Utilities: $150/$150 (100%)        │
│  ... (all categories)                   │
│                                         │
│  Total Spent: $2,145 / $3,940          │
│  Remaining: $1,795                      │
└─────────────────────────────────────────┘
```

**Chart Specifications:**

**Outer Ring (Planned Budget):**
- Semi-transparent colors (40% opacity)
- Shows planned spending allocation
- Full circle = total planned budget
- Each slice = category's planned amount

**Inner Ring (Actual Spending):**
- Solid, vibrant colors (100% opacity)
- Progressively fills as money is spent
- Size represents actual spending
- Matches outer ring category colors (but solid)
- If overspent, extends beyond outer ring with warning color

**Category Colors:**
- Rent/Home: Blue (#2196F3)
- Food: Green (#4CAF50)
- Transportation/Gas: Yellow (#FFC107)
- Fun Money: Orange (#FF9800)
- Utilities: Teal (#009688)
- Debt/Car: Purple (#9C27B0)
- Insurance: Indigo (#3F51B5)
- Other: Grey (#757575)

**Interaction:**
- Tap slice to highlight category
- Shows tooltip with details
- Can filter to see specific categories
- Toggle between week/month/custom range

**Additional Analytics:**
- Month-over-month comparison
- Savings rate percentage
- Days until next paycheck
- Average daily spending
- Projected end-of-month balance

---

### 7. Settings Screen

```
┌─────────────────────────────────────────┐
│  Settings                               │
├─────────────────────────────────────────┤
│  ACCOUNTS                               │
│  PNC Spending                           │
│    Current: $1,255.00 [Edit]           │
│  DCU Savings                            │
│    Current: $708.00 [Edit]             │
├─────────────────────────────────────────┤
│  INCOME                                 │
│  Weekly Paycheck                        │
│    Amount: $1,158.05 [Edit]            │
│    Day: Wednesday [Edit]                │
│    Split: 30% DCU / 70% PNC [Edit]     │
│  Tutoring Range                         │
│    Min: $200  Max: $400 [Edit]         │
├─────────────────────────────────────────┤
│  RECURRING EXPENSES                     │
│  [Manage Recurring Bills]               │
│  - Edit amounts                         │
│  - Add/remove categories                │
│  - Test notification                    │
├─────────────────────────────────────────┤
│  CATEGORIES                             │
│  Expense Categories [Manage]            │
│  Budget Allocations [Edit]              │
├─────────────────────────────────────────┤
│  PREFERENCES                            │
│  Theme: Dark Mode (always on)           │
│  Week Start: Sunday / Monday            │
│  Notifications: ON [Configure]          │
├─────────────────────────────────────────┤
│  DATA                                   │
│  Export Data (CSV)                      │
│  Backup / Restore                       │
│  Clear All Data (⚠️ Danger)            │
└─────────────────────────────────────────┘
```

---

### 8. Categories & Budget Setup

#### Expense Categories
**Fixed Monthly:**
- Rent: $975
- Electricity: $30
- Internet: $65
- Phone: $55
- Car Payment: $400
- Car Insurance: $90

**Variable:**
- Gas: $173/month ($40/week)
- Food: $152/month ($35/week)
- Fun Money: $400/month

**Future/Optional:**
- S&P 500 Investment: $250/month (disabled initially)
- Emergency category
- Clothing
- Healthcare
- Gifts

#### Budget Periods
- Weekly budgets for: Gas, Food
- Monthly budgets for: Everything else
- Auto-calculate weekly from monthly (divide by 4.33)

---

## Data Structure

### Local Storage Schema

```javascript
// accounts.json
{
  "pnc": {
    "name": "PNC Spending",
    "balance": 810.63,
    "type": "checking"
  },
  "dcu": {
    "name": "DCU Savings",
    "balance": 347.42,
    "type": "savings"
  }
}

// income.json
{
  "weekly_paycheck": {
    "amount": 1158.05,
    "day": "wednesday",
    "splits": [
      { "account": "dcu", "amount": 347.42, "percentage": 30 },
      { "account": "pnc", "amount": 810.63, "percentage": 70 }
    ],
    "editable": true
  },
  "tutoring": {
    "min": 200,
    "max": 400,
    "variable": true
  }
}

// categories.json
{
  "expenses": {
    "rent": {
      "name": "Rent",
      "planned_monthly": 975,
      "recurring": true,
      "recurring_day": 1,
      "account": "pnc",
      "color": "#2196F3"
    },
    "electricity": {
      "name": "Electricity",
      "planned_monthly": 30,
      "recurring": true,
      "recurring_day": 1,
      "account": "pnc",
      "color": "#009688"
    },
    // ... other categories
    "gas": {
      "name": "Gas",
      "planned_weekly": 40,
      "planned_monthly": 173,
      "recurring": false,
      "account": "pnc",
      "color": "#FFC107"
    },
    "food": {
      "name": "Food",
      "planned_weekly": 35,
      "planned_monthly": 152,
      "recurring": false,
      "account": "pnc",
      "color": "#4CAF50"
    },
    "fun_money": {
      "name": "Fun Money",
      "planned_monthly": 400,
      "recurring": false,
      "account": "pnc",
      "color": "#FF9800"
    }
  }
}

// transactions.json
{
  "2025-11": {
    "2025-11-06": {
      "income": [
        {
          "id": "uuid",
          "amount": 810.63,
          "category": "paycheck",
          "account": "pnc",
          "timestamp": "2025-11-06T12:00:00Z",
          "note": "Weekly paycheck"
        },
        {
          "id": "uuid",
          "amount": 347.42,
          "category": "paycheck",
          "account": "dcu",
          "timestamp": "2025-11-06T12:00:00Z",
          "note": "Weekly paycheck - savings"
        }
      ],
      "expenses": [
        {
          "id": "uuid",
          "amount": 45.20,
          "category": "food",
          "account": "pnc",
          "timestamp": "2025-11-06T18:30:00Z",
          "note": "Grocery shopping"
        }
      ]
    }
  }
}

// recurring_status.json
{
  "2025-12": {
    "confirmed": false,
    "notification_sent": false,
    "items": {
      "rent": { "confirmed": false, "skipped": false, "amount": 975 },
      "electricity": { "confirmed": false, "skipped": false, "amount": 30 },
      // ... other recurring items
    }
  }
}

// settings.json
{
  "theme": "dark",
  "week_start": "sunday",
  "notifications_enabled": true,
  "recurring_notification_time": "20:00",
  "currency": "USD"
}
```

---

## UI/UX Design Guidelines

### Color Palette (Dark Mode)

**Background:**
- Primary: #121212
- Surface: #1E1E1E
- Card: #252525

**Text:**
- Primary: #FFFFFF (100%)
- Secondary: #B3B3B3 (70%)
- Disabled: #666666 (40%)

**Accent:**
- Primary: #BB86FC (purple)
- Secondary: #03DAC6 (teal)

**Status:**
- Success/Positive: #4CAF50 (green)
- Warning: #FF9800 (orange)
- Error/Negative: #FF6B6B (red)
- Info: #2196F3 (blue)

### Typography
- Headers: Roboto Bold, 20-24px
- Body: Roboto Regular, 16px
- Captions: Roboto Regular, 14px
- Numbers: Roboto Mono, 16-18px (for money amounts)

### Component Standards

**Buttons:**
- Primary: Filled, accent color
- Secondary: Outlined, accent color
- Text: No background, accent color text
- Minimum tap target: 48x48dp

**Input Fields:**
- Dark background with light border
- Number pad for amounts
- Auto-focus on open
- Clear/cancel easily accessible

**Cards:**
- Subtle elevation (2-4dp)
- Rounded corners (8dp)
- Padding: 16dp
- Margin between cards: 8dp

**Progress Indicators:**
- Linear progress bars for budgets
- Color changes: Green (under budget) → Yellow (80%+) → Red (over budget)

---

## Implementation Phases

### Phase 1: MVP Core (Week 1)
- [ ] Project setup (React Native + Expo)
- [ ] Dark theme configuration
- [ ] Bottom navigation structure
- [ ] Local storage setup (AsyncStorage)
- [ ] Basic data models

### Phase 2: Calendar View (Week 1-2)
- [ ] Weekly calendar grid
- [ ] Daily totals display
- [ ] Week starting/ending balances
- [ ] Navigation between weeks
- [ ] Current day highlighting

### Phase 3: Daily Detail View (Week 2)
- [ ] Daily expense entry
- [ ] Category breakdown
- [ ] Add expense functionality
- [ ] Account balance tracking
- [ ] Pre-populated paycheck (Wednesdays)

### Phase 4: Recurring Expenses (Week 2-3)
- [ ] Recurring expense configuration
- [ ] Notification system setup
- [ ] Evening reminder (1st of month)
- [ ] Confirmation UI with checkboxes
- [ ] Edit/skip functionality
- [ ] Auto-deduction logic

### Phase 5: Analytics (Week 3)
- [ ] Dual-layer pie chart implementation
- [ ] Category color coding
- [ ] Planned vs. actual visualization
- [ ] Interactive tooltips
- [ ] Month-over-month comparison

### Phase 6: Settings & Configuration (Week 3-4)
- [ ] Account management
- [ ] Category editor
- [ ] Budget allocation editor
- [ ] Notification preferences
- [ ] Data export (CSV)

### Phase 7: Polish & Testing (Week 4)
- [ ] UI polish pass
- [ ] Animation tuning
- [ ] Error handling
- [ ] Edge case testing
- [ ] Performance optimization
- [ ] APK build and testing

### Phase 8: Future Enhancements (Post-Launch)
- [ ] Backup/restore to cloud
- [ ] Receipt photo attachment
- [ ] Bill reminders (beyond 1st)
- [ ] S&P 500 investment tracking
- [ ] Goal setting and tracking
- [ ] Multi-month view
- [ ] Search/filter transactions
- [ ] Widgets

---

## APK Build Instructions

### Using Expo EAS Build

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
```

2. **Login to Expo:**
```bash
eas login
```

3. **Configure for Android:**
```bash
eas build:configure
```

4. **Build APK:**
```bash
eas build -p android --profile preview
```

5. **Download APK:**
- EAS will provide download link
- Download to computer
- Transfer to phone

### Sideloading on Android

1. **Enable Developer Options:**
   - Settings → About Phone
   - Tap "Build Number" 7 times

2. **Enable Unknown Sources:**
   - Settings → Security → Unknown Sources
   - Or: Settings → Apps → Special Access → Install Unknown Apps

3. **Install APK:**
   - Transfer APK to phone (USB, email, cloud)
   - Open file manager
   - Tap APK file
   - Follow installation prompts

4. **Launch App:**
   - Find "Budget Tracker" in app drawer
   - Open and start using

### Alternative: Direct Build (No Expo Account)

If you want to build locally without EAS:

```bash
# Install Android Studio and set up SDK
# Then:
expo prebuild
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Technical Considerations

### Offline-First Architecture
- All data stored locally in AsyncStorage
- No backend required
- No internet connection needed
- Future: Optional cloud sync

### Data Persistence
- Auto-save on every change
- No manual save button needed
- Graceful error handling if storage fails
- Data validation before saving

### Performance
- Lazy load transaction history (pagination)
- Cache calculated totals
- Optimize chart rendering
- Debounce rapid inputs

### Security
- Data stored locally on device
- No sensitive data transmitted
- Optional: PIN/biometric lock (future enhancement)
- Clear data option in settings

---

## Testing Checklist

### Core Functionality
- [ ] Add income on Wednesday (paycheck)
- [ ] Add manual tutoring income
- [ ] Add expenses to various categories
- [ ] View daily breakdown
- [ ] Navigate between days/weeks
- [ ] View weekly ending balance breakdown
- [ ] Confirm recurring expenses on 1st
- [ ] Edit recurring expense amount
- [ ] Skip recurring expense
- [ ] View analytics pie chart
- [ ] Edit account balances
- [ ] Edit category budgets

### Edge Cases
- [ ] First day of month (recurring trigger)
- [ ] Wednesday paycheck pre-population
- [ ] Over-budget in category (visual warning)
- [ ] Negative account balance
- [ ] Zero transactions in a day
- [ ] Month with 5 Wednesdays
- [ ] Leap year handling
- [ ] Very large/small amounts

### UI/UX
- [ ] Dark mode throughout app
- [ ] Smooth animations
- [ ] Fast load times
- [ ] Clear error messages
- [ ] Intuitive navigation
- [ ] Accessible tap targets
- [ ] Readable text sizes

### Notifications
- [ ] Recurring expense reminder fires at 8 PM on 1st
- [ ] Notification opens correct screen
- [ ] User can dismiss notification
- [ ] Re-schedule if dismissed

---

## Future Feature Ideas

### Short Term
- Bill payment reminders (configurable dates)
- Quick add from notification
- Weekly summary notification
- Custom category creation
- Notes/memo field for expenses

### Medium Term
- Attach receipt photos
- Investment tracking (S&P 500 integration)
- Savings goals with progress
- Debt payoff calculator
- Split expenses (roommates)

### Long Term
- Cloud backup/sync
- Multi-device support
- Shared budgets (couples/families)
- Bank account integration (Plaid API)
- Bill negotiation reminders
- Tax document export
- Financial advice/tips

---

## Support & Maintenance

### User Support
- In-app help/tutorial
- FAQ section
- Contact method (email)

### Updates
- Bug fixes via APK re-distribution
- Feature updates same way
- Eventually: Play Store for auto-updates

### Data Migration
- Export/import functionality
- Backwards compatibility for storage schema updates

---

## Success Metrics (for user)

### Financial Health Indicators
- Emergency fund reaching $3,500-5,000
- Consistent under-budget in all categories
- No overdrafts or negative balances
- Monthly savings rate maintained at 30%+

### App Usage
- Daily check-ins for expense tracking
- All recurring expenses confirmed monthly
- Regular review of analytics
- Reduced financial anxiety (self-reported)

---

## Notes for Developer (Claude Code)

### Priority Features
1. Calendar view with daily detail - this is the core UX
2. Wednesday paycheck pre-population - reduces friction
3. Recurring expense workflow - critical for first of month
4. Dual-layer pie chart - main analytics feature
5. Dark mode - non-negotiable

### User Context
- First-time budgeter, anxious about money
- Needs visual, intuitive interface
- Weekly paycheck rhythm is important
- Wants to feel in control without overwhelm

### Technical Preferences
- React Native recommended for fast development
- Dark mode only (no light mode needed)
- Keep it simple, avoid over-engineering
- Local-first, offline-capable
- APK build for sideloading (not Play Store yet)

### Design Philosophy
- Clear, not cluttered
- Encouraging, not judgmental
- Actionable insights
- Progressive disclosure (details on demand)

---

## Final Notes

This app is designed for someone taking their first steps into financial independence. The goal is to reduce anxiety through clear visibility and simple workflows. Every feature should answer: "Where is my money?" and "Am I okay?"

The calendar-based interface makes budgeting feel less abstract - it's about today, this week, not just monthly totals. The dual-layer pie chart provides both planning and reality at a glance.

Most importantly: the app should feel supportive, not stressful. Good luck building! 🚀

---

**Document Version**: 1.0  
**Last Updated**: November 6, 2025  
**Created for**: Personal budget tracking Android app (sideload APK)  
**Target User**: 23-year-old, first job, managing finances independently
