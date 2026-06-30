import type { Href } from 'expo-router';
import {
  DEFAULT_CONTRACT_QR_LANG,
  DEFAULT_CONTRACT_QR_TOKEN,
} from '@/constants/publicWebPaths';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';

export { publicPaymentNewHref, type PublicPaymentQrMode } from '@/lib/paymentNewRoute';

/** Canlı menü QR varsayılan işletme kodu */
export const DEFAULT_PUBLIC_MENU_ORG_SLUG = (
  process.env.EXPO_PUBLIC_PUBLIC_MENU_ORG_SLUG ?? 'valoria'
)
  .trim()
  .toLowerCase();

export function publicMenuHref(slug: string = DEFAULT_PUBLIC_MENU_ORG_SLUG): Href {
  return { pathname: '/menu/[slug]', params: { slug: slug.trim().toLowerCase() } } as Href;
}

export function publicContractHref(): Href {
  return {
    pathname: '/guest/sign-one',
    params: { t: DEFAULT_CONTRACT_QR_TOKEN, l: DEFAULT_CONTRACT_QR_LANG },
  } as Href;
}

export function publicMaliyeHref(): Href {
  return { pathname: '/maliye', params: { token: FIXED_MALIYE_QR_TOKEN } } as Href;
}
