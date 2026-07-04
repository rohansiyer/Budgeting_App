import { seedInitialData } from '../seed';
import { createInMemorySetupWriter } from '../../setup/inMemorySetupWriter';

describe('seedInitialData (v2 — chapter bootstrap only)', () => {
  it('creates a default chapter when none exists', async () => {
    const writer = createInMemorySetupWriter();
    expect(await writer.getActiveChapter()).toBeNull();

    const chapter = await seedInitialData(writer);

    expect(chapter.archivedAt).toBeNull();
    expect(chapter.name.length).toBeGreaterThan(0);
    expect(await writer.getActiveChapter()).toEqual(chapter);
  });

  it('creates no accounts, categories, or income sources', async () => {
    const writer = createInMemorySetupWriter();
    await seedInitialData(writer);

    expect(await writer.listAccounts()).toEqual([]);
    expect(await writer.listCategories()).toEqual([]);
    expect(await writer.listIncomeSources()).toEqual([]);
  });

  it('is idempotent — repeated calls never create a second chapter', async () => {
    const writer = createInMemorySetupWriter();

    const first = await seedInitialData(writer);
    const second = await seedInitialData(writer);
    const third = await seedInitialData(writer);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('does not touch an already-active (user-configured) chapter', async () => {
    const writer = createInMemorySetupWriter();
    const existing = await writer.createChapter({ name: 'My Chapter', startedAt: '2026-01-01' });

    const result = await seedInitialData(writer);

    expect(result).toEqual(existing);
  });
});
