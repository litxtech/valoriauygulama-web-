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

export function rowToMealFields(r: MealMenuDayRow | null | undefined): MealFields {
  if (!r) {
    return { breakfast: '', lunch: '', dinner: '' };
  }
  return {
    breakfast: r.breakfast?.trim() ?? '',
    lunch: r.lunch?.trim() ?? '',
    dinner: r.dinner?.trim() ?? '',
  };
}

export function mealDayHasContent(fields: MealFields): boolean {
  return !!(fields.breakfast || fields.lunch || fields.dinner);
}

function mergeMenuDaysForMonth(
  viewMonth: Date,
  dayRows: MealMenuDayRow[] | null | undefined
): MealMenuDayRow[] {
  const dim = daysInMonthFromViewMonth(viewMonth);
  const byDate: Record<string, MealMenuDayRow> = {};
  for (const r of dayRows ?? []) {
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
  return merged;
}

/** Menü + günler tek istek (nested select). */
export async function fetchMealMenuForMonth(
  organizationId: string,
  viewMonth: Date
): Promise<{ menu: MealMenuMonthMeta | null; days: MealMenuDayRow[] }> {
  const periodMonthStr = periodMonthFromDate(viewMonth);
  const { data: raw, error: menuErr } = await supabase
    .from('staff_meal_menus')
    .select(
      `id, period_month, title, notify_daily, pdf_approver_name, pdf_footer_note,
       staff_meal_menu_days (id, meal_date, breakfast, lunch, dinner, notes)`
    )
    .eq('organization_id', organizationId)
    .eq('period_month', periodMonthStr)
    .maybeSingle();

  if (menuErr) throw new Error(menuErr.message);
  if (!raw) return { menu: null, days: [] };

  const nested = raw as MealMenuMonthMeta & {
    staff_meal_menu_days?: MealMenuDayRow[] | null;
  };
  const dayRows = nested.staff_meal_menu_days ?? [];
  const menu: MealMenuMonthMeta = {
    id: nested.id,
    period_month: nested.period_month,
    title: nested.title,
    notify_daily: nested.notify_daily,
    pdf_approver_name: nested.pdf_approver_name,
    pdf_footer_note: nested.pdf_footer_note,
  };
  return { menu, days: mergeMenuDaysForMonth(viewMonth, dayRows) };
}

export type StaffMealMenuBrowseBundle = {
  menu: MealMenuMonthMeta | null;
  days: MealMenuDayRow[];
};

export async function fetchStaffMealMenuBrowse(
  organizationId: string,
  viewMonth: Date
): Promise<StaffMealMenuBrowseBundle> {
  return fetchMealMenuForMonth(organizationId, viewMonth);
}

export async function fetchPastMealMenuMonths(organizationId: string, limit = 24): Promise<MealMenuMonthMeta[]> {
  const currentMonth = periodMonthFromDate(new Date());
  const { data, error } = await supabase
    .from('staff_meal_menus')
    .select('id, period_month, title, notify_daily, pdf_approver_name, pdf_footer_note')
    .eq('organization_id', organizationId)
    .lte('period_month', currentMonth)
    .order('period_month', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as MealMenuMonthMeta[];
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
