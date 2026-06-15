import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

export async function pickCounterpartyProfileImage(): Promise<string | null> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri izni',
    message: 'Profil fotoğrafı seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Galeri izni kapalı. Ayarlardan izin verin.',
  });
  if (!granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.65,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function uploadCounterpartyProfileImage(
  organizationId: string,
  counterpartyId: string,
  localUri: string
): Promise<{ publicUrl: string } | { error: string }> {
  try {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: 'profiles',
      uri: localUri,
      subfolder: `finance-counterparties/${organizationId}/${counterpartyId}`,
    });
    const { error } = await supabase
      .from('finance_counterparties')
      .update({ profile_image: publicUrl })
      .eq('id', counterpartyId);
    if (error) return { error: error.message };
    return { publicUrl };
  } catch (e) {
    return { error: (e as Error)?.message ?? 'Yüklenemedi' };
  }
}

export async function clearCounterpartyProfileImage(counterpartyId: string): Promise<string | null> {
  const { error } = await supabase
    .from('finance_counterparties')
    .update({ profile_image: null })
    .eq('id', counterpartyId);
  return error?.message ?? null;
}

export function safeReportImageUrl(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u;
}
