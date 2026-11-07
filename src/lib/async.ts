/**
 * Runs `task` once per item, strictly one after another, and resolves when the
 * last one settles. Use it where order matters (interactive prompts, writes to
 * one file) instead of `await` inside a loop.
 */
export function runSequentially<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  return items.reduce<Promise<void>>(
    (previous, item, index) => previous.then(() => task(item, index)),
    Promise.resolve(),
  );
}

/**
 * Runs a synchronous function behind a Promise-returning API: a throw becomes
 * a rejection, exactly as it would inside an `async` function.
 */
export function asPromise<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}
