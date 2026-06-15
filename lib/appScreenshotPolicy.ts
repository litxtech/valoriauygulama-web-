import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { notifyConversationRecipients, notifyAdmins } from '@/lib/notificationService';
import type { Message } from '@/lib/messaging';
import { log } from '@/lib/logger';
import { reportChatScreenshot } from '@/lib/chatScreenshot';
import { useAppScreenshotWarningStore } from '@/stores/appScreenshotWarningStore';
import { useAppScreenshotContextStore, type AppScreenshotChatContext } from '@/stores/appScreenshotContextStore';
import { screenLabelFromPathname } from '@/lib/appScreenshotScreenLabels';
import { screenshotPolicyText } from '@/lib/appScreenshotPolicyI18n';
import { addScreenshotListenerSafe, isExpoScreenCaptureNativeAvailable } from '@/lib/expoScreenCaptureSafe';

const SCREENSHOT_DEBOUNCE_MS = 4000;
let loggedNativeMissing = false;
let busy = false;
let lastAt = 0;

export type ScreenshotActorKind = 'staff' | 'guest' | 'admin' | 'unknown';

export type ScreenshotReportIdentity = {
  kind: ScreenshotActorKind;
  displayName: string;
  staffId?: string;
  guestLabel?: string;
};

function buildAdminBody(params: {
  identity: ScreenshotReportIdentity;
  screenLabel: string;
  chat?: AppScreenshotChatContext | null;
}): string {
  const who = `${params.identity.displayName} (${screenshotPolicyText(
    params.identity.kind === 'staff'
      ? 'screenshotActorStaff'
      : params.identity.kind === 'guest'
        ? 'screenshotActorGuest'
        : params.identity.kind === 'admin'
          ? 'screenshotActorAdmin'
          : 'screenshotActorUnknown'
  )})`;
  const detail = params.chat?.conversationName?.trim()
    ? screenshotPolicyText('screenshotAdminDetailChat', { name: params.chat.conversationName.trim() })
    : '';
  return screenshotPolicyText('screenshotAdminBody', {
    who,
    screen: params.screenLabel,
    detail,
  });
}

export async function handleAppScreenshotDetected(params: {
  pathname: string;
  identity: ScreenshotReportIdentity;
}): Promise<void> {
  useAppScreenshotWarningStore.getState().show();

  const chat = useAppScreenshotContextStore.getState().chat;
  const screenLabel = chat
    ? screenLabelFromPathname(params.pathname)
    : screenLabelFromPathname(params.pathname);
  const adminBody = buildAdminBody({
    identity: params.identity,
    screenLabel,
    chat,
  });

  if (chat) {
    await reportChatScreenshot(
      chat.actor.kind === 'staff'
        ? {
            kind: 'staff',
            staffId: chat.actor.staffId,
            senderName: chat.actor.senderName,
            conversationId: chat.conversationId,
            chatUrl: chat.chatUrl,
          }
        : {
            kind: 'guest',
            appToken: chat.actor.appToken,
            senderName: chat.actor.senderName,
            conversationId: chat.conversationId,
            chatUrl: chat.chatUrl,
          },
      {
        conversationName: chat.conversationName,
        isGroup: chat.isGroup,
        pushBody: chat.pushBody,
        onMessage: chat.onLocalMessage,
        reloadMessages: chat.reloadStaffMessages,
        skipAdminNotify: true,
      }
    );
  }

  void notifyAdmins({
    title: screenshotPolicyText('screenshotAdminTitle'),
    body: adminBody,
    conversationId: chat?.conversationId ?? null,
    data: {
      pathname: params.pathname,
      screen: screenLabel,
      actorKind: params.identity.kind,
      actorName: params.identity.displayName,
      ...(chat?.conversationId
        ? {
            conversationId: chat.conversationId,
            url: `/admin/messages/chat/${chat.conversationId}`,
          }
        : { url: '/admin/notifications' }),
      notificationType: 'app_screenshot',
    },
  }).catch((e) => log.warn('appScreenshotPolicy', 'notifyAdmins', e));
}

export function attachAppScreenshotListener(
  enabled: boolean,
  getPayload: () => { pathname: string; identity: ScreenshotReportIdentity } | null
): () => void {
  if (!enabled || Platform.OS === 'web') return () => {};

  if (!isExpoScreenCaptureNativeAvailable()) {
    if (!loggedNativeMissing) {
      loggedNativeMissing = true;
      log.info('appScreenshotPolicy', 'native module missing — rebuild dev client after expo-screen-capture install');
    }
    return () => {};
  }

  let removeListener: (() => void) | undefined;
  let cancelled = false;

  void (async () => {
    const sub = await addScreenshotListenerSafe(() => {
      const now = Date.now();
      if (busy || now - lastAt < SCREENSHOT_DEBOUNCE_MS) return;
      const payload = getPayload();
      if (!payload) return;
      lastAt = now;
      busy = true;
      void handleAppScreenshotDetected(payload).finally(() => {
        busy = false;
      });
    });
    if (cancelled) {
      sub?.remove();
      return;
    }
    if (!sub) {
      log.warn('appScreenshotPolicy', 'listener unavailable');
      return;
    }
    removeListener = () => sub.remove();
  })();

  return () => {
    cancelled = true;
    removeListener?.();
  };
}
