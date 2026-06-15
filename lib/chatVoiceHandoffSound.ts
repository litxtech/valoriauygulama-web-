import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { prepareChatAudioPlayback } from '@/lib/chatAudioPlayback';

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** WhatsApp tarzı kısa, kısık geçiş tıkı (~55 ms). */
function buildVoiceHandoffWav(): ArrayBuffer {
  const sampleRate = 22050;
  const durationSec = 0.055;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const amp = 0.13;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack = 1 - Math.exp(-t * 900);
    const decay = Math.exp(-t * 72);
    const env = attack * decay;
    const tone =
      Math.sin(2 * Math.PI * 480 * t) * 0.55 +
      Math.sin(2 * Math.PI * 720 * t) * 0.28 +
      Math.sin(2 * Math.PI * 960 * t) * 0.08;
    const sample = Math.max(-1, Math.min(1, tone * amp * env));
    view.setInt16(offset, Math.round(sample * 32767), true);
    offset += 2;
  }
  return buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

let cachedHandoffUri: string | null = null;
let handoffSound: Audio.Sound | null = null;

async function ensureHandoffUri(): Promise<string | null> {
  if (cachedHandoffUri) return cachedHandoffUri;
  if (!FileSystem.cacheDirectory) return null;
  const path = `${FileSystem.cacheDirectory}voice-handoff.wav`;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(path, bufferToBase64(buildVoiceHandoffWav()), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  cachedHandoffUri = path;
  return path;
}

/** Sesli mesaj → sesli mesaj otomatik geçişinde kısa tık. */
export async function playVoiceHandoffSound(): Promise<void> {
  try {
    await prepareChatAudioPlayback();
    const uri = await ensureHandoffUri();
    if (!uri) return;

    if (handoffSound) {
      try {
        await handoffSound.unloadAsync();
      } catch {
        // ignore
      }
      handoffSound = null;
    }

    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 0.38 });
    handoffSound = sound;
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) {
        void sound.unloadAsync().catch(() => {});
        if (handoffSound === sound) handoffSound = null;
      }
    });
  } catch {
    // isteğe bağlı UX — akışı kesme
  }
}

export function scheduleVoiceHandoffThenPlay(play: () => void | Promise<void>, delayMs = 65): void {
  void playVoiceHandoffSound();
  setTimeout(() => {
    void play();
  }, delayMs);
}
