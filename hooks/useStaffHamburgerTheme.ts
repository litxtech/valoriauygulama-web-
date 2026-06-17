import { useMemo } from 'react';
import {
  coalesceStaffHamburgerTheme,
  type ResolvedStaffHamburgerTheme,
} from '@/lib/staffHamburgerTheme';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

export function useStaffHamburgerTheme(): ResolvedStaffHamburgerTheme {
  const hamburger = useOrganizationUiFeaturesStore((s) => s.config?.hamburger);
  return useMemo(() => coalesceStaffHamburgerTheme(hamburger?.theme), [hamburger?.theme]);
}
