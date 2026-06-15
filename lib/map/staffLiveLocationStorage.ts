import AsyncStorage from '@react-native-async-storage/async-storage';

export const STAFF_LIVE_LOCATION_TASK = 'VALORIA_STAFF_LIVE_LOCATION';
const ENABLED_KEY = 'valoria_staff_live_location_enabled_v1';
const OPT_OUT_KEY = 'valoria_staff_live_location_opt_out_v1';
const META_KEY = 'valoria_staff_live_location_meta_v1';

export type StaffLiveLocationMeta = {
  staffId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function isStaffLiveLocationEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ENABLED_KEY);
  return v === '1';
}

export async function setStaffLiveLocationEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

export async function isStaffLiveLocationOptedOut(): Promise<boolean> {
  return (await AsyncStorage.getItem(OPT_OUT_KEY)) === '1';
}

export async function setStaffLiveLocationOptedOut(optedOut: boolean): Promise<void> {
  await AsyncStorage.setItem(OPT_OUT_KEY, optedOut ? '1' : '0');
}

export async function shouldAutoEnableStaffLiveLocation(): Promise<boolean> {
  return !(await isStaffLiveLocationOptedOut());
}

export async function storeStaffLiveLocationMeta(meta: StaffLiveLocationMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function readStaffLiveLocationMeta(): Promise<StaffLiveLocationMeta | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StaffLiveLocationMeta;
    if (parsed?.staffId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export async function clearStaffLiveLocationMeta(): Promise<void> {
  await AsyncStorage.removeItem(META_KEY);
}
