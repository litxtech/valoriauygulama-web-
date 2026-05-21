import type { Href } from 'expo-router';

const MEAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pickMealDateFromNotificationData(
  data: Record<string, unknown> | null | undefined
): string | undefined {
  if (!data) return undefined;
  const raw = data.mealDate ?? data.meal_date;
  const s = typeof raw === 'string' ? raw.trim().slice(0, 10) : '';
  return MEAL_DATE_RE.test(s) ? s : undefined;
}

export function isStaffMealMenuDailyNotification(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) return false;
  const type =
    typeof data.notificationType === 'string'
      ? data.notificationType
      : typeof data.notification_type === 'string'
        ? data.notification_type
        : '';
  if (type === 'staff_meal_menu_daily') return true;
  const url = typeof data.url === 'string' ? data.url.trim() : '';
  const screen = typeof data.screen === 'string' ? data.screen.trim() : '';
  return url === '/staff/meal-menu' || screen === '/staff/meal-menu';
}

export function staffMealMenuNotificationHref(
  data?: Record<string, unknown> | null
): Href {
  const mealDate = pickMealDateFromNotificationData(data ?? undefined);
  if (mealDate) {
    return { pathname: '/staff/meal-menu', params: { mealDate } } as Href;
  }
  return '/staff/meal-menu' as Href;
}
