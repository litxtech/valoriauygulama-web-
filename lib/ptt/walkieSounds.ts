import { Audio } from 'expo-av';

let openSound: Audio.Sound | null = null;
let closeSound: Audio.Sound | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (openSound && closeSound) return;
  if (loading) {
    await loading;
    return;
  }
  loading = (async () => {
    // Ses oturumuna dokunma — setAudioModeAsync müzik çalmayı keser.
    // Tık sesi yalnız konuşma sırasında (LiveKit oturumu açıkken) çalınır.
    const [o, c] = await Promise.all([
      Audio.Sound.createAsync(require('@/assets/sounds/walkie_ptt_open.wav'), {
        shouldPlay: false,
        volume: 0.85,
      }),
      Audio.Sound.createAsync(require('@/assets/sounds/walkie_ptt_close.wav'), {
        shouldPlay: false,
        volume: 0.75,
      }),
    ]);
    openSound = o.sound;
    closeSound = c.sound;
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
}

async function play(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    try {
      await sound.replayAsync();
    } catch {
      /* ignore */
    }
  }
}

/** Sesleri önceden yükle (telsiz sayfası). Ses oturumu açılmaz. */
export function preloadWalkieSounds(): void {
  void ensureLoaded();
}

/** Telsiz “tık” — basınca (TX start) */
export async function playWalkiePttOpen(): Promise<void> {
  try {
    if (!openSound) await ensureLoaded();
    await play(openSound);
  } catch {
    /* ignore */
  }
}

/** Telsiz “tık” — bırakınca (TX end) */
export async function playWalkiePttClose(): Promise<void> {
  try {
    if (!closeSound) await ensureLoaded();
    await play(closeSound);
  } catch {
    /* ignore */
  }
}
