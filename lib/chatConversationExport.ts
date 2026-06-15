import { Alert, Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { staffGetMessages } from '@/lib/messagingApi';
import { formatChatMessageDateTime } from '@/lib/formatChatTime';
import type { Message } from '@/lib/messaging';

const PAGE_SIZE = 250;
const MAX_PAGES = 80;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatChatMessageForExport(msg: Message): string {
  switch (msg.message_type) {
    case 'text':
      return (msg.content ?? '').trim() || '—';
    case 'image':
      return msg.media_url ? `[Fotoğraf] ${msg.media_url}` : '[Fotoğraf]';
    case 'video':
      return msg.media_url ? `[Video] ${msg.media_url}` : '[Video]';
    case 'voice':
      return msg.media_url ? `[Sesli mesaj] ${msg.media_url}` : '[Sesli mesaj]';
    case 'file':
      return `[Dosya] ${msg.file_name?.trim() || msg.media_url || '—'}`;
    case 'location':
      return `[Konum] ${msg.location_name?.trim() || '—'}${
        msg.location_lat != null && msg.location_lng != null
          ? ` (${msg.location_lat}, ${msg.location_lng})`
          : ''
      }`;
    case 'screenshot_notice':
      return `[Sistem] ${(msg.content ?? 'Ekran görüntüsü bildirimi').trim()}`;
    default:
      return (msg.content ?? `[${msg.message_type}]`).trim() || '—';
  }
}

export async function fetchAllStaffConversationMessages(
  conversationId: string,
  staffId: string,
  isAdmin = false
): Promise<Message[]> {
  if (isAdmin) {
    let merged: Message[] = [];
    let beforeCreatedAt: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let q = supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (beforeCreatedAt) q = q.lt('created_at', beforeCreatedAt);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const batch = ((data ?? []) as Message[]).reverse();
      if (!batch.length) break;
      merged = beforeCreatedAt ? [...batch, ...merged] : batch;
      if (batch.length < PAGE_SIZE) break;
      beforeCreatedAt = batch[0]?.created_at;
      if (!beforeCreatedAt) break;
    }
    return merged;
  }

  let merged: Message[] = [];
  let beforeId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await staffGetMessages(conversationId, PAGE_SIZE, beforeId, staffId);
    if (!batch.length) break;
    merged = beforeId ? [...batch, ...merged] : batch;
    if (batch.length < PAGE_SIZE) break;
    beforeId = batch[0]?.id;
    if (!beforeId) break;
  }
  return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function buildChatConversationPlainText(
  conversationName: string,
  messages: Message[]
): string {
  const header = [
    `Grup sohbeti: ${conversationName}`,
    `Toplam mesaj: ${messages.length}`,
    `Dışa aktarma: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
    '',
    '—'.repeat(32),
    '',
  ].join('\n');

  const body = messages
    .map((msg) => {
      const sender =
        msg.sender_name?.trim() ||
        (msg.sender_type === 'guest' ? 'Misafir' : msg.sender_type === 'admin' ? 'Yönetici' : 'Personel');
      const when = formatChatMessageDateTime(msg.created_at);
      const text = formatChatMessageForExport(msg);
      return `[${when}] ${sender}:\n${text}`;
    })
    .join('\n\n');

  return `${header}${body}`.trim();
}

export function buildChatConversationPdfHtml(conversationName: string, messages: Message[]): string {
  const exportedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const rows = messages
    .map((msg) => {
      const sender =
        msg.sender_name?.trim() ||
        (msg.sender_type === 'guest' ? 'Misafir' : msg.sender_type === 'admin' ? 'Yönetici' : 'Personel');
      const when = formatChatMessageDateTime(msg.created_at);
      const text = escapeHtml(formatChatMessageForExport(msg)).replace(/\n/g, '<br/>');
      return `<div class="msg">
        <div class="meta"><strong>${escapeHtml(sender)}</strong> · ${escapeHtml(when)}</div>
        <div class="body">${text}</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(conversationName)} — Sohbet kaydı</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 10.5pt; color: #0f172a; line-height: 1.45; }
    h1 { font-size: 17pt; margin: 0 0 6px; }
    .sub { color: #64748b; font-size: 9.5pt; margin-bottom: 16px; }
    .msg { border-bottom: 1px solid #e2e8f0; padding: 10px 0; page-break-inside: avoid; }
    .meta { font-size: 9pt; color: #475569; margin-bottom: 4px; }
    .body { white-space: normal; word-break: break-word; }
    .footer { margin-top: 18px; font-size: 8pt; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(conversationName)}</h1>
  <p class="sub">Grup sohbet kaydı · ${messages.length} mesaj · ${escapeHtml(exportedAt)}</p>
  ${rows || '<p>Henüz mesaj yok.</p>'}
  <div class="footer">Valoria · Grup sohbet dökümü</div>
</body>
</html>`;
}

async function createChatConversationPdf(conversationName: string, messages: Message[]): Promise<string> {
  const html = buildChatConversationPdfHtml(conversationName, messages);
  const file = await Print.printToFileAsync({ html, base64: false });
  return file.uri;
}

async function loadConversationExport(
  conversationId: string,
  staffId: string,
  conversationName: string,
  isAdmin = true
) {
  const messages = await fetchAllStaffConversationMessages(conversationId, staffId, isAdmin);
  if (!messages.length) {
    throw new Error('Yazdırılacak mesaj bulunamadı.');
  }
  return { messages, conversationName: conversationName.trim() || 'Grup sohbeti' };
}

export async function printChatConversationExport(
  conversationId: string,
  staffId: string,
  conversationName: string,
  isAdmin = true
): Promise<void> {
  const { messages, conversationName: title } = await loadConversationExport(
    conversationId,
    staffId,
    conversationName,
    isAdmin
  );
  const html = buildChatConversationPdfHtml(title, messages);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const pdfUri = await createChatConversationPdf(title, messages);
  await Print.printAsync({ uri: pdfUri });
}

export async function shareChatConversationWhatsApp(
  conversationId: string,
  staffId: string,
  conversationName: string,
  isAdmin = true
): Promise<void> {
  const { messages, conversationName: title } = await loadConversationExport(
    conversationId,
    staffId,
    conversationName,
    isAdmin
  );
  const subject = `${title} — Sohbet kaydı`;
  const plain = buildChatConversationPlainText(title, messages);

  if (plain.length <= 35000) {
    try {
      await Share.share({ message: plain, title: subject });
      return;
    } catch {
      /* PDF yedek */
    }
  }

  const pdfUri = await createChatConversationPdf(title, messages);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: subject,
    });
    return;
  }

  await Share.share({ message: plain.slice(0, 12000), title: subject });
}

export async function runChatGroupExportAction(
  action: 'print' | 'whatsapp',
  conversationId: string,
  staffId: string,
  conversationName: string
): Promise<void> {
  try {
    if (action === 'print') {
      await printChatConversationExport(conversationId, staffId, conversationName);
      return;
    }
    await shareChatConversationWhatsApp(conversationId, staffId, conversationName);
  } catch (e) {
    Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı');
    throw e;
  }
}
