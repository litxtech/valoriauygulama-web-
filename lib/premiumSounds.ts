import { hapticImpactLight } from '@/lib/hapticsSafe';

/** Hafif dokunma — premium his (haptic odaklı, ağ sesi yok) */
export async function playPremiumTap(): Promise<void> {
  hapticImpactLight();
}

export async function playPremiumPop(): Promise<void> {
  hapticImpactLight();
}

export async function playPremiumNotification(): Promise<void> {
  hapticImpactLight();
}
