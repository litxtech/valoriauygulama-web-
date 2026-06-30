import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  pickDocumentSafe,
  resolveBankStatementFileName,
} from '@/lib/documentPickerSafe';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';

export type PickedInvoiceDocument = {
  uri: string;
  fileName: string;
  kind: 'image' | 'pdf' | 'xml' | 'other';
};

const INVOICE_PICKER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/xml',
  'text/xml',
  'text/plain',
  'application/octet-stream',
] as const;

function kindFromName(name: string): PickedInvoiceDocument['kind'] {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xml') return 'xml';
  return 'other';
}

function toPicked(uri: string, name?: string | null, mime?: string | null): PickedInvoiceDocument {
  const fileName = resolveBankStatementFileName(name, mime);
  return { uri, fileName, kind: kindFromName(fileName) };
}

export async function pickInvoiceFromCamera(): Promise<PickedInvoiceDocument | null> {
  const ok = await ensureCameraPermission({
    title: 'Kamera',
    message: 'Fatura fotoğrafı için kamera gerekli.',
    settingsMessage: 'Ayarlardan kamera iznini açın.',
  });
  if (!ok) return null;
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
  });
  if (r.canceled || !r.assets[0]?.uri) return null;
  const asset = r.assets[0];
  return toPicked(asset.uri, asset.fileName ?? `fatura-${Date.now()}.jpg`, asset.mimeType);
}

export async function pickInvoiceFromGallery(): Promise<PickedInvoiceDocument[]> {
  const uris = await pickGalleryImages({ quality: 0.85, selectionLimit: 8 });
  return uris.map((uri, i) => toPicked(uri, `fatura-${Date.now()}-${i + 1}.jpg`, 'image/jpeg'));
}

export async function pickInvoiceFromFiles(): Promise<PickedInvoiceDocument[]> {
  const res = await pickDocumentSafe({
    multiple: true,
    type: [...INVOICE_PICKER_TYPES],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.map((a) => toPicked(a.uri, a.name, a.mimeType ?? null));
}

export function chooseInvoiceDocumentSource(
  onPicked: (docs: PickedInvoiceDocument[]) => void | Promise<void>
): void {
  Alert.alert('Belge seç', 'Fotoğraf, PDF veya e-Fatura — birden fazla sayfa seçebilirsiniz', [
    { text: 'İptal', style: 'cancel' },
    {
      text: 'Galeri (çoklu)',
      onPress: () => {
        void (async () => {
          const docs = await pickInvoiceFromGallery();
          if (docs.length) await onPicked(docs);
        })();
      },
    },
    {
      text: 'PDF / dosya',
      onPress: () => {
        void (async () => {
          const docs = await pickInvoiceFromFiles();
          if (docs.length) await onPicked(docs);
        })();
      },
    },
    {
      text: 'Kamera',
      onPress: () => {
        void (async () => {
          const doc = await pickInvoiceFromCamera();
          if (doc) await onPicked([doc]);
        })();
      },
    },
  ]);
}
