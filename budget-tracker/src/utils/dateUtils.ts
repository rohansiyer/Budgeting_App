import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameDay,
  getDay,
  addDays,
  parseISO,
} from 'date-fns';

export { startOfMonth, endOfMonth, addMonths, subMonths, format, getDay };

export const getWeekBoundaries = (date: Date, weekStartsOn: 0 | 1 = 0) => {
  const start = startOfWeek(date, { weekStartsOn });
  const end = endOfWeek(date, { weekStartsOn });
  return { start, end };
};

export const getMonthBoundaries = (date: Date) => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return { start, end };
};

export const getDaysInWeek = (date: Date, weekStartsOn: 0 | 1 = 0) => {
  const { start, end } = getWeekBoundaries(date, weekStartsOn);
  return eachDayOfInterval({ start, end });
};

export const getDaysInMonth = (date: Date) => {
  const { start, end } = getMonthBoundaries(date);
  return eachDayOfInterval({ start, end });
};

export const formatDate = (date: Date, formatStr: string = 'yyyy-MM-dd') => {
  return format(date, formatStr);
};

export const formatDateDisplay = (date: Date) => {
  return format(date, 'EEEE, MMM d, yyyy');
};

export const formatMonthYear = (date: Date) => {
  return format(date, 'MMMM yyyy');
};

export const formatWeekRange = (startDate: Date, endDate: Date) => {
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
};

export const getNextWeek = (date: Date) => {
  return addWeeks(date, 1);
};

export const getPreviousWeek = (date: Date) => {
  return subWeeks(date, 1);
};

export const isToday = (date: Date) => {
  return isSameDay(date, new Date());
};

export const getNextOccurrence = (dayOfWeek: number, fromDate: Date = new Date()) => {
  const currentDay = getDay(fromDate);
  const daysUntilNext = (dayOfWeek - currentDay + 7) % 7;
  return addDays(fromDate, daysUntilNext === 0 ? 7 : daysUntilNext);
};

export const parseDate = (dateStr: string) => {
  return parseISO(dateStr);
};

export const toISODate = (date: Date) => {
  return format(date, 'yyyy-MM-dd');
};

export const toISODateTime = (date: Date) => {
  return date.toISOString();
};
