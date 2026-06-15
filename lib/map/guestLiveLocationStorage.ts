import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_LIVE_LOCATION_TASK = 'VALORIA_GUEST_LIVE_LOCATION';
const ENABLED_KEY = 'valoria_guest_live_location_enabled_v1';
const OPT_OUT_KEY = 'valoria_guest_live_location_opt_out_v1';
const META_KEY = 'valoria_guest_live_location_meta_v1';

export type GuestLiveLocationMeta = {
  guestId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function isGuestLiveLocationEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ENABLED_KEY);
  return v === '1';
}

export async function setGuestLiveLocationEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

/** Kullanıcı haritadan kapattıysa otomatik açma yapılmaz (varsayılan: açık). */
export async function isGuestLiveLocationOptedOut(): Promise<boolean> {
  return (await AsyncStorage.getItem(OPT_OUT_KEY)) === '1';
}

export async function setGuestLiveLocationOptedOut(optedOut: boolean): Promise<void> {
  await AsyncStorage.setItem(OPT_OUT_KEY, optedOut ? '1' : '0');
}

export async function shouldAutoEnableGuestLiveLocation(): Promise<boolean> {
  return !(await isGuestLiveLocationOptedOut());
}

export async function storeGuestLiveLocationMeta(meta: GuestLiveLocationMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function readGuestLiveLocationMeta(): Promise<GuestLiveLocationMeta | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestLiveLocationMeta;
    if (parsed?.guestId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export async function clearGuestLiveLocationMeta(): Promise<void> {
  await AsyncStorage.removeItem(META_KEY);
}
