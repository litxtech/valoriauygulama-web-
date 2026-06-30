import { GUEST_TYPES, guestMessageTemplate } from '@/lib/notifications';
import { emergencyNotificationCopy } from '@/lib/emergencyNotificationsI18n';
import { EMERGENCY_TYPES } from '@/lib/notificationTypes';
import {
  buildStaffEmergencyNotificationCopy,
  isStaffEmergencyAlertNotification,
  staffEmergencyAlertFromData,
} from '@/lib/staffEmergency';
import { supabase } from '@/lib/supabase';
import {
  appLangCode,
  getCachedTranslation,
  likelyNeedsTranslation,
  translateText,
} from '@/lib/translateText';

export type NotificationLike = {
  id: string;
  title: string;
  body: string | null;
  notification_type?: string | null;
  category?: string | null;
  data?: Record<string, unknown> | null;
};

export type LocalizedNotificationText = {
  title: string;
  body: string | null;
};

const GUEST_TYPE_SET = new Set<string>(Object.values(GUEST_TYPES));
const EMERGENCY_TYPE_SET = new Set<string>(Object.values(EMERGENCY_TYPES));

function normalizeLang(lang: string): string {
  const code = lang.toLowerCase().split('-')[0];
  const supported = new Set(['tr', 'en', 'ar', 'de', 'fr', 'ru', 'es']);
  return supported.has(code) ? code : 'en';
}

function ctxFromData(data: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  const keys = [
    'roomNumber',
    'room_number',
    'requestLabel',
    'estimate',
    'summary',
    'authorName',
    'author_name',
  ] as const;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  if (!out.roomNumber && out.room_number) out.roomNumber = out.room_number;
  if (!out.authorName && out.author_name) out.authorName = out.author_name;
  return out;
}

export function readPersistedNotificationI18n(
  data: unknown,
  lang: string
): LocalizedNotificationText | null {
  if (!data || typeof data !== 'object') return null;
  const i18n = (data as { i18n?: unknown }).i18n;
  if (!i18n || typeof i18n !== 'object') return null;
  const block = (i18n as Record<string, unknown>)[normalizeLang(lang)];
  if (!block || typeof block !== 'object') return null;
  const title = (block as { title?: unknown }).title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const bodyRaw = (block as { body?: unknown }).body;
  const body =
    typeof bodyRaw === 'string' ? (bodyRaw.trim() ? bodyRaw.trim() : null) : null;
  return { title: title.trim(), body };
}

function tryTemplateCopy(
  row: NotificationLike,
  lang: string
): LocalizedNotificationText | null {
  const type = row.notification_type?.trim();
  if (!type) return null;
  if (GUEST_TYPE_SET.has(type) || type.startsWith('guest_')) {
    const copy = guestMessageTemplate(type, ctxFromData(row.data), lang);
    if (copy.title !== type || (copy.body?.trim() ?? '').length > 0) {
      return { title: copy.title, body: copy.body?.trim() ? copy.body.trim() : null };
    }
  }
  if (isStaffEmergencyAlertNotification(type)) {
    const payload = staffEmergencyAlertFromData(row.data, row.body);
    if (payload.location || payload.authorName || payload.note) {
      const copy = buildStaffEmergencyNotificationCopy(payload);
      return { title: copy.title, body: copy.body };
    }
    return null;
  }
  if (EMERGENCY_TYPE_SET.has(type) || type.includes('emergency')) {
    const copy = emergencyNotificationCopy(type, lang);
    return { title: copy.title, body: copy.body?.trim() ? copy.body.trim() : null };
  }
  return null;
}

export function resolveNotificationDisplaySync(
  row: NotificationLike,
  targetLang?: string
): LocalizedNotificationText {
  const lang = normalizeLang(targetLang ?? appLangCode());
  const templated = tryTemplateCopy(row, lang);
  if (templated) return templated;

  const persisted = readPersistedNotificationI18n(row.data, lang);
  if (persisted) return persisted;

  const title =
    getCachedTranslation(row.title, lang) ??
    (!likelyNeedsTranslation(row.title, lang) ? row.title.trim() : row.title);
  const bodyTrimmed = row.body?.trim() ?? '';
  const body = bodyTrimmed
    ? getCachedTranslation(bodyTrimmed, lang) ??
      (!likelyNeedsTranslation(bodyTrimmed, lang) ? bodyTrimmed : bodyTrimmed)
    : null;

  return { title, body };
}

async function persistGuestI18n(
  appToken: string,
  notificationId: string,
  lang: string,
  text: LocalizedNotificationText
): Promise<void> {
  await supabase.rpc('persist_guest_notification_i18n', {
    p_app_token: appToken,
    p_notification_id: notificationId,
    p_lang: lang,
    p_title: text.title,
    p_body: text.body ?? '',
  });
}

async function persistStaffI18n(
  notificationId: string,
  lang: string,
  text: LocalizedNotificationText
): Promise<void> {
  await supabase.rpc('persist_staff_notification_i18n', {
    p_notification_id: notificationId,
    p_lang: lang,
    p_title: text.title,
    p_body: text.body ?? '',
  });
}

async function translateNotificationFields(
  row: NotificationLike,
  lang: string
): Promise<LocalizedNotificationText> {
  const titleRes = await translateText(row.title, { targetLang: lang });
  let body: string | null = null;
  const bodySrc = row.body?.trim();
  if (bodySrc) {
    const bodyRes = await translateText(bodySrc, { targetLang: lang });
    body = bodyRes.translated.trim() || null;
  }
  return {
    title: titleRes.translated.trim() || row.title,
    body,
  };
}

function needsApiLocalization(row: NotificationLike, lang: string): boolean {
  if (tryTemplateCopy(row, lang)) return false;
  if (readPersistedNotificationI18n(row.data, lang)) return false;
  const titleNeed = likelyNeedsTranslation(row.title, lang);
  const bodyNeed = row.body?.trim() ? likelyNeedsTranslation(row.body, lang) : false;
  return titleNeed || bodyNeed;
}

/** Liste yüklendiğinde eksik çevirileri bir kez üretir ve DB'ye yazar. */
export async function ensureNotificationsLocalized(
  rows: NotificationLike[],
  options: { guestAppToken?: string | null; staffPersist?: boolean }
): Promise<Record<string, LocalizedNotificationText>> {
  const lang = appLangCode();
  const out: Record<string, LocalizedNotificationText> = {};

  for (const row of rows) {
    out[row.id] = resolveNotificationDisplaySync(row, lang);
  }

  const toTranslate = rows.filter((row) => needsApiLocalization(row, lang));
  await Promise.all(
    toTranslate.map(async (row) => {
      try {
        const localized = await translateNotificationFields(row, lang);
        out[row.id] = localized;
        if (options.guestAppToken) {
          await persistGuestI18n(options.guestAppToken, row.id, lang, localized);
        } else if (options.staffPersist) {
          await persistStaffI18n(row.id, lang, localized);
        }
      } catch {
        // Orijinal metin kalır
      }
    })
  );

  return out;
}
