import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

function writeAscii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** Kısa, resepsiyon uyumlu ton (≈80–120 ms). `variant` 0–4 arası farklı frekans / çift bip. */
function buildToneWav(variant: number): ArrayBuffer {
  const sampleRate = 22050;
  const durationSec = 0.09;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const freqs = [880, 740, 660, 990, 520];
  const f1 = freqs[variant % freqs.length];
  const f2 = variant === 2 ? 990 : f1;

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
  const amp = variant === 1 ? 0.22 : 0.18;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / 120) * Math.min(1, (numSamples - i) / 400);
    const f = variant === 2 && t > durationSec * 0.48 ? f2 : f1;
    const s = Math.sin(2 * Math.PI * f * t) * amp * env;
    const sample = Math.max(-1, Math.min(1, s));
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
    offset += 2;
  }
  return buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModeReady = true;
}

/**
 * MRZ başarı anında kısa ton. Ses kapalıysa no-op.
 * Dosya cache’e yazılır, çalınır, silinmeye çalışılır.
 */
export async function playMrzReadSuccessBeep(variant: number, soundEnabled: boolean): Promise<void> {
  if (!soundEnabled) return;
  try {
    await ensureAudioMode();
    const wav = buildToneWav(Math.abs(variant) % 5);
    const b64 = bufferToBase64(wav);
    const path = `${FileSystem.cacheDirectory ?? ''}mrz-beep-${Date.now()}.wav`;
    if (!FileSystem.cacheDirectory) return;
    await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
    const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true, volume: 0.35 });
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) {
        void sound.unloadAsync();
        void FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      }
    });
  } catch {
    /* sessiz düş: resepsiyon akışı kesilmesin */
  }
}
