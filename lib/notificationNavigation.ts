import { InteractionManager, Platform } from 'react-native';
import type { Href, Router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { safeRouterPush } from '@/lib/safeRouter';
import { log } from '@/lib/logger';
import {
  isStaffMealMenuDailyNotification,
  staffMealMenuNotificationHref,
} from '@/lib/staffMealMenuNotification';
import { buildAnnouncementActionHref } from '@/lib/staffNotificationActions';

export type NotificationNavContext = {
  isStaff?: boolean;
  pathnameIsAdmin?: boolean;
};

let pendingPushData: Record<string, unknown> | null = null;

export function stashPendingNotificationData(data: Record<string, unknown> | undefined | null): boolean {
  if (!data || typeof data !== 'object') return false;
  pendingPushData = data;
  return true;
}

export function hasPendingNotificationData(): boolean {
  return pendingPushData != null;
}

export function clearPendingNotificationData(): void {
  pendingPushData = null;
}

function pickStr(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const raw = data[k];
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) return t;
    } else if (raw != null) {
      const t = String(raw).trim();
      if (t) return t;
    }
  }
  return '';
}

function notificationTypeOf(data: Record<string, unknown>): string {
  return pickStr(data, 'notificationType', 'notification_type');
}

function normalizeNotificationUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const rawUrl = raw.trim();
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      return new URL(rawUrl).pathname || '';
    } catch {
      return '';
    }
  }
  if (rawUrl.includes('://')) {
    return rawUrl.slice(rawUrl.indexOf('://') + 3).replace(/^[^/]+/, '');
  }
  return rawUrl;
}

function parseConversationIdFromPayload(data: Record<string, unknown>): string | undefined {
  const id = pickStr(data, 'conversationId', 'conversation_id');
  return id || undefined;
}

function resolveMessagePushHref(
  url: string,
  conversationIdFromData?: string
):
  | { pathname: '/staff/chat/[id]'; params: { id: string } }
  | { pathname: '/customer/chat/[id]'; params: { id: string } }
  | { pathname: '/admin/messages/chat/[id]'; params: { id: string } }
  | null {
  const base = (url.split('?')[0] || '').replace(/\/+$/, '') || '';
  const staff = base.match(/^\/staff\/chat\/([^/]+)$/);
  if (staff?.[1]) return { pathname: '/staff/chat/[id]', params: { id: staff[1] } };
  const customer = base.match(/^\/customer\/chat\/([^/]+)$/);
  if (customer?.[1]) return { pathname: '/customer/chat/[id]', params: { id: customer[1] } };
  const admin = base.match(/^\/admin\/messages\/chat\/([^/]+)$/);
  if (admin?.[1]) return { pathname: '/admin/messages/chat/[id]', params: { id: admin[1] } };
  if (
    conversationIdFromData &&
    (base === '/staff/(tabs)/messages' || base.startsWith('/staff/(tabs)/messages/'))
  ) {
    return { pathname: '/staff/chat/[id]', params: { id: conversationIdFromData } };
  }
  return null;
}

function defaultNotificationsHref(ctx?: NotificationNavContext): Href {
  const isStaff = ctx?.isStaff ?? !!useAuthStore.getState().staff;
  return isStaff ? '/staff/notifications' : '/customer/notifications';
}

