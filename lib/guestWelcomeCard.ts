import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_PREFIX = '@valoria/guest_welcome_pending_';
const DISMISSED_PREFIX = '@valoria/guest_welcome_dismissed_';

/** Yeni misafir hesabı oluşturulduğunda karşılama kartını kuyruğa alır. */
export async function queueGuestWelcomeCard(guestId: string): Promise<void> {
  if (!guestId) return;
  const dismissed = await AsyncStorage.getItem(DISMISSED_PREFIX + guestId);
  if (dismissed === '1') return;
  await AsyncStorage.setItem(PENDING_PREFIX + guestId, '1');
}

export async function shouldShowGuestWelcome(guestId: string): Promise<boolean> {
  if (!guestId) return false;
  const [pending, dismissed] = await Promise.all([
    AsyncStorage.getItem(PENDING_PREFIX + guestId),
    AsyncStorage.getItem(DISMISSED_PREFIX + guestId),
  ]);
  return pending === '1' && dismissed !== '1';
}

/** X veya "Şimdi değil" — bir daha gösterme. */
export async function dismissGuestWelcome(guestId: string): Promise<void> {
  if (!guestId) return;
  await AsyncStorage.multiSet([[DISMISSED_PREFIX + guestId, '1']]);
  await AsyncStorage.removeItem(PENDING_PREFIX + guestId);
}
