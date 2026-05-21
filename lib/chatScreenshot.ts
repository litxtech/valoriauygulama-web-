import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { notifyConversationRecipients } from '@/lib/notificationService';
import type { Message } from '@/lib/messaging';
import { log } from '@/lib/logger';
import { addScreenshotListenerSafe, isExpoScreenCaptureNativeAvailable } from '@/lib/expoScreenCaptureSafe';

const SCREENSHOT_DEBOUNCE_MS = 4000;

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

  if (!params.onMessage) return;

  let row = await fetchScreenshotMessage(messageId, conversationId);
  if (!row && params.reloadMessages) {
    const list = await params.reloadMessages();
    row = list.find((m) => m.id === messageId) ?? null;
  }
  if (row) params.onMessage(row);
}

/** Sohbet ekranında ekran görüntüsü alındığında bildir. */
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
  const lastAtRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !actor || !params?.pushBody) return;
    if (Platform.OS === 'web') return;

    let removeListener: (() => void) | undefined;
    let cancelled = false;

    if (!isExpoScreenCaptureNativeAvailable()) {
      log.info('chatScreenshot', 'native module missing — rebuild dev client after expo-screen-capture install');
      return;
    }

    void (async () => {
      const sub = await addScreenshotListenerSafe(() => {
        const now = Date.now();
        if (busyRef.current || now - lastAtRef.current < SCREENSHOT_DEBOUNCE_MS) return;
        lastAtRef.current = now;
        busyRef.current = true;
        void reportChatScreenshot(actor, {
          conversationName: params.conversationName,
          isGroup: params.isGroup,
          pushBody: params.pushBody,
          onMessage: (msg) => {
            if (params.onLocalMessage && params.ownSenderId) {
              params.onLocalMessage(msg);
            }
          },
          reloadMessages: params.reloadStaffMessages,
        }).finally(() => {
          busyRef.current = false;
        });
      });
      if (cancelled) {
        sub?.remove();
        return;
      }
      if (!sub) {
        log.warn('chatScreenshot', 'listener unavailable (rebuild dev client)');
        return;
      }
      removeListener = () => sub.remove();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [
    enabled,
    actor?.kind,
    actor?.kind === 'staff' ? actor.staffId : actor?.kind === 'guest' ? actor.appToken : '',
    actor?.conversationId,
    params?.conversationName,
    params?.isGroup,
    params?.pushBody,
    params?.onLocalMessage,
    params?.ownSenderId,
    params?.reloadStaffMessages,
  ]);
}
