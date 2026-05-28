import { supabase } from '@/lib/supabase';

export const EDGE_INVOKE_TIMEOUT_MS = 24_000;

export async function withPromiseTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} (${Math.round(ms / 1000)} sn)`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Supabase Edge `invoke` — takılı kalan isteklerde yükleme sonsuza gitmesin. */
export async function invokeSupabaseEdgeFunction(
  functionName: string,
  options: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
  timeoutMs = EDGE_INVOKE_TIMEOUT_MS
): Promise<{ data: unknown; error: unknown }> {
  return withPromiseTimeout(
    supabase.functions.invoke(functionName, options),
    timeoutMs,
    functionName
  );
}
