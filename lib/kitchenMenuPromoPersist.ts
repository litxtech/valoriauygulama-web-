import { supabase } from '@/lib/supabase';
import {
  kitchenMenuThemeToPayload,
  normalizeKitchenMenuHexColor,
  type KitchenMenuPublicTheme,
} from '@/lib/kitchenMenuTheme';
import { invalidatePublicMenuCache } from '@/lib/publicKitchenMenu';

export async function persistKitchenMenuPublicTheme(params: {
  organizationId: string;
  orgSlug?: string | null;
  theme: KitchenMenuPublicTheme;
}): Promise<void> {
  const normalized: KitchenMenuPublicTheme = {
    ...params.theme,
    primaryColor: normalizeKitchenMenuHexColor(params.theme.primaryColor),
    navyColor: normalizeKitchenMenuHexColor(params.theme.navyColor),
    accentLightColor: normalizeKitchenMenuHexColor(params.theme.accentLightColor),
  };
  const payload = kitchenMenuThemeToPayload(normalized);
  const { error } = await supabase.rpc('update_kitchen_menu_public_theme', {
    p_organization_id: params.organizationId,
    p_theme: payload,
  });
  if (error) throw new Error(error.message);
  if (params.orgSlug) invalidatePublicMenuCache(params.orgSlug);
}
