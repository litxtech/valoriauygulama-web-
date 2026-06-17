import { Alert, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  ADMIN_NOTE_TAG_LABELS,
  quickNoteAuthorLabel,
  type AdminQuickNoteMediaRow,
  type AdminQuickNoteRow,
} from '@/lib/adminQuickNotes';
import { log } from '@/lib/logger';

export function buildQuickNoteShareText(note: AdminQuickNoteRow): string {
  const when = new Date(note.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const lines = [
    `📝 ${note.note_number}`,
    note.title?.trim() || null,
    note.body_text?.trim() || null,
    `Etiket: ${ADMIN_NOTE_TAG_LABELS[note.tag]}`,
    note.room_label ? `Konum: ${note.room_label}` : null,
    `Yazan: ${quickNoteAuthorLabel(note)}`,
    when,
  ].filter(Boolean);
  return lines.join('\n\n');
}

export async function shareQuickNoteText(note: AdminQuickNoteRow): Promise<void> {
  const message = buildQuickNoteShareText(note);
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: note.note_number, text: message });
      return;
    }
    await Share.share({ message });
    return;
  }
  await Share.share({ message, title: note.note_number });
}

function mimeForMedia(type: 'image' | 'video', url: string): string {
  if (type === 'video') {
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    if (ext === 'mov' || ext === 'quicktime') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  }
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extForMedia(type: 'image' | 'video', url: string): string {
  const fromUrl = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (type === 'video') return fromUrl === 'mov' ? 'mov' : fromUrl === 'webm' ? 'webm' : 'mp4';
  if (fromUrl === 'png' || fromUrl === 'webp' || fromUrl === 'jpg' || fromUrl === 'jpeg') return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  return 'jpg';
}

export async function shareQuickNoteMedia(
  media: Pick<AdminQuickNoteMediaRow, 'public_url' | 'media_type'>,
  noteNumber: string
): Promise<void> {
  const url = media.public_url?.trim();
  if (!url) {
    Alert.alert('Paylaşım', 'Medya adresi bulunamadı.');
    return;
  }
  try {
    const ext = extForMedia(media.media_type, url);
    const local = `${FileSystem.cacheDirectory ?? ''}note-share-${Date.now()}.${ext}`;
    const dl = await FileSystem.downloadAsync(url, local);
    if (dl.status !== 200) throw new Error('Dosya indirilemedi');

    const mime = mimeForMedia(media.media_type, url);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dl.uri, { mimeType: mime, dialogTitle: `${noteNumber} — medya` });
      return;
    }
    await Share.share({
      url: Platform.OS === 'ios' ? dl.uri : dl.uri,
      message: `${noteNumber} eki`,
    });
  } catch (e) {
    log.warn('adminQuickNoteShare', 'media share failed', e);
    Alert.alert('Paylaşım', (e as Error)?.message ?? 'Medya paylaşılamadı');
  }
}

export async function shareQuickNoteWithOptions(note: AdminQuickNoteRow): Promise<void> {
  const hasMedia = (note.media?.length ?? 0) > 0;
  if (!hasMedia) {
    await shareQuickNoteText(note);
    return;
  }

  Alert.alert('Paylaş', note.note_number, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Metin', onPress: () => void shareQuickNoteText(note) },
    {
      text: 'İlk medya',
      onPress: () => {
        const first = note.media![0];
        void shareQuickNoteMedia(first, note.note_number);
      },
    },
    {
      text: 'Metin + tüm medya sırayla',
      onPress: async () => {
        await shareQuickNoteText(note);
        for (const m of note.media ?? []) {
          await shareQuickNoteMedia(m, note.note_number);
        }
      },
    },
  ]);
}
