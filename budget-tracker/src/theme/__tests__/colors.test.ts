import { colors, theme } from '../colors';

describe('Theme and Colors', () => {
  describe('Color Definitions', () => {
    it('should have valid background colors', () => {
      expect(colors.background).toBe('#121212');
      expect(colors.surface).toBe('#1E1E1E');
      expect(colors.card).toBe('#252525');
    });

    it('should have valid text colors', () => {
      expect(colors.text.primary).toBe('#FFFFFF');
      expect(colors.text.secondary).toBe('#B3B3B3');
      expect(colors.text.disabled).toBe('#666666');
    });

    it('should have valid accent colors', () => {
      expect(colors.accent.primary).toBe('#BB86FC');
      expect(colors.accent.secondary).toBe('#03DAC6');
    });

    it('should have valid status colors', () => {
      expect(colors.status.success).toBe('#4CAF50');
      expect(colors.status.warning).toBe('#FF9800');
      expect(colors.status.error).toBe('#FF6B6B');
      expect(colors.status.info).toBe('#2196F3');
    });

    it('should have valid category colors', () => {
      expect(colors.categories.rent).toBe('#2196F3');
      expect(colors.categories.food).toBe('#4CAF50');
      expect(colors.categories.gas).toBe('#FFC107');
      expect(colors.categories.funMoney).toBe('#FF9800');
      expect(colors.categories.utilities).toBe('#009688');
      expect(colors.categories.car).toBe('#9C27B0');
      expect(colors.categories.insurance).toBe('#3F51B5');
      expect(colors.categories.other).toBe('#757575');
    });

    it('should have all colors as valid hex codes', () => {
      const hexRegex = /^#[0-9A-F]{6}$/i;

      // Check all background colors
      expect(colors.background).toMatch(hexRegex);
      expect(colors.surface).toMatch(hexRegex);
      expect(colors.card).toMatch(hexRegex);

      // Check text colors
      expect(colors.text.primary).toMatch(hexRegex);
      expect(colors.text.secondary).toMatch(hexRegex);
      expect(colors.text.disabled).toMatch(hexRegex);

      // Check accent colors
      expect(colors.accent.primary).toMatch(hexRegex);
      expect(colors.accent.secondary).toMatch(hexRegex);

      // Check status colors
      expect(colors.status.success).toMatch(hexRegex);
      expect(colors.status.warning).toMatch(hexRegex);
      expect(colors.status.error).toMatch(hexRegex);
      expect(colors.status.info).toMatch(hexRegex);

      // Check category colors
      Object.values(colors.categories).forEach((color) => {
        expect(color).toMatch(hexRegex);
      });
    });
  });

  describe('Theme Configuration', () => {
    it('should have colors property', () => {
      expect(theme.colors).toBeDefined();
      expect(theme.colors).toBe(colors);
    });

    it('should have spacing values', () => {
      expect(theme.spacing.xs).toBe(4);
      expect(theme.spacing.sm).toBe(8);
      expect(theme.spacing.md).toBe(16);
      expect(theme.spacing.lg).toBe(24);
      expect(theme.spacing.xl).toBe(32);
    });

    it('should have border radius values', () => {
      expect(theme.borderRadius.sm).toBe(4);
      expect(theme.borderRadius.md).toBe(8);
      expect(theme.borderRadius.lg).toBe(12);
    });

    it('should have elevation values', () => {
      expect(theme.elevation.low).toBe(2);
      expect(theme.elevation.medium).toBe(4);
      expect(theme.elevation.high).toBe(8);
    });

    it('should have consistent spacing scale', () => {
      // Each level should be 8px apart (design system consistency)
      expect(theme.spacing.sm - theme.spacing.xs).toBe(4);
      expect(theme.spacing.md - theme.spacing.sm).toBe(8);
      expect(theme.spacing.lg - theme.spacing.md).toBe(8);
      expect(theme.spacing.xl - theme.spacing.lg).toBe(8);
    });

    it('should have consistent border radius scale', () => {
      expect(theme.borderRadius.md - theme.borderRadius.sm).toBe(4);
      expect(theme.borderRadius.lg - theme.borderRadius.md).toBe(4);
    });

    it('should have consistent elevation scale', () => {
      expect(theme.elevation.medium - theme.elevation.low).toBe(2);
      expect(theme.elevation.high - theme.elevation.medium).toBe(4);
    });
  });

  describe('Color Contrast and Accessibility', () => {
    it('should have distinct background levels', () => {
      // Each level should be lighter than the previous
      const bgValue = parseInt(colors.background.slice(1), 16);
      const surfaceValue = parseInt(colors.surface.slice(1), 16);
      const cardValue = parseInt(colors.card.slice(1), 16);

      expect(surfaceValue).toBeGreaterThan(bgValue);
      expect(cardValue).toBeGreaterThan(surfaceValue);
    });

    it('should have distinct text contrast levels', () => {
      const primaryValue = parseInt(colors.text.primary.slice(1), 16);
      const secondaryValue = parseInt(colors.text.secondary.slice(1), 16);
      const disabledValue = parseInt(colors.text.disabled.slice(1), 16);

      expect(primaryValue).toBeGreaterThan(secondaryValue);
      expect(secondaryValue).toBeGreaterThan(disabledValue);
    });

    it('should have no color duplicates across categories', () => {
      const categoryColors = Object.values(colors.categories);
      const uniqueColors = new Set(categoryColors);

      expect(uniqueColors.size).toBe(categoryColors.length);
    });
  });

  describe('Type Safety', () => {
    it('should export Theme type', () => {
      // This test verifies that TypeScript compilation succeeds
      const testTheme: typeof theme = {
        colors,
        spacing: theme.spacing,
        borderRadius: theme.borderRadius,
        elevation: theme.elevation,
      };

      expect(testTheme).toBeDefined();
    });
  });
});
