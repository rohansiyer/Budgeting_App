/**
 * App bootstrap seeding.
 *
 * v1 seeded a full hardcoded financial life (PNC/DCU accounts, a weekly
 * paycheck, a fixed category list) on first launch — see git history for
 * the removed version. v2 (DucksInARow_DesignDoc_v2.md §2.4 "kill
 * hardcoded IDs") has no default accounts, categories, or income
 * sources: every one of those is created by the user, through the setup
 * wizard (`src/setup/`). The only thing that still needs to exist before
 * the wizard can run is a chapter to attach the wizard's writes to, so
 * seeding is reduced to "create a default chapter if none exists."
 *
 * This takes a `SetupWriter` rather than reaching into `src/db` directly:
 * Team 1's store is being rewritten in parallel (StoreContract), so this
 * function is written against the same seam the wizard uses.
 */
import { ensureDefaultChapter } from '../setup/chapterFlow';
import { createStoreSetupWriter } from '../setup/storeSetupWriter';
import type { SetupWriter } from '../setup/types';
import type { Chapter, ISODate } from '../types/contracts';

function todayISODate(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

// TODO(team1): delete this fallback once every caller passes a real
// StoreContract-backed SetupWriter. It exists only so pre-retrofit call
// sites (e.g. src/store/__tests__, which predates StoreContract and is
// being rewritten by Team 1) keep compiling against the new signature;
// a shared instance (not a fresh one per call) keeps it idempotent for
// callers that invoke seedInitialData() more than once without a writer.
let fallbackWriter: SetupWriter | null = null;

/** Idempotent: calling this on every app boot never creates a second chapter. */
export const seedInitialData = async (writer?: SetupWriter): Promise<Chapter> => {
  if (!writer) {
    fallbackWriter = fallbackWriter ?? createStoreSetupWriter();
    writer = fallbackWriter;
  }
  return ensureDefaultChapter(writer, todayISODate());
};
