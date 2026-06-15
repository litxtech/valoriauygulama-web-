import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { log } from '@/lib/logger';
import { getNotificationSoundFeatureDef } from '@/lib/notificationSoundCatalog';

let activeSound: Audio.Sound | null = null;

async function unloadActive(): Promise<void> {
  if (!activeSound) return;
  try {
    await activeSound.stopAsync();
    await activeSound.unloadAsync();
  } catch {
    // ignore
  }
  activeSound = null;
}

/** Admin test veya foreground bildirim — uzak URL veya bundle preset */
export async function playNotificationSoundUrl(
  url: string,
  maxDurationSec = 7
): Promise<{ ok: boolean; error?: string }> {
  if (!url?.trim()) return { ok: false, error: 'Ses URL yok' };
  await unloadActive();
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true, volume: 1 }
    );
    activeSound = sound;
    const timeout = setTimeout(() => {
      void unloadActive();
    }, maxDurationSec * 1000);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        clearTimeout(timeout);
        void unloadActive();
      }
    });
    return { ok: true };
  } catch (e) {
    log.warn('notificationSoundPlayer', 'playUrl', e);
    return { ok: false, error: (e as Error).message };
  }
}

/** iOS push preset adı — bundle yoksa varsayılan sistem sesi */
export async function playNotificationSoundPreset(
  presetName: string,
  featureKey?: string,
  maxDurationSec?: number
): Promise<{ ok: boolean; error?: string }> {
  const def = featureKey ? getNotificationSoundFeatureDef(featureKey) : undefined;
  const maxSec = maxDurationSec ?? def?.maxDurationSec ?? 3;
  if (presetName === 'default' || !presetName) {
    return { ok: true };
  }
  const localName = presetName.replace(/\.(wav|caf|mp3)$/i, '');
  const candidates = [
    `${FileSystem.bundleDirectory}sounds/${presetName}`,
    `${FileSystem.bundleDirectory}sounds/${localName}.wav`,
    `${FileSystem.bundleDirectory}../assets/sounds/${presetName}`,
  ];
  for (const path of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        return playNotificationSoundUrl(path, maxSec);
      }
    } catch {
      // try next
    }
  }
  if (Platform.OS === 'ios') {
    log.warn('notificationSoundPlayer', 'bundle sound missing', presetName);
  }
  return { ok: false, error: 'Ses dosyası oynatılamıyor (bundle). Push için assets/sounds/ ekleyin.' };
}

export async function stopNotificationSoundPlayback(): Promise<void> {
  await unloadActive();
}
