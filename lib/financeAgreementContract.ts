import { Alert, Linking } from 'react-native';
import { pickDocumentSafe } from '@/lib/documentPickerSafe';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';

const BUCKET = 'finance-receipts';
const SUBFOLDER = 'agreement-contract';

export function isImageContractUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(url);
}

export function contractFileLabel(url: string, index: number): string {
  if (isImageContractUrl(url)) return `Görsel ${index + 1}`;
  if (/\.pdf(\?|$)/i.test(url)) return `PDF ${index + 1}`;
  try {
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
    return name || `Belge ${index + 1}`;
  } catch {
    return `Belge ${index + 1}`;
  }
}

export async function uploadAgreementContract(uri: string): Promise<string> {
  const { publicUrl } = await uploadUriToPublicBucket({
    bucketId: BUCKET,
    uri,
    subfolder: SUBFOLDER,
  });
  return publicUrl;
}

export async function openAgreementContract(url: string): Promise<void> {
  const can = await Linking.canOpenURL(url);
  if (!can) {
    Alert.alert('Açılamadı', 'Belge bağlantısı açılamıyor.');
    return;
  }
  await Linking.openURL(url);
}

export async function pickAgreementContractFromFiles(): Promise<string | null> {
  const res = await pickDocumentSafe({
    multiple: false,
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  return res.assets[0].uri;
}

export async function pickAgreementContractFromCamera(): Promise<string | null> {
  const ok = await ensureCameraPermission({
    title: 'Kamera',
    message: 'Sözleşme fotoğrafı için kamera gerekli.',
    settingsMessage: 'Ayarlardan kamera iznini açın.',
  });
  if (!ok) return null;
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (r.canceled || !r.assets[0]?.uri) return null;
  return r.assets[0].uri;
}

export async function pickAgreementContractFromGallery(): Promise<string[]> {
  return pickGalleryImages({ quality: 0.8, selectionLimit: 6 });
}

export function chooseAgreementContractSource(
  onPicked: (uris: string[]) => void | Promise<void>
): void {
  Alert.alert('Sözleşme / belge ekle', 'PDF veya görsel seçin', [
    { text: 'İptal', style: 'cancel' },
    {
      text: 'PDF / dosya',
      onPress: () => {
        void (async () => {
          const uri = await pickAgreementContractFromFiles();
          if (uri) await onPicked([uri]);
        })();
      },
    },
    {
      text: 'Galeri',
      onPress: () => {
        void (async () => {
          const uris = await pickAgreementContractFromGallery();
          if (uris.length) await onPicked(uris);
        })();
      },
    },
    {
      text: 'Kamera',
      onPress: () => {
        void (async () => {
          const uri = await pickAgreementContractFromCamera();
          if (uri) await onPicked([uri]);
        })();
      },
    },
  ]);
}

export async function appendAgreementContracts(
  agreementId: string,
  newUrls: string[]
): Promise<string | null> {
  if (!newUrls.length) return null;
  const { data, error: fetchErr } = await supabase
    .from('finance_counterparty_agreements')
    .select('contract_urls')
    .eq('id', agreementId)
    .single();
  if (fetchErr) return fetchErr.message;
  const existing = Array.isArray((data as { contract_urls?: string[] })?.contract_urls)
    ? (data as { contract_urls: string[] }).contract_urls
    : [];
  const { error } = await supabase
    .from('finance_counterparty_agreements')
    .update({ contract_urls: [...existing, ...newUrls] })
    .eq('id', agreementId);
  return error?.message ?? null;
}
