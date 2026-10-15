import { describe, expect, it, vi } from 'vitest';
import type { Database } from './client';
import { inUnitOfWork } from './unit-of-work';

function fakeDb(failures: string[]) {
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    const code = failures.shift();
    if (code) throw Object.assign(new Error('Failed query'), { cause: { code } });
    return work({});
  });
  return { db: { transaction } as unknown as Database, transaction };
}

describe('inUnitOfWork', () => {
  it('retries the whole unit after a deadlock or serialization failure', async () => {
    const { db, transaction } = fakeDb(['40P01', '40001']);
    await expect(inUnitOfWork(db, async () => 'done')).resolves.toBe('done');
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('gives up after three attempts', async () => {
    const { db } = fakeDb(['40P01', '40P01', '40P01']);
    await expect(inUnitOfWork(db, async () => 'done')).rejects.toThrow('Failed query');
  });

  it('never retries other errors', async () => {
    const { db, transaction } = fakeDb(['23505']);
    await expect(inUnitOfWork(db, async () => 'done')).rejects.toThrow();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
