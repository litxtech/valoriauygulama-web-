import type { ParticipantType } from '@/lib/messaging';
import {
  buildChatMentionPushCopy,
  buildChatMessagePushCopy,
  buildChatMediaPushCopy,
  chatPushDataExtras,
  truncateChatPushPreview,
} from '@/lib/chatPushNotification';
import { notifyConversationRecipients } from '@/lib/notificationService';

export type ChatMention = {
  participant_id: string;
  participant_type: ParticipantType;
  display_name: string;
};

export type ChatMentionParticipant = ChatMention & {
  avatar?: string | null;
};

export function mentionToken(displayName: string): string {
  return `@${displayName.trim()}`;
}

export function parseActiveMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, Math.max(0, cursor));
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const afterAt = before.slice(at + 1);
  if (afterAt.includes('\n')) return null;
  if (/\s/.test(afterAt)) return null;
  return afterAt;
}

export function filterMentionParticipants(
  participants: ChatMentionParticipant[],
  query: string | null
): ChatMentionParticipant[] {
  const q = (query ?? '').trim().toLocaleLowerCase('tr');
  if (!q) return participants.slice(0, 40);
  return participants
    .filter((p) => p.display_name.toLocaleLowerCase('tr').includes(q))
    .slice(0, 40);
}

export function insertMentionInText(
  text: string,
  cursor: number,
  participant: ChatMentionParticipant
): { text: string; cursor: number; mention: ChatMention } {
  const before = text.slice(0, Math.max(0, cursor));
  const after = text.slice(Math.max(0, cursor));
  const at = before.lastIndexOf('@');
  const prefix = at >= 0 ? before.slice(0, at) : before;
  const token = mentionToken(participant.display_name);
  const nextText = `${prefix}${token} ${after}`;
  const nextCursor = prefix.length + token.length + 1;
  return {
    text: nextText,
    cursor: nextCursor,
    mention: {
      participant_id: participant.participant_id,
      participant_type: participant.participant_type,
      display_name: participant.display_name,
    },
  };
}

export function syncMentionsWithText(text: string, mentions: ChatMention[]): ChatMention[] {
  const seen = new Set<string>();
  const out: ChatMention[] = [];
  for (const m of mentions) {
    const key = `${m.participant_type}:${m.participant_id}`;
    if (seen.has(key)) continue;
    if (!text.includes(mentionToken(m.display_name))) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export type MentionTextSegment = { kind: 'text' | 'mention'; value: string; mention?: ChatMention };

export function parseMessageMentions(raw: unknown): ChatMention[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (m): m is ChatMention =>
        Boolean(m) &&
        typeof (m as ChatMention).participant_id === 'string' &&
        typeof (m as ChatMention).display_name === 'string'
    );
  }
  if (typeof raw === 'string') {
    try {
      return parseMessageMentions(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function buildMentionTextSegments(content: string, mentions?: ChatMention[] | null): MentionTextSegment[] {
  const text = content ?? '';
  const list = (mentions ?? []).filter((m) => m.display_name?.trim());
  if (!list.length || !text) return [{ kind: 'text', value: text }];

  const sorted = [...list].sort((a, b) => b.display_name.length - a.display_name.length);
  const segments: MentionTextSegment[] = [];
  let i = 0;
  while (i < text.length) {
    let matched: ChatMention | null = null;
    for (const m of sorted) {
      const token = mentionToken(m.display_name);
      if (text.startsWith(token, i)) {
        matched = m;
        break;
      }
    }
    if (matched) {
      const token = mentionToken(matched.display_name);
      segments.push({ kind: 'mention', value: token, mention: matched });
      i += token.length;
      continue;
    }
    const nextAt = text.indexOf('@', i + 1);
    const end = nextAt >= 0 ? nextAt : text.length;
    segments.push({ kind: 'text', value: text.slice(i, end) });
    i = end;
  }
  return segments.length ? segments : [{ kind: 'text', value: text }];
}

export async function notifyChatMessageWithMentions(params: {
  conversationId: string;
  conversationTitle: string;
  messageText: string;
  mentions: ChatMention[];
  senderDisplayName: string;
  isGroup?: boolean;
  excludeStaffId?: string;
  excludeAppToken?: string;
  chatUrl: string;
}): Promise<void> {
  const {
    conversationId,
    conversationTitle,
    messageText,
    mentions,
    senderDisplayName,
    isGroup,
    excludeStaffId,
    excludeAppToken,
    chatUrl,
  } = params;

  const preview = truncateChatPushPreview(messageText);
  const pushBase = {
    senderDisplayName,
    messagePreview: preview,
    conversationTitle,
    isGroup,
  };
  const defaultCopy = buildChatMessagePushCopy(pushBase);
  const mentionCopy = buildChatMentionPushCopy(pushBase);

  const staffMentioned = [
    ...new Set(
      mentions.filter((m) => m.participant_type !== 'guest').map((m) => m.participant_id)
    ),
  ];
  const guestMentioned = [
    ...new Set(
      mentions.filter((m) => m.participant_type === 'guest').map((m) => m.participant_id)
    ),
  ];

  const dataExtras = chatPushDataExtras({
    conversationId,
    senderDisplayName,
    messagePreview: preview,
    isGroup,
    subtitle: defaultCopy.subtitle,
    url: chatUrl,
    notificationType: 'chat_message',
  });

  if (staffMentioned.length || guestMentioned.length) {
    await notifyConversationRecipients({
      conversationId,
      excludeStaffId,
      excludeAppToken,
      onlyStaffIds: staffMentioned.length ? staffMentioned : undefined,
      onlyGuestIds: guestMentioned.length ? guestMentioned : undefined,
      title: mentionCopy.title,
      subtitle: mentionCopy.subtitle,
      body: mentionCopy.body,
      data: {
        ...dataExtras,
        notificationType: 'chat_mention',
        pushSubtitle: mentionCopy.subtitle,
      },
    }).catch(() => {});
  }

  await notifyConversationRecipients({
    conversationId,
    excludeStaffId,
    excludeAppToken,
    excludeStaffIds: staffMentioned,
    excludeGuestIds: guestMentioned,
    title: defaultCopy.title,
    subtitle: defaultCopy.subtitle,
    body: defaultCopy.body,
    data: dataExtras,
  }).catch(() => {});
}

/** Fotoğraf / video / ses gibi medya mesajları için push. */
export async function notifyChatMediaPush(params: {
  conversationId: string;
  conversationTitle?: string | null;
  senderDisplayName: string;
  isGroup?: boolean;
  kind: import('@/lib/chatPushNotification').ChatMediaKind;
  excludeStaffId?: string;
  excludeAppToken?: string;
  chatUrl: string;
}): Promise<void> {
  const copy = buildChatMediaPushCopy({
    senderDisplayName: params.senderDisplayName,
    kind: params.kind,
    conversationTitle: params.conversationTitle,
    isGroup: params.isGroup,
  });
  await notifyConversationRecipients({
    conversationId: params.conversationId,
    excludeStaffId: params.excludeStaffId,
    excludeAppToken: params.excludeAppToken,
    title: copy.title,
    subtitle: copy.subtitle,
    body: copy.body,
    data: chatPushDataExtras({
      conversationId: params.conversationId,
      senderDisplayName: params.senderDisplayName,
      messagePreview: copy.body,
      isGroup: params.isGroup,
      subtitle: copy.subtitle,
      url: params.chatUrl,
      notificationType: 'chat_message',
    }),
  }).catch(() => {});
}
