import { playMrzReadSuccessBeep } from '@/lib/mrzScanBeep';

export type KbsScanSoundKind = 'read' | 'group_add' | 'submit_ok' | 'error';

const VARIANT: Record<KbsScanSoundKind, number> = {
  read: 0,
  group_add: 1,
  submit_ok: 2,
  error: 4,
};

export async function playKbsScanSound(kind: KbsScanSoundKind, soundEnabled: boolean): Promise<void> {
  await playMrzReadSuccessBeep(VARIANT[kind], soundEnabled);
}