function resolveByNotificationType(
  notificationType: string,
  data: Record<string, unknown>,
  ctx?: NotificationNavContext
): Href | null {
  const isStaff = ctx?.isStaff ?? !!useAuthStore.getState().staff;
  const debtId = pickStr(data, 'debt_id', 'debtId');
  const assignmentId = pickStr(data, 'assignmentId', 'openAssignmentId');
  const conversationId = parseConversationIdFromPayload(data);

  switch (notificationType) {
    case 'staff_room_cleaning_status':
    case 'staff_room_cleaning_plan_note_saved':
    case 'staff_room_cleaning_plan':
      return '/staff/cleaning-plan';
    case 'staff_board_announcement':
    case 'admin_announcement': {
      const boardId = pickStr(data, 'boardAnnouncementId', 'announcementId');
      if (boardId) {
        return { pathname: '/staff/board', params: { boardAnnouncementId: boardId } } as Href;
      }
      return '/staff/board';
    }
    case 'staff_feature_intro': {
      const boardId = pickStr(data, 'boardAnnouncementId', 'announcementId');
      const videoUrl = pickStr(data, 'videoUrl', 'video_url');
      const imageUrlsRaw = data.imageUrls;
      const imageUrls =
        Array.isArray(imageUrlsRaw)
          ? imageUrlsRaw.filter((u): u is string => typeof u === 'string' && !!u.trim()).join(',')
          : '';
      if (videoUrl || boardId) {
        return {
          pathname: videoUrl ? '/staff/announcement-action' : '/staff/board',
          params: {
            title: pickStr(data, 'introTitle', 'title'),
            body: pickStr(data, 'introBody', 'body'),
            videoUrl,
            videoTitle: pickStr(data, 'videoTitle', 'video_title'),
            openScreen: pickStr(data, 'openScreen', 'targetScreen'),
            actionLabel: pickStr(data, 'actionLabel', 'action_label') || 'Modülü aç',
            imageUrls,
            boardAnnouncementId: boardId,
          },
        } as Href;
      }
      const openScreen = pickStr(data, 'openScreen', 'targetScreen');
      if (openScreen.startsWith('/')) return openScreen as Href;
      return '/staff/notifications';
    }
    case 'staff_assignment':
      if (assignmentId) {
        return { pathname: '/staff/tasks', params: { focusAssignment: assignmentId } };
      }
      return '/staff/tasks';
    case 'staff_task_done':
      return '/admin/tasks';
    case 'staff_debt':
      if (debtId) {
        return { pathname: '/staff/debts/[id]', params: { id: debtId } } as Href;
      }
      return '/staff/debts';
    case 'finance_counterparty_agreement':
      return '/staff/notifications';
    case 'transfer_tour':
      return isStaff ? '/staff/transfer-tour' : '/customer/transfer-tour';
    case 'stock_pending_approval':
      return isStaff ? '/staff/stock' : '/admin/stock/approvals';
    case 'expense_pending_approval':
      return isStaff ? '/staff/expenses' : '/admin/expenses';
    case 'breakfast_confirmation_uploaded':
      return '/admin/breakfast-confirm';
    case 'breakfast_confirmation_approved':
    case 'breakfast_confirmation_rejected':
      return '/staff/breakfast-confirm';
    case 'breakfast_morning_briefing':
      return '/staff/breakfast-briefing';
    case 'tech_fault_report':
      return isStaff ? '/staff/technical-assets/faults' : '/admin/technical-assets/faults';
    case 'tech_asset_status':
    case 'tech_maintenance_log': {
      const assetId = pickStr(data, 'assetId', 'asset_id');
      if (assetId) {
        if (isStaff) {
          return { pathname: '/staff/technical-assets/[id]', params: { id: assetId } } as Href;
        }
        return { pathname: '/admin/technical-assets/assets/[id]', params: { id: assetId } } as Href;
      }
      return isStaff ? '/staff/technical-assets' : '/admin/technical-assets/assets';
    }
    case 'hotel_facility_status':
      return isStaff ? '/admin/hotel-pulse' : '/customer';
    case 'report_status': {
      const reportId = pickStr(data, 'incidentReportId', 'incident_report_id', 'reportId', 'report_id');
      if (reportId) {
        const adminPath = { pathname: '/admin/incident-reports/[id]', params: { id: reportId } } as Href;
        const staffPath = { pathname: '/staff/incident-reports/[id]', params: { id: reportId } } as Href;
        return isStaff ? staffPath : adminPath;
      }
      return isStaff ? '/staff/incident-reports' : '/admin/incident-reports';
    }
    case 'department_rule':
    case 'department_rule_reminder': {
      const ruleId = pickStr(data, 'ruleId', 'rule_id');
      if (ruleId) {
        return { pathname: '/staff/department-rules/[id]', params: { id: ruleId } } as Href;
      }
      return '/staff/department-rules';
    }
    case 'kitchen_revenue_entry':
      return '/staff/kitchen-ops/revenue';
    case 'kitchen_expense_entry':
    case 'kitchen_monthly_market_expense':
      return '/staff/kitchen-ops/expenses';
    case 'message':
    case 'chat_message':
    case 'chat_mention':
    case 'chat_screenshot':
    case 'app_screenshot':
      if (conversationId) {
        if (isStaff) {
          return { pathname: '/staff/chat/[id]', params: { id: conversationId } };
        }
        return { pathname: '/customer/chat/[id]', params: { id: conversationId } };
      }
      return isStaff ? '/staff/messages' : '/customer/messages';
    case 'group_added':
      if (conversationId) {
        return { pathname: '/staff/chat/[id]', params: { id: conversationId } };
      }
      return '/staff/messages';
    case 'kbs_document_captured':
      return '/staff/kbs/capture-history';
    case 'payment_received':
    case 'payment_failed':
    case 'admin_payment_received':
    case 'admin_tip_payment': {
      const payId = pickStr(data, 'paymentRequestId', 'payment_request_id');
      const screen = pickStr(data, 'screen');
      const url = pickStr(data, 'url');
      if (screen === 'staff_payment' || url.startsWith('/staff/payments')) {
        if (payId) return `/staff/payments/${payId}` as Href;
        return '/staff/payments';
      }
      if (payId) return `/admin/payments/${payId}` as Href;
      const lane = pickStr(data, 'lane');
      if (lane === 'tips' || lane === 'kitchen' || lane === 'hotel') {
        return `/admin/payments?lane=${lane}` as Href;
      }
      return isStaff ? '/staff/payments' : '/admin/payments';
    }
    case 'staff_tip':
      return '/staff/tips';
    case 'guest_tip_paid':
    case 'staff_tip_thank_you':
      return '/customer/tips';
    case 'story_like':
    case 'story_reply':
      return isStaff ? '/staff/feed' : '/customer';
    case 'feed_like':
    case 'feed_comment':
    case 'feed_comment_reply':
    case 'staff_mention':
      return null;
    default:
      return null;
  }
}

