/**
 * Chapter lifecycle: first-run bootstrap ("create a default chapter if
 * none exists" — replaces the old hardcoded seed, see src/db/seed.ts) and
 * the "New chapter" action (DucksInARow_DesignDoc_v2.md §4 Setup): archive
 * the active chapter, start a new one, and re-run the wizard. History and
 * ducks are untouched by either — chapters are a filter over shared
 * tables, not a partition of them; nothing here deletes or migrates rows.
 */
import type { Chapter, ISODate } from '../types/contracts';
import type { SetupWriter } from './types';
import { initialWizardState, type WizardState } from './wizardState';

export const DEFAULT_CHAPTER_NAME = 'Chapter 1';

/**
 * First-run bootstrap. If a chapter is already active, this is a no-op
 * (idempotent — safe to call on every app boot, same contract the old
 * `seedInitialData` had). Otherwise creates a nameless-default chapter
 * with NO accounts, categories, or income sources — the wizard is
 * responsible for all of those now.
 */
export async function ensureDefaultChapter(
  writer: SetupWriter,
  todayIso: ISODate,
  name: string = DEFAULT_CHAPTER_NAME,
): Promise<Chapter> {
  const existing = await writer.getActiveChapter();
  if (existing) return existing;
  return writer.createChapter({ name, startedAt: todayIso });
}

export interface NewChapterResult {
  chapter: Chapter;
  wizardState: WizardState;
}

/**
 * "New chapter": archives whatever chapter is currently active (if any —
 * calling this with no active chapter just starts the first one), then
 * creates a fresh chapter and hands back a blank wizard state to re-run
 * Setup against it. Does not touch transactions, carryover entries, duck
 * evaluations, or the flock — those stay associated with their original
 * chapter and remain readable (read-only) once archived.
 */
export async function startNewChapter(
  writer: SetupWriter,
  todayIso: ISODate,
  name: string,
): Promise<NewChapterResult> {
  const active = await writer.getActiveChapter();
  if (active) {
    await writer.archiveChapter(active.id, todayIso);
  }
  const chapter = await writer.createChapter({ name, startedAt: todayIso });
  return { chapter, wizardState: initialWizardState(name) };
}
