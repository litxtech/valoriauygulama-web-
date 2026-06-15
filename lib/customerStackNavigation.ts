import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export function customerStackCanPop(navigation?: NavigationProp<ParamListBase> | null): boolean {
  if (!navigation?.getState) return false;
  return (navigation.getState()?.routes?.length ?? 0) > 1;
}

/** ScrollView / profil ekranları: dikey kaydırma geri hareketini tetiklemesin. */
export const customerStackScrollSafeGestureOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
} as const;

/** Yalnızca sol kenardan geri; tam ekran geri kaydırma kapalı (personel yığını ile aynı). */
export function customerStackGestureForNavigation(navigation?: NavigationProp<ParamListBase> | null) {
  const canPop = customerStackCanPop(navigation);
  return {
    gestureEnabled: canPop,
    fullScreenGestureEnabled: false,
  } as const;
}
