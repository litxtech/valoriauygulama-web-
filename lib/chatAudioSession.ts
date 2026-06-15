import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { stopAllChatVoicePlayback } from '@/lib/chatVoiceQueue';

let recordingSessionActive = false;

export function isChatRecordingSessionActive(): boolean {
  return recordingSessionActive;
}

/** Sohbet sesli mesaj dinleme — kayıt sırasında modu bozma. */
export async function prepareChatAudioPlayback(): Promise<void> {
  if (recordingSessionActive) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // ignore
  }
}

/** iOS: aktif oynatıcıyı kapat + allowsRecordingIOS:true, sonra Recording.createAsync. */
export async function prepareChatAudioRecording(): Promise<void> {
  await stopAllChatVoicePlayback();
  recordingSessionActive = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {
    recordingSessionActive = false;
    throw e;
  }
}

export async function releaseChatAudioRecording(): Promise<void> {
  recordingSessionActive = false;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // ignore
  }
}
