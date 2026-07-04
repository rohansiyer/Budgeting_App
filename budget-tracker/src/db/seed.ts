/**
 * DEPRECATED — no-op stub.
 *
 * v1 seeded hardcoded accounts/categories/income ('pnc', 'weekly_paycheck', …).
 * Design v2 §2.4 kills all hardcoded IDs: everything now comes from the
 * first-run Setup wizard. This export is retained ONLY so App.tsx still
 * compiles/boots during the transition; it intentionally inserts nothing.
 *
 * TODO(team2): remove this file and its App.tsx call once the setup wizard
 * owns first-run configuration (chapters/accounts/categories/income sources).
 */
export const seedInitialData = async (): Promise<void> => {
  // Intentionally empty. First-run data is created by the Setup wizard.
};