/** Push / bildirim listesi tıklaması için hedef rota — bilinmeyen payload'da bildirimler sekmesine düşer. */
export function resolveNotificationHref(
  data: Record<string, unknown> | undefined | null,
  ctx?: NotificationNavContext
): Href {
  if (!data || typeof data !== 'object') {
    return defaultNotificationsHref(ctx);
  }

  const notificationType = notificationTypeOf(data);
  const missingItemsBase = ctx?.pathnameIsAdmin ? '/admin/missing-items' : '/staff/missing-items';

  if (notificationType === 'staff_feature_intro') {
    const videoUrl = pickStr(data, 'videoUrl', 'video_url');
    if (videoUrl) return buildAnnouncementActionHref(data);
    const openScreen = pickStr(data, 'openScreen', 'targetScreen');
    if (openScreen.startsWith('/')) return openScreen as Href;
  }

  const screenRaw = data.screen;
  const screenPath = typeof screenRaw === 'string' ? screenRaw.trim() : '';
  if (screenPath.startsWith('/')) {
    if (screenPath === '/staff/announcement-action') {
      return buildAnnouncementActionHref(data);
    }
    if (screenPath === '/staff/salary') {
      return '/staff/salary-history';
    }
    return screenPath as Href;
  }

  const url = normalizeNotificationUrl(data.url);
  const isInternalPath = url.startsWith('/');

  if (
    notificationType === 'staff_room_cleaning_status' ||
    notificationType === 'staff_room_cleaning_plan_note_saved' ||
    url === '/staff/cleaning-plan'
  ) {
  if (url === '/staff/kbs/ready' || url === '/staff/kbs/capture-history') {
    return '/staff/kbs/capture-history';
  }

    return '/staff/cleaning-plan';
  }

  if (isStaffMealMenuDailyNotification(data)) {
    return staffMealMenuNotificationHref(data);
  }

  const warningId = pickStr(data, 'warningId', 'warning_id');
  if (
    notificationType === 'staff_personnel_warning' ||
    screenPath === '/staff/warnings' ||
    screenPath.startsWith('/staff/warnings')
  ) {
    if (warningId) {
      return { pathname: '/staff/warnings', params: { focus: warningId } };
    }
    return '/staff/warnings';
  }

  if (notificationType === 'staff_personnel_warning_ack') {
    const sid = pickStr(data, 'subjectStaffId', 'subject_staff_id');
    if (sid) {
      return { pathname: '/admin/staff/[id]', params: { id: sid } } as Href;
    }
    return '/admin/staff';
  }

  const storyId = pickStr(data, 'storyId', 'story_id');
  if (storyId) {
    const isStaff = ctx?.isStaff ?? !!useAuthStore.getState().staff;
    if (isStaff || url.includes('/staff')) {
      return { pathname: '/staff/feed', params: { openStoryId: storyId } };
    }
    return { pathname: '/customer', params: { openStoryId: storyId } };
  }

  const postId = pickStr(data, 'postId', 'postid');
  const conversationId = parseConversationIdFromPayload(data);

  if (conversationId) {
    const adminChatMatch = url.match(/\/admin\/messages\/chat\/([^/?#]+)/);
    if (adminChatMatch?.[1]) {
      return { pathname: '/admin/messages/chat/[id]', params: { id: adminChatMatch[1] } };
    }
    const messageHref = isInternalPath ? resolveMessagePushHref(url, conversationId) : null;
    if (messageHref) return messageHref;
    const isStaff = ctx?.isStaff ?? !!useAuthStore.getState().staff;
    if (isStaff) {
      return { pathname: '/staff/chat/[id]', params: { id: conversationId } };
    }
    return { pathname: '/customer/chat/[id]', params: { id: conversationId } };
  }

  if (postId) {
    const feedIdMatch = url.match(/^\/customer\/feed\/([^/?#]+)/);
    if (feedIdMatch?.[1] || url.includes('/customer/feed/[id]')) {
      return { pathname: '/customer/feed/[id]', params: { id: postId } };
    }
    if (url.includes('/staff/feed') || url === '/staff' || url.startsWith('/staff/')) {
      return { pathname: '/staff/feed', params: { openPostId: postId } };
    }
    const isStaff = ctx?.isStaff ?? !!useAuthStore.getState().staff;
    if (isStaff) {
      return { pathname: '/staff/feed', params: { openPostId: postId } };
    }
    return { pathname: '/customer/feed/[id]', params: { id: postId } };
  }

  const lostFoundId = pickStr(data, 'lostFoundItemId', 'lost_found_item_id');
  const lostFoundBase = ctx?.pathnameIsAdmin ? '/admin/lost-found' : '/staff/lost-found';
  if (lostFoundId) {
    return `${lostFoundBase}/${lostFoundId}` as Href;
  }
  const lostFoundUrlMatch = url.match(/\/lost-found\/([0-9a-f-]{36})/i);
  if (lostFoundUrlMatch?.[1]) {
    return `${lostFoundBase}/${lostFoundUrlMatch[1]}` as Href;
  }

  const reportIdFromData = pickStr(data, 'missingItemReportId', 'missing_item_report_id');
  const kitchenShortageReportMatch = url.match(/\/kitchen-ops\/shortages\/report\/([0-9a-f-]{36})/i);
  if (kitchenShortageReportMatch?.[1]) {
    return `/staff/kitchen-ops/shortages/report/${kitchenShortageReportMatch[1]}` as Href;
  }
  if (reportIdFromData) {
    const areaForReport = pickStr(data, 'area');
    if (areaForReport === 'kitchen' || url.includes('/kitchen-ops/shortages')) {
      return `/staff/kitchen-ops/shortages/report/${reportIdFromData}` as Href;
    }
    return `${missingItemsBase}/report/${reportIdFromData}` as Href;
  }
  if (url.includes('/kitchen-ops/shortages') || url === '/staff/kitchen-ops/shortages') {
    return '/staff/kitchen-ops/shortages' as Href;
  }
  const missingAreaMatch = url.match(/\/missing-items\/(kitchen|hotel)/);
  if (missingAreaMatch?.[1]) {
    if (missingAreaMatch[1] === 'kitchen') {
      return '/staff/kitchen-ops/shortages' as Href;
    }
    return `${missingItemsBase}/${missingAreaMatch[1]}` as Href;
  }
  const area = pickStr(data, 'area');
  if (area === 'kitchen') {
    return '/staff/kitchen-ops/shortages' as Href;
  }
  if (area === 'hotel') {
    return `${missingItemsBase}/${area}` as Href;
  }

  const assignmentId = pickStr(data, 'assignmentId', 'openAssignmentId');
  if (assignmentId && (url === '/staff/tasks' || notificationType === 'staff_assignment')) {
    return { pathname: '/staff/tasks', params: { focusAssignment: assignmentId } };
  }

  if (isInternalPath) {
    const messageHref = resolveMessagePushHref(url, conversationId);
    if (messageHref) return messageHref;
    return url as Href;
  }

  if (screenPath === 'admin' || notificationType.startsWith('admin_')) {
    if (url.startsWith('/admin')) return url as Href;
    return '/admin';
  }

  if (screenPath === 'notifications' || screenPath === 'messages') {
    return defaultNotificationsHref(ctx);
  }

  const typedHref = resolveByNotificationType(notificationType, data, ctx);
  if (typedHref) return typedHref;

  if (url) {
    return url as Href;
  }

  return defaultNotificationsHref(ctx);
}

export async function waitForNotificationNavigationReady(): Promise<void> {
  const store = useAuthStore.getState();
  await store.loadSession();
  await store.waitForStaffCheck();
}

export async function navigateFromNotificationPush(
  router: Pick<Router, 'push' | 'replace'>,
  data: Record<string, unknown> | undefined | null
): Promise<void> {
  if (!data || typeof data !== 'object') return;
  try {
    await waitForNotificationNavigationReady();
    const staff = useAuthStore.getState().staff;
    const href = resolveNotificationHref(data, { isStaff: !!staff });
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    if (Platform.OS !== 'web') {
      await new Promise((r) => setTimeout(r, 120));
    }
    safeRouterPush(router, href);
    log.info('notificationNavigation', 'push navigation', { href: JSON.stringify(href) });
  } catch (e) {
    log.warn('notificationNavigation', 'push navigation failed', e);
    safeRouterPush(router, defaultNotificationsHref());
  }
}
