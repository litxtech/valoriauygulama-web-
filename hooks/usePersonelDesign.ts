import { useMemo } from 'react';
import { getPersonelDesign, type PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

/** Gündüz `pds`, gece `pdsNight` — karanlık modda asla #666/#777/#888 metin yok. */
export function usePersonelDesign(): PersonelDesignPalette {
  const { isNight } = usePremiumTheme();
  return useMemo(() => getPersonelDesign(isNight), [isNight]) as PersonelDesignPalette;
}
