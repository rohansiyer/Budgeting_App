import { cents } from '../../lib/money';
import { createInMemorySetupWriter } from '../inMemorySetupWriter';
import { DEFAULT_CHAPTER_NAME, ensureDefaultChapter, startNewChapter } from '../chapterFlow';

describe('ensureDefaultChapter', () => {
  it('creates a default chapter when none exists', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await ensureDefaultChapter(writer, '2026-07-04');
    expect(chapter.name).toBe(DEFAULT_CHAPTER_NAME);
    expect(chapter.startedAt).toBe('2026-07-04');
    expect(chapter.archivedAt).toBeNull();
  });

  it('is idempotent and returns the existing chapter unchanged', async () => {
    const writer = createInMemorySetupWriter();
    const first = await ensureDefaultChapter(writer, '2026-07-04');
    const second = await ensureDefaultChapter(writer, '2026-07-05');
    expect(second).toEqual(first);
  });
});

describe('startNewChapter', () => {
  it('archives the active chapter and creates a fresh one with a blank wizard state', async () => {
    const writer = createInMemorySetupWriter();
    const original = await writer.createChapter({ name: 'Old Job', startedAt: '2025-01-01' });
    await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(1000),
    });

    const { chapter, wizardState } = await startNewChapter(writer, '2026-07-04', 'New Job');

    expect(chapter.name).toBe('New Job');
    expect(chapter.archivedAt).toBeNull();
    expect(chapter.id).not.toBe(original.id);
    expect(wizardState.step).toBe('accounts');
    expect(wizardState.accounts).toEqual([]);
    expect(wizardState.chapterName).toBe('New Job');

    // The old chapter is archived, the new one active.
    expect(await writer.getActiveChapter()).toEqual(chapter);
  });

  it('works from a fresh writer with no prior chapter (equivalent to first run)', async () => {
    const writer = createInMemorySetupWriter();
    const { chapter } = await startNewChapter(writer, '2026-07-04', 'First Chapter');
    expect(chapter.archivedAt).toBeNull();
  });

  it('does not touch accounts/categories/income sources — history persists across chapters', async () => {
    const writer = createInMemorySetupWriter();
    await writer.createChapter({ name: 'Old Job', startedAt: '2025-01-01' });
    const account = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(1000),
    });
    const category = await writer.createCategory({
      name: 'Food',
      colorKey: 'amber',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
    });

    await startNewChapter(writer, '2026-07-04', 'New Job');

    // This in-memory fake models accounts/categories as global (matching
    // the real store, where chapters filter shared tables rather than
    // partitioning them) — starting a new chapter must not delete rows.
    expect(await writer.listAccounts()).toEqual([account]);
    expect(await writer.listCategories()).toEqual([category]);
  });
});
