export const colors = {
  // Background
  background: '#121212',
  surface: '#1E1E1E',
  card: '#252525',

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#B3B3B3',
    disabled: '#666666',
  },

  // Accent
  accent: {
    primary: '#BB86FC',
    secondary: '#03DAC6',
  },

  // Status
  status: {
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#FF6B6B',
    info: '#2196F3',
  },

  // Categories
  categories: {
    rent: '#2196F3',
    food: '#4CAF50',
    gas: '#FFC107',
    funMoney: '#FF9800',
    utilities: '#009688',
    car: '#9C27B0',
    insurance: '#3F51B5',
    other: '#757575',
  },
};

export const theme = {
  colors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
  },
  elevation: {
    low: 2,
    medium: 4,
    high: 8,
  },
};

export type Theme = typeof theme;
