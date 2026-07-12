/**
 * Projections module (handoff §3.9, §3.10) — stepped savings + goal funding
 * from median trailing spend. Public surface for the goal card + step-line
 * chart (rendered next wave).
 */
export { lowerMedianCents, trailingCalendarMonths, type MonthKey } from './median';
export {
  projectSavings,
  projectGoalFunding,
  stepSavings,
  fundingDate,
  billsDueInWeek,
  weeklyFromMonthly,
  type ProjectionPoint,
  type GoalFunding,
  type BillLite,
} from './project';
