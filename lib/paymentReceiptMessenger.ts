import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { guestOpenStaffChat, guestSendMessage } from '@/lib/messagingApi';
import type { PaymentRequestRow } from '@/lib/payments';
import { paymentKindLabel, paymentText } from '@/lib/paymentsI18n';
import {
  buildStaffTipReceiptCaption,
  prepareStaffTipReceiptInput,
} from '@/lib/staffTipReceiptPdf';
import type { StaffTipRow } from '@/lib/staffTips';
import { formatTipAmount, staffTipLang, staffTipText } from '@/lib/staffTipsI18n';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';

function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function receiptDateLocale(): string {
  const map: Record<string, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    ar: 'ar-SA',
    de: 'de-DE',
    fr: 'fr-FR',
    ru: 'ru-RU',
    es: 'es-ES',
  };
  return map[staffTipLang()] ?? 'tr-TR';
}

function formatPaidAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(receiptDateLocale(), {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function buildTipReceiptChatMessage(tipRow: StaffTipRow): Promise<string | null> {
  const input = await prepareStaffTipReceiptInput(tipRow);
  if (!input) return null;

  const lines = [
    `🧾 ${staffTipText('tipReceiptTitle')}`,
    '',
    buildStaffTipReceiptCaption(input),
    '',
    `${staffTipText('tipReceiptNo')}: ${shortRef(input.id)}`,
    `${staffTipText('tipReceiptPaidAt')}: ${formatPaidAt(input.confirmed_at)}`,
    `${staffTipText('tipReceiptStaff')}: ${input.staffName}`,
    `${staffTipText('tipReceiptAmount')}: ${formatTipAmount(input.amount, input.currency)}`,
  ];

  if (input.room_number?.trim()) {
    lines.push(`${staffTipText('tipReceiptRoom')}: ${input.room_number.trim()}`);
  }
  if (input.note?.trim()) {
    lines.push(`${staffTipText('tipReceiptNote')}: ${input.note.trim()}`);
  }

  return lines.join('\n');
}

export function buildPaymentReceiptChatMessage(row: PaymentRequestRow): string {
  const amount = formatTipAmount(Number(row.amount), (row.currency ?? 'try').toLowerCase());
  const lines = [
    `🧾 ${staffTipText('paymentReceiptMessageTitle')}`,
    '',
    `${staffTipText('paymentReceiptMessageTitleField')}: ${(row.title ?? '').trim() || '—'}`,
    `${staffTipText('paymentReceiptMessageAmount')}: ${amount}`,
    `${staffTipText('paymentReceiptMessageCategory')}: ${paymentKindLabel(row.service_kind)}`,
    `${staffTipText('paymentReceiptMessageDate')}: ${formatPaidAt(row.paid_at ?? row.updated_at)}`,
    `${staffTipText('paymentReceiptMessageRef')}: ${shortRef(row.id)}`,
    `${staffTipText('paymentReceiptMessageStatus')}: ${paymentText('paymentsPaid').replace(' ✓', '')}`,
  ];

  if (row.description?.trim()) {
    lines.push(`${paymentText('paymentsDescription')}: ${row.description.trim()}`);
  }

  return lines.join('\n');
}

export async function sendPaymentReceiptViaInAppChat(params: {
  adminStaffId: string;
  message: string;
}): Promise<{ conversationId: string | null; error?: string }> {
  const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
  if (!token) {
    return { conversationId: null, error: staffTipText('paymentReceiptLoginRequired') };
  }

  const { conversationId, error } = await guestOpenStaffChat(token, params.adminStaffId);
  if (!conversationId) {
    return { conversationId: null, error: error ?? staffTipText('paymentReceiptSendFailed') };
  }

  const sent = await guestSendMessage(token, conversationId, params.message, 'text');
  if (!sent.messageId) {
    return { conversationId, error: sent.error ?? staffTipText('paymentReceiptSendFailed') };
  }

  return { conversationId };
}
