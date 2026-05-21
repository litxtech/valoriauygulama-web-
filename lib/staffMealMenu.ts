import { supabase } from '@/lib/supabase';
import { toLocalYmd } from '@/lib/mealMenuDate';
import { dayFillStatus, type MealFields } from '@/lib/mealMenuUi';

export type MealMenuDayRow = {
  id?: string;
  meal_date: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  notes?: string | null;
};

export type MealMenuMonthMeta = {
  id: string;
  period_month: string;
  title: string | null;
  notify_daily: boolean;
  pdf_approver_name?: string | null;
  pdf_footer_note?: string | null;
};

export type MealKitchenConfirmation = {
  id: string;
  menu_id: string;
  meal_date: string;
  confirmed_by_staff_id: string;
  prepared_meals: boolean;
  took_samples: boolean;
  preserved_samples: boolean;
  note: string | null;
  confirmed_at: string;
  confirmed_by?: { full_name: string | null } | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function periodMonthFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export function daysInMonthFromViewMonth(viewMonth: Date): number {
  return new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
}

export function ymdInViewMonth(viewMonth: Date, day: number): string {
  return `${viewMonth.getFullYear()}-${pad2(viewMonth.getMonth() + 1)}-${pad2(day)}`;
}

export function rowToMealFields(r: MealMenuDayRow): MealFields {
  return {
    breakfast: r.breakfast?.trim() ?? '',
    lunch: r.lunch?.trim() ?? '',
    dinner: r.dinner?.trim() ?? '',
  };
}

export function mealDayHasContent(fields: MealFields): boolean {
  return !!(fields.breakfast || fields.lunch || fields.dinner);
}

export async function fetchMealMenuForMonth(
  organizationId: string,
  viewMonth: Date
): Promise<{ menu: MealMenuMonthMeta | null; days: MealMenuDayRow[] }> {
  const periodMonthStr = periodMonthFromDate(viewMonth);
  const { data: menu, error: menuErr } = await supabase
    .from('staff_meal_menus')
    .select('id, period_month, title, notify_daily, pdf_approver_name, pdf_footer_note')
    .eq('organization_id', organizationId)
    .eq('period_month', periodMonthStr)
    .maybeSingle();

  if (menuErr) throw new Error(menuErr.message);
  if (!menu) return { menu: null, days: [] };

  const { data: dayRows, error: dayErr } = await supabase
    .from('staff_meal_menu_days')
    .select('id, meal_date, breakfast, lunch, dinner, notes')
    .eq('menu_id', menu.id)
    .order('meal_date', { ascending: true });

  if (dayErr) throw new Error(dayErr.message);

  const dim = daysInMonthFromViewMonth(viewMonth);
  const byDate: Record<string, MealMenuDayRow> = {};
  for (const r of (dayRows ?? []) as MealMenuDayRow[]) {
    byDate[r.meal_date.slice(0, 10)] = r;
  }
  const merged: MealMenuDayRow[] = [];
  for (let day = 1; day <= dim; day++) {
    const key = ymdInViewMonth(viewMonth, day);
    merged.push(
      byDate[key] ?? {
        meal_date: key,
        breakfast: null,
        lunch: null,
        dinner: null,
      }
    );
  }
  return { menu: menu as MealMenuMonthMeta, days: merged };
}

export async function fetchKitchenConfirmationsForMenu(menuId: string): Promise<Record<string, MealKitchenConfirmation>> {
  const { data, error } = await supabase
    .from('staff_meal_menu_day_confirmations')
    .select(
      'id, menu_id, meal_date, confirmed_by_staff_id, prepared_meals, took_samples, preserved_samples, note, confirmed_at, staff:confirmed_by_staff_id(full_name)'
    )
    .eq('menu_id', menuId);

  if (error) throw new Error(error.message);
  const map: Record<string, MealKitchenConfirmation> = {};
  for (const raw of data ?? []) {
    const row = raw as MealKitchenConfirmation & { staff?: { full_name: string | null } | null };
    map[row.meal_date.slice(0, 10)] = {
      ...row,
      confirmed_by: row.staff ? { full_name: row.staff.full_name } : null,
    };
  }
  return map;
}

export async function fetchPastMealMenuMonths(organizationId: string, limit = 24): Promise<MealMenuMonthMeta[]> {
  const today = toLocalYmd(new Date());
  const currentMonth = periodMonthFromDate(new Date());
  const { data, error } = await supabase
    .from('staff_meal_menus')
    .select('id, period_month, title, notify_daily, pdf_approver_name, pdf_footer_note')
    .eq('organization_id', organizationId)
    .lt('period_month', currentMonth)
    .order('period_month', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as MealMenuMonthMeta[];
}

export type SubmitKitchenConfirmInput = {
  organizationId: string;
  menuId: string;
  mealDate: string;
  staffId: string;
  preparedMeals: boolean;
  tookSamples: boolean;
  preservedSamples: boolean;
  note?: string;
};

export async function submitKitchenConfirmation(input: SubmitKitchenConfirmInput): Promise<void> {
  const { error } = await supabase.from('staff_meal_menu_day_confirmations').upsert(
    {
      organization_id: input.organizationId,
      menu_id: input.menuId,
      meal_date: input.mealDate,
      confirmed_by_staff_id: input.staffId,
      prepared_meals: input.preparedMeals,
      took_samples: input.tookSamples,
      preserved_samples: input.preservedSamples,
      note: input.note?.trim() || null,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,meal_date' }
  );
  if (error) throw new Error(error.message);
}

export function summarizeMonthDays(days: MealMenuDayRow[]) {
  let filled = 0;
  let partial = 0;
  let withContent = 0;
  for (const d of days) {
    const f = rowToMealFields(d);
    if (!mealDayHasContent(f)) continue;
    withContent += 1;
    const st = dayFillStatus(f);
    if (st === 'full') filled += 1;
    else if (st === 'partial') partial += 1;
  }
  return { filled, partial, withContent, total: days.length };
}
