import {
  getWeekBoundaries,
  getDaysInWeek,
  getDaysInMonth,
  formatDate,
  formatDateDisplay,
  formatMonthYear,
  formatWeekRange,
  getNextWeek,
  getPreviousWeek,
  toISODate,
  toISODateTime,
  isToday,
  getNextOccurrence,
  parseDate,
  getMonthBoundaries,
} from '../dateUtils';

describe('Date Utils', () => {
  describe('getWeekBoundaries', () => {
    it('should return correct week boundaries for a date', () => {
      const date = new Date('2025-11-07'); // Friday
      const { start, end } = getWeekBoundaries(date);

      expect(toISODate(start)).toBe('2025-11-02'); // Sunday
      expect(toISODate(end)).toBe('2025-11-08'); // Saturday
    });

    it('should handle week starting on Monday', () => {
      const date = new Date('2025-11-07');
      const { start, end } = getWeekBoundaries(date, 1);

      expect(toISODate(start)).toBe('2025-11-03'); // Monday
      expect(toISODate(end)).toBe('2025-11-09'); // Sunday
    });
  });

  describe('getDaysInWeek', () => {
    it('should return 7 days for any week', () => {
      const date = new Date('2025-11-07');
      const days = getDaysInWeek(date);

      expect(days).toHaveLength(7);
    });

    it('should return consecutive days', () => {
      const date = new Date('2025-11-07');
      const days = getDaysInWeek(date);

      for (let i = 1; i < days.length; i++) {
        const diff = days[i].getTime() - days[i - 1].getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        expect(diff).toBe(oneDayMs);
      }
    });
  });

  describe('getDaysInMonth', () => {
    it('should return correct number of days for November', () => {
      const date = new Date('2025-11-15');
      const days = getDaysInMonth(date);

      expect(days).toHaveLength(30);
    });

    it('should return correct number of days for February (non-leap year)', () => {
      const date = new Date('2025-02-15');
      const days = getDaysInMonth(date);

      expect(days).toHaveLength(28);
    });

    it('should return correct number of days for February (leap year)', () => {
      const date = new Date('2024-02-15');
      const days = getDaysInMonth(date);

      expect(days).toHaveLength(29);
    });
  });

  describe('formatDate', () => {
    it('should format date as ISO by default', () => {
      const date = new Date('2025-11-07T12:00:00');
      const formatted = formatDate(date);

      expect(formatted).toBe('2025-11-07');
    });

    it('should format date with custom format', () => {
      const date = new Date('2025-11-07T12:00:00');
      const formatted = formatDate(date, 'MM/dd/yyyy');

      expect(formatted).toBe('11/07/2025');
    });
  });

  describe('formatWeekRange', () => {
    it('should format week range correctly', () => {
      const start = new Date('2025-11-02');
      const end = new Date('2025-11-08');
      const formatted = formatWeekRange(start, end);

      expect(formatted).toContain('Nov 2');
      expect(formatted).toContain('Nov 8, 2025');
    });
  });

  describe('toISODate', () => {
    it('should convert date to ISO date string', () => {
      const date = new Date('2025-11-07T15:30:45');
      const iso = toISODate(date);

      expect(iso).toBe('2025-11-07');
    });
  });

  describe('isToday', () => {
    it('should return true for today', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
    });

    it('should return false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    it('should return false for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isToday(tomorrow)).toBe(false);
    });
  });

  describe('getMonthBoundaries', () => {
    it('should return correct month boundaries', () => {
      const date = new Date('2025-11-15');
      const { start, end } = getMonthBoundaries(date);

      expect(toISODate(start)).toBe('2025-11-01');
      expect(toISODate(end)).toBe('2025-11-30');
    });

    it('should handle February in leap year', () => {
      const date = new Date('2024-02-15');
      const { start, end } = getMonthBoundaries(date);

      expect(toISODate(start)).toBe('2024-02-01');
      expect(toISODate(end)).toBe('2024-02-29');
    });
  });

  describe('formatDateDisplay', () => {
    it('should format date for display', () => {
      const date = new Date('2025-11-07T12:00:00');
      const formatted = formatDateDisplay(date);

      expect(formatted).toBe('Friday, Nov 7, 2025');
    });
  });

  describe('formatMonthYear', () => {
    it('should format month and year', () => {
      const date = new Date('2025-11-07');
      const formatted = formatMonthYear(date);

      expect(formatted).toBe('November 2025');
    });
  });

  describe('getNextWeek', () => {
    it('should return date one week later', () => {
      const date = new Date('2025-11-07');
      const nextWeek = getNextWeek(date);

      expect(toISODate(nextWeek)).toBe('2025-11-14');
    });
  });

  describe('getPreviousWeek', () => {
    it('should return date one week earlier', () => {
      const date = new Date('2025-11-07');
      const prevWeek = getPreviousWeek(date);

      expect(toISODate(prevWeek)).toBe('2025-10-31');
    });
  });

  describe('toISODateTime', () => {
    it('should convert date to ISO datetime string', () => {
      const date = new Date('2025-11-07T15:30:45.123Z');
      const iso = toISODateTime(date);

      expect(iso).toContain('2025-11-07');
      expect(iso).toContain('T');
      expect(iso).toMatch(/Z$/);
    });
  });

  describe('getNextOccurrence', () => {
    it('should return next occurrence of a weekday', () => {
      const friday = new Date('2025-11-07');
      const nextMonday = getNextOccurrence(1, friday);

      expect(nextMonday.getDay()).toBe(1);
      expect(toISODate(nextMonday)).toBe('2025-11-10');
    });
  });

  describe('parseDate', () => {
    it('should parse ISO date string', () => {
      const dateStr = '2025-11-07';
      const parsed = parseDate(dateStr);

      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(10);
      expect(parsed.getDate()).toBe(7);
    });
  });
});
