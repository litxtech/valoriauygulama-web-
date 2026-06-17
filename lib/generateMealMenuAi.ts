import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/supabaseTransientErrors';
import type { MealFields } from '@/lib/mealMenuUi';
import { dayFillStatus } from '@/lib/mealMenuUi';

const INVOKE_TIMEOUT_MS = 58_000;

export type GeneratedMealMenuDay = {
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};

export type GenerateMealMenuContext = {
  periodMonth: string;
  editableDates: string[];
  todayYmd: string;
  organizationName?: string;
  existingDays?: GeneratedMealMenuDay[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Oturum gerekli — AI menü için giriş yapın');
  }
  return { Authorization: `Bearer ${token}` };
}

export async function generateMealMenuWithAi(input: {
  prompt: string;
  organizationId: string;
  context: GenerateMealMenuContext;
}): Promise<GeneratedMealMenuDay[]> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error('Lütfen menü talebinizi yazın');
  }

  const headers = await authHeaders();
  const { data, error } = await withTimeout(
    supabase.functions.invoke('generate-meal-menu', {
      body: {
        prompt,
        organizationId: input.organizationId,
        periodMonth: input.context.periodMonth,
        editableDates: input.context.editableDates,
        todayYmd: input.context.todayYmd,
        organizationName: input.context.organizationName,
        existingDays: input.context.existingDays ?? [],
      },
      headers,
    }),
    INVOKE_TIMEOUT_MS,
    'generate-meal-menu',
  );

  const payload = (data ?? {}) as {
    days?: GeneratedMealMenuDay[];
    error?: string;
  };

  if (payload.days?.length) {
    return payload.days;
  }

  if (error) {
    const ctx = error as { message?: string; context?: { json?: () => Promise<unknown> } };
    let detail = payload?.error || ctx.message || 'AI menü isteği başarısız';
    try {
      const body = await ctx.context?.json?.();
      if (body && typeof body === 'object' && 'error' in body) {
        detail = String((body as { error?: string }).error ?? detail);
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (payload?.error) throw new Error(payload.error);
  throw new Error('AI menü üretemedi');
}

export type MealMenuMergeMode = 'empty_only' | 'overwrite';

export function countAffectedMealDays(
  daysMap: Record<string, MealFields>,
  generated: GeneratedMealMenuDay[],
  mode: MealMenuMergeMode,
): { filled: number; partial: number; empty: number } {
  let filled = 0;
  let partial = 0;
  let empty = 0;
  for (const row of generated) {
    const ymd = row.date.slice(0, 10);
    const current = daysMap[ymd] ?? { breakfast: '', lunch: '', dinner: '' };
    const st = dayFillStatus(current);
    if (st === 'full') filled += 1;
    else if (st === 'partial') partial += 1;
    else empty += 1;
  }
  if (mode === 'empty_only') {
    return { filled: 0, partial, empty };
  }
  return { filled, partial, empty };
}

export function mergeGeneratedMealDays(
  daysMap: Record<string, MealFields>,
  generated: GeneratedMealMenuDay[],
  mode: MealMenuMergeMode,
): Record<string, MealFields> {
  const next = { ...daysMap };
  for (const row of generated) {
    const ymd = row.date.slice(0, 10);
    if (!next[ymd]) continue;
    const current = next[ymd];
    const gen: MealFields = {
      breakfast: row.breakfast.trim(),
      lunch: row.lunch.trim(),
      dinner: row.dinner.trim(),
    };

    if (mode === 'overwrite') {
      next[ymd] = gen;
      continue;
    }

    next[ymd] = {
      breakfast: current.breakfast.trim() ? current.breakfast : gen.breakfast,
      lunch: current.lunch.trim() ? current.lunch : gen.lunch,
      dinner: current.dinner.trim() ? current.dinner : gen.dinner,
    };
  }
  return next;
}
