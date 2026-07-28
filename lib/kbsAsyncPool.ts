/**
 * Sınırlı paralellik — toplu galeri/upload’ta OOM önler.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemDone?: (done: number, total: number) => void
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, total));
  const results: R[] = new Array(total);
  let nextIndex = 0;
  let done = 0;

  async function runOne(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      results[i] = await worker(items[i]!, i);
      done += 1;
      onItemDone?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runOne()));
  return results;
}
