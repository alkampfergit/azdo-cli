import { describe, it, expect } from 'vitest';
import { asPromise, runSequentially } from '../../src/lib/async.js';

describe('runSequentially', () => {
  it('runs one task at a time, in order, with the index', async () => {
    const log: string[] = [];
    let running = 0;
    await runSequentially(['a', 'b', 'c'], async (item, index) => {
      running += 1;
      expect(running).toBe(1);
      await new Promise((r) => setTimeout(r, 1));
      log.push(`${index}:${item}`);
      running -= 1;
    });
    expect(log).toEqual(['0:a', '1:b', '2:c']);
  });

  it('stops at the first rejection', async () => {
    const seen: number[] = [];
    await expect(
      runSequentially([1, 2, 3], (n) => {
        seen.push(n);
        return n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve();
      }),
    ).rejects.toThrow('boom');
    expect(seen).toEqual([1, 2]);
  });
});

describe('asPromise', () => {
  it('resolves with the return value', async () => {
    await expect(asPromise(() => 42)).resolves.toBe(42);
  });

  it('turns a throw into a rejection', async () => {
    const promise = asPromise(() => {
      throw new Error('nope');
    });
    await expect(promise).rejects.toThrow('nope');
  });
});
