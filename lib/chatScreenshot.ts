import { useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { notifyConversationRecipients, notifyAdmins } from '@/lib/notificationService';
import type { Message } from '@/lib/messaging';
import { log } from '@/lib/logger';
import {
  useAppScreenshotContextStore,
  type AppScreenshotChatContext,
} from '@/stores/appScreenshotContextStore';

type ScreenshotActor =
  | {
      kind: 'staff';
      staffId: string;
      senderName: string;
      conversationId: string;
      chatUrl: string;
    }
  | {
      kind: 'guest';
      appToken: string;
      senderName: string;
      conversationId: string;
      chatUrl: string;
    };

async function fetchScreenshotMessage(messageId: string, conversationId: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Message;
}

export async function reportChatScreenshot(
  actor: ScreenshotActor,
  params: {
    conversationName: string;
    isGroup: boolean;
    pushBody: string;
    onMessage?: (msg: Message) => void;
    reloadMessages?: () => Promise<Message[]>;
    /** Merkezi politika zaten admin bildirimi gönderiyorsa */
    skipAdminNotify?: boolean;
  }
): Promise<void> {
  const { conversationId, senderName, chatUrl } = actor;
  let messageId: string | null = null;

  try {
    if (actor.kind === 'staff') {
      const { data, error } = await supabase.rpc('messaging_report_screenshot_staff', {
        p_conversation_id: conversationId,
      });
      if (error) {
        log.warn('chatScreenshot', 'staff rpc', error);
        return;
      }
      messageId = typeof data === 'string' ? data : null;
    } else {
      const { data, error } = await supabase.rpc('messaging_report_screenshot_guest', {
        p_app_token: actor.appToken,
        p_conversation_id: conversationId,
      });
      if (error) {
        log.warn('chatScreenshot', 'guest rpc', error);
        return;
      }
      messageId = typeof data === 'string' ? data : null;
    }
  } catch (e) {
    log.warn('chatScreenshot', 'report exception', e);
    return;
  }

  if (!messageId) return;

  const pushTitle = params.isGroup
    ? params.conversationName.trim() || senderName
    : senderName;

  void notifyConversationRecipients({
    conversationId,
    excludeStaffId: actor.kind === 'staff' ? actor.staffId : undefined,
    excludeAppToken: actor.kind === 'guest' ? actor.appToken : undefined,
    title: pushTitle,
    body: params.pushBody,
    data: {
      conversationId,
      url: chatUrl,
      notificationType: 'chat_screenshot',
    },
  }).catch(() => {});

  if (!params.skipAdminNotify) {
    void notifyAdmins({
      title: 'Sohbet ekran görüntüsü',
      body: params.pushBody,
      conversationId,
      data: {
        conversationId,
        url: `/admin/messages/chat/${conversationId}`,
        screen: `/admin/messages/chat/${conversationId}`,
        notificationType: 'chat_screenshot',
      },
    }).catch(() => {});
  }

  if (!params.onMessage) return;

  let row = await fetchScreenshotMessage(messageId, conversationId);
  if (!row && params.reloadMessages) {
    const list = await params.reloadMessages();
    row = list.find((m) => m.id === messageId) ?? null;
  }
  if (row) params.onMessage(row);
}

/** Sohbet ekranı bağlamını merkezi dinleyiciye bildirir. */
export function useChatScreenshotContext(
  enabled: boolean,
  ctx: AppScreenshotChatContext | null
): void {
  const setChat = useAppScreenshotContextStore((s) => s.setChat);

  useEffect(() => {
    if (!enabled || !ctx) {
      setChat(null);
      return;
    }
    setChat(ctx);
    return () => setChat(null);
  }, [
    enabled,
    setChat,
    ctx?.conversationId,
    ctx?.conversationName,
    ctx?.isGroup,
    ctx?.pushBody,
    ctx?.chatUrl,
    ctx?.actor.kind,
    ctx?.actor.kind === 'staff' ? ctx.actor.staffId : ctx?.actor.kind === 'guest' ? ctx.actor.appToken : '',
  ]);
}

/** Eski sohbet ekranları / HMR — merkezi politika ile uyumlu ince sarmalayıcı. */
export function useChatScreenshotListener(
  enabled: boolean,
  actor: ScreenshotActor | null,
  params: {
    conversationName: string;
    isGroup: boolean;
    pushBody: string;
    onLocalMessage?: (msg: Message) => void;
    ownSenderId?: string;
    reloadStaffMessages?: () => Promise<Message[]>;
  } | null
): void {
  const ctx = useMemo((): AppScreenshotChatContext | null => {
    if (!actor || !params?.pushBody) return null;
    return {
      conversationId: actor.conversationId,
      conversationName: params.conversationName,
      isGroup: params.isGroup,
      chatUrl: actor.chatUrl,
      actor:
        actor.kind === 'staff'
          ? { kind: 'staff', staffId: actor.staffId, senderName: actor.senderName }
          : { kind: 'guest', appToken: actor.appToken, senderName: actor.senderName },
      pushBody: params.pushBody,
      onLocalMessage: params.onLocalMessage,
      ownSenderId: params.ownSenderId,
      reloadStaffMessages: params.reloadStaffMessages,
    };
  }, [
    actor?.kind,
    actor?.kind === 'staff' ? actor.staffId : actor?.kind === 'guest' ? actor.appToken : '',
    actor?.conversationId,
    actor?.chatUrl,
    actor?.kind === 'staff' ? actor.senderName : actor?.kind === 'guest' ? actor.senderName : '',
    params?.conversationName,
    params?.isGroup,
    params?.pushBody,
    params?.onLocalMessage,
    params?.ownSenderId,
    params?.reloadStaffMessages,
  ]);

  useChatScreenshotContext(enabled, ctx);
}
