import { premiumTheme } from '@/constants/premiumTheme';

/** Departman / rol → aura glow rengi */
export function getRoleAuraColor(opts: {
  role?: string | null;
  department?: string | null;
}): string {
  const role = (opts.role ?? '').toLowerCase();
  const dept = (opts.department ?? '').toLowerCase();

  if (role === 'admin' || dept.includes('manager') || dept === 'owner' || dept === 'general_manager') {
    return premiumTheme.aura.admin;
  }
  if (
    dept.includes('reception') ||
    dept.includes('front_office') ||
    dept === 'receptionist' ||
    dept === 'reception_chief'
  ) {
    return premiumTheme.aura.reception;
  }
  if (
    dept.includes('kitchen') ||
    dept.includes('chef') ||
    dept.includes('restaurant') ||
    dept.includes('bar') ||
    dept.includes('pastry')
  ) {
    return premiumTheme.aura.kitchen;
  }
  if (dept.includes('security')) return premiumTheme.aura.security;
  if (dept.includes('housekeeping') || dept.includes('cleaning')) return premiumTheme.aura.cleaning;

  return premiumTheme.aura.default;
}
