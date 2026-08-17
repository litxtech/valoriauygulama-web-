import { supabase, supabaseAnonKey } from '@/lib/supabase';
import { filterStaffRecipients } from '@/lib/staffNotificationFilter';
import { enrichNotificationPushData } from '@/lib/notificationSoundPush';
import { postNotificationsReturnMinimal } from '@/lib/notificationService';
import { log } from '@/lib/logger';

/** Room yoksa yerel yedek (nadir). */
const LOCAL_FALLBACK_COOLDOWN_MS = 90_000;
let localFallbackAt = 0;

const EDGE_FN_PUSH = 'send-expo-push';

/** Sessizlik sonrası yeni oturum (sn). */
const SESSION_IDLE_SECONDS = 90;
/** İlk konuşmadan sonra konuşanları toplama (sn). */
const COLLECT_SECONDS = 2;

type ClaimAction = 'collecting' | 'notify' | 'skip';

type ClaimResult = {
  ok?: boolean;
  action?: ClaimAction;
  wait_ms?: number;
  lead_name?: string;
  other_count?: number;
  speaker_count?: number;
  error?: string;
};

function formatPttTalkBody(leadName: string, otherCount: number): string {
  const name = (leadName || 'Personel').trim() || 'Personel';
  const others = Math.max(0, Math.floor(otherCount));
  if (others <= 0) return `${name} konuşuyor — dinlemek için aç`;
  return `${name} ve ${others} kişi daha konuşuyor — dinlemek için aç`;
}

async function claimPttNotify(params: {
  roomId: string;
  speakerStaffId: string;
  speakerName: string;
  mode: 'touch' | 'flush';
}): Promise<ClaimResult | null> {
  const { data, error } = await supabase.rpc('claim_staff_ptt_talk_notify', {
    p_room_id: params.roomId,
    p_speaker_id: params.speakerStaffId,
    p_speaker_name: params.speakerName,
    p_mode: params.mode,
    p_idle_seconds: SESSION_IDLE_SECONDS,
    p_collect_seconds: COLLECT_SECONDS,
  });
  if (error) {
    log.warn('pttNotify', 'claim rpc', error.message);
    return null;
  }
  return (data ?? null) as ClaimResult | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function sendPttTalkPush(params: {
  speakerStaffId: string;
  leadName: string;
  otherCount: number;
  roomId: string;
  excludeStaffIds?: string[];
}): Promise<void> {
  const { speakerStaffId, leadName, otherCount, roomId, excludeStaffIds } = params;
  const title = 'Bas-konuş';
  const body = formatPttTalkBody(leadName, otherCount);
  const notificationType = 'staff_ptt_talk';
  const PTT_PUSH_SOUND = 'walkie_ptt_open.wav';
  const PTT_ANDROID_CHANNEL = 'valoria_ns_staff_ptt_v2';
  const data = enrichNotificationPushData({
    notificationType,
    category: 'staff',
    data: {
      screen: '/staff/ptt',
      url: '/staff/ptt',
      autoJoin: '1',
      roomId,
      speakerStaffId,
      speakerName: leadName,
      otherCount,
      notificationType,
      notification_type: notificationType,
      feature_key: 'staff_ptt',
      sound: PTT_PUSH_SOUND,
      androidChannelId: PTT_ANDROID_CHANNEL,
      interruptionLevel: 'time-sensitive',
      attention: true,
    },
  });

  const { data: members, error: fetchError } = await supabase
    .from('staff_ptt_room_members')
    .select('staff_id')
    .eq('room_id', roomId);
  if (fetchError) {
    log.warn('pttNotify', 'members query', fetchError.message);
    return;
  }

  const excludeSet = new Set([speakerStaffId, ...(excludeStaffIds ?? [])].filter(Boolean));
  const rawIds = (members ?? [])
    .map((s: { staff_id: string }) => s.staff_id)
    .filter((id) => id && !excludeSet.has(id));
  if (rawIds.length === 0) return;

  const filteredStaffIds = await filterStaffRecipients(rawIds, notificationType);
  if (filteredStaffIds.length === 0) return;

  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
      const { error } = await supabase.functions.invoke(EDGE_FN_PUSH, {
        body: {
          staffIds: filteredStaffIds,
          title,
          body,
          data,
        },
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (error) log.warn('pttNotify', 'push', error);
      else {
        log.info('pttNotify', 'push sent', {
          count: filteredStaffIds.length,
          speakerStaffId,
          roomId,
          otherCount,
        });
      }
    } catch (e) {
      log.warn('pttNotify', 'push exception', e);
    }
  })();

  void postNotificationsReturnMinimal(
    filteredStaffIds.map((staffId) => ({
      guest_id: null,
      staff_id: staffId,
      title,
      body,
      category: 'staff',
      notification_type: notificationType,
      data,
      created_by: speakerStaffId,
      sent_via: 'both',
      sent_at: new Date().toISOString(),
    }))
  ).then((res) => {
    if (res.error) log.warn('pttNotify', 'persist', res.error.message);
  });
}

/**
 * Biri bas-konuşa başlayınca: oda üyelerine tek bildirim.
 * Odadaki (LiveKit bağlı) kişiler exclude edilir — zaten duyuyorlar.
 * Odadan çıkmış üyeler listede olmadığı için push almaz.
 */
export async function notifyStaffPttTalkStarted(params: {
  speakerStaffId: string;
  speakerName: string;
  roomId: string;
  excludeStaffIds?: string[];
}): Promise<void> {
  const { speakerStaffId, speakerName, roomId, excludeStaffIds } = params;
  if (!speakerStaffId || !roomId) return;

  const name = (speakerName || 'Personel').trim() || 'Personel';

  try {
    const touch = await claimPttNotify({
      roomId,
      speakerStaffId,
      speakerName: name,
      mode: 'touch',
    });

    if (!touch) {
      const now = Date.now();
      if (now - localFallbackAt < LOCAL_FALLBACK_COOLDOWN_MS) return;
      localFallbackAt = now;
      await sendPttTalkPush({
        speakerStaffId,
        leadName: name,
        otherCount: 0,
        roomId,
        excludeStaffIds,
      });
      return;
    }

    if (touch.action === 'skip') return;

    if (touch.action === 'notify') {
      await sendPttTalkPush({
        speakerStaffId,
        leadName: touch.lead_name || name,
        otherCount: touch.other_count ?? 0,
        roomId,
        excludeStaffIds,
      });
      return;
    }

    const waitMs = typeof touch.wait_ms === 'number' ? touch.wait_ms : COLLECT_SECONDS * 1000;
    await sleep(waitMs + 50);

    const flush = await claimPttNotify({
      roomId,
      speakerStaffId,
      speakerName: name,
      mode: 'flush',
    });
    if (!flush || flush.action !== 'notify') return;

    await sendPttTalkPush({
      speakerStaffId,
      leadName: flush.lead_name || name,
      otherCount: flush.other_count ?? 0,
      roomId,
      excludeStaffIds,
    });
  } catch (e) {
    log.warn('pttNotify', 'exception', e);
  }
}
