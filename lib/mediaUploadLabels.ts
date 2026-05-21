import type { TFunction } from 'i18next';

/** Yükleme ilerlemesi: 0–1 arası oran → yüzde metni. */
export function uploadPercentLabel(t: TFunction, baseKey: string, ratio: number): string {
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  if (percent < 100) {
    return t(`${baseKey}Pct`, { percent });
  }
  return t(baseKey);
}

export const storyUploadLabelKeys = {
  photo: 'storyUploadPhoto',
  videoPreparing: 'storyUploadVideoPreparing',
  preview: 'storyUploadPreview',
  compressing: 'storyUploadCompressing',
  uploading: 'storyUploadToValoria',
} as const;
