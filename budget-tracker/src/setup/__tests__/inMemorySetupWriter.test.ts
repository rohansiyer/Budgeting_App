import { cents } from '../../lib/money';
import { createInMemorySetupWriter } from '../inMemorySetupWriter';

describe('createInMemorySetupWriter', () => {
  it('has no active chapter initially', async () => {
    const writer = createInMemorySetupWriter();
    expect(await writer.getActiveChapter()).toBeNull();
  });

  it('creates a chapter and reports it as active', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await writer.createChapter({ name: 'Chapter 1', startedAt: '2026-01-01' });
    expect(chapter.archivedAt).toBeNull();
    expect(await writer.getActiveChapter()).toEqual(chapter);
  });

  it('refuses to create a second chapter while one is active', async () => {
    const writer = createInMemorySetupWriter();
    await writer.createChapter({ name: 'A', startedAt: '2026-01-01' });
    await expect(writer.createChapter({ name: 'B', startedAt: '2026-02-01' })).rejects.toThrow();
  });

  it('archives a chapter, freeing the slot for a new one', async () => {
    const writer = createInMemorySetupWriter();
    const first = await writer.createChapter({ name: 'A', startedAt: '2026-01-01' });
    await writer.archiveChapter(first.id, '2026-06-01');
    expect(await writer.getActiveChapter()).toBeNull();

    const second = await writer.createChapter({ name: 'B', startedAt: '2026-06-01' });
    expect(await writer.getActiveChapter()).toEqual(second);
  });

  it('rejects archiving an unknown or already-archived chapter', async () => {
    const writer = createInMemorySetupWriter();
    await expect(writer.archiveChapter('nope', '2026-01-01')).rejects.toThrow();

    const chapter = await writer.createChapter({ name: 'A', startedAt: '2026-01-01' });
    await writer.archiveChapter(chapter.id, '2026-06-01');
    await expect(writer.archiveChapter(chapter.id, '2026-06-02')).rejects.toThrow();
  });

  it('creates accounts with generated ids and lists them back', async () => {
    const writer = createInMemorySetupWriter();
    const account = await writer.createAccount({
      name: 'Checking',
      institution: 'Local Bank',
      kind: 'spending',
      startingBalance: cents(50000),
    });
    expect(account.id).toBeTruthy();
    expect(await writer.listAccounts()).toEqual([account]);
  });

  it('renames an account', async () => {
    const writer = createInMemorySetupWriter();
    const account = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    await writer.renameAccount(account.id, 'Everyday Spending');
    const [reloaded] = await writer.listAccounts();
    expect(reloaded.name).toBe('Everyday Spending');
  });

  it('rejects an income source split referencing an unknown account', async () => {
    const writer = createInMemorySetupWriter();
    await expect(
      writer.createIncomeSource({
        name: 'Job',
        amount: cents(100000),
        schedule: { kind: 'weekly', anchorDate: '2026-01-02' },
        splits: [{ accountId: 'unknown', ratio: 1 }],
      }),
    ).rejects.toThrow();
  });

  it('creates an income source once its split accounts exist', async () => {
    const writer = createInMemorySetupWriter();
    const account = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    const source = await writer.createIncomeSource({
      name: 'Job',
      amount: cents(150000),
      schedule: { kind: 'biweekly', anchorDate: '2026-01-02' },
      splits: [{ accountId: account.id, ratio: 1 }],
    });
    expect(await writer.listIncomeSources()).toEqual([source]);
  });

  it('creates categories and lists them back', async () => {
    const writer = createInMemorySetupWriter();
    const category = await writer.createCategory({
      name: 'Food',
      colorKey: 'amber',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
    });
    expect(await writer.listCategories()).toEqual([category]);
  });

  it('removeAccount archives the account and hides it from listAccounts', async () => {
    const writer = createInMemorySetupWriter();
    const a = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    await writer.createAccount({
      name: 'Savings',
      institution: null,
      kind: 'savings',
      startingBalance: cents(0),
    });
    await writer.removeAccount(a.id);
    const remaining = await writer.listAccounts();
    expect(remaining.map((x) => x.id)).not.toContain(a.id);
    expect(remaining).toHaveLength(1);
  });

  it('removeAccount refuses the last active account and rejects re-archiving', async () => {
    const writer = createInMemorySetupWriter();
    const only = await writer.createAccount({
      name: 'Solo',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    await expect(writer.removeAccount(only.id)).rejects.toThrow(/last active account/);

    const second = await writer.createAccount({
      name: 'Second',
      institution: null,
      kind: 'savings',
      startingBalance: cents(0),
    });
    await writer.removeAccount(second.id);
    await expect(writer.removeAccount(second.id)).rejects.toThrow(/already archived/);
    await expect(writer.removeAccount('nope')).rejects.toThrow(/unknown/);
  });

  it('removeAccount scrubs income splits that referenced it', async () => {
    const writer = createInMemorySetupWriter();
    const checking = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    const savings = await writer.createAccount({
      name: 'Savings',
      institution: null,
      kind: 'savings',
      startingBalance: cents(0),
    });
    await writer.createIncomeSource({
      name: 'Job',
      amount: cents(100000),
      schedule: { kind: 'weekly', anchorDate: '2026-01-02' },
      splits: [
        { accountId: checking.id, ratio: 0.5 },
        { accountId: savings.id, ratio: 0.5 },
      ],
    });
    await writer.removeAccount(savings.id);
    const [source] = await writer.listIncomeSources();
    expect(source.splits.map((s) => s.accountId)).toEqual([checking.id]);
  });

  it('removeCategory / removeIncomeSource archive and hide from their lists', async () => {
    const writer = createInMemorySetupWriter();
    const category = await writer.createCategory({
      name: 'Fun',
      colorKey: 'amber',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
    });
    await writer.removeCategory(category.id);
    expect(await writer.listCategories()).toHaveLength(0);
    await expect(writer.removeCategory(category.id)).rejects.toThrow(/already archived/);

    const account = await writer.createAccount({
      name: 'Checking',
      institution: null,
      kind: 'spending',
      startingBalance: cents(0),
    });
    const source = await writer.createIncomeSource({
      name: 'Job',
      amount: cents(100000),
      schedule: { kind: 'weekly', anchorDate: '2026-01-02' },
      splits: [{ accountId: account.id, ratio: 1 }],
    });
    await writer.removeIncomeSource(source.id);
    expect(await writer.listIncomeSources()).toHaveLength(0);
    await expect(writer.removeIncomeSource(source.id)).rejects.toThrow(/already archived/);
  });

  it('generates unique ids across many creates', async () => {
    const writer = createInMemorySetupWriter();
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const account = await writer.createAccount({
        name: `Account ${i}`,
        institution: null,
        kind: 'spending',
        startingBalance: cents(0),
      });
      ids.add(account.id);
    }
    expect(ids.size).toBe(25);
  });
});
