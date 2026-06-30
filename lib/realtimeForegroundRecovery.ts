import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

/**
 * Realtime "zombi soket" kurtarma.
 *
 * Telefon kilitlenince / uygulama arka plana alınınca işletim sistemi WebSocket'i
 * askıya alır. Ön plana dönünce soketin `readyState` değeri çoğu zaman hâlâ "open"
 * görünür; bu yüzden supabase-js bağlı sandığı için yeniden bağlanmaz ve yeni satırlar
 * (mesaj / feed) ancak ~25 sn'lik heartbeat zaman aşımından sonra gelir. Bu da
 * "feed/mesaj bir an boş kalıyor, sonra geliyor" şikâyetinin ana sebebidir.
 *
 * ÖNEMLİ: `supabase.realtime.disconnect()` BURADA kullanılmaz — disconnect, her kanalın
 * `teardown()`'ını çağırıp binding'leri (postgres_changes dinleyicileri) tamamen siler;
 * bu da ekranlar yeniden monte olana kadar realtime'ı kalıcı olarak bozar. Bunun yerine
 * heartbeat ile nazik bir "dürtme" yapıyoruz: soket gerçekten ölmüşse istemci kendi
 * reconnect akışını tetikler ve kanallar binding'leri KORUYARAK yeniden katılır.
 */

const STALE_AFTER_MS = 4_000;
/** İlk heartbeat cevapsız kalırsa, ikinci dürtme reconnect'i zorlar. */
const SECOND_PROBE_MS = 2_500;

type RealtimeLike = {
  isConnected: () => boolean;
  isConnecting: () => boolean;
  connect: () => void;
  sendHeartbeat: () => Promise<void>;
  getChannels: () => unknown[];
};

let started = false;
let lastState: AppStateStatus = (AppState.currentState as AppStateStatus) ?? 'active';
let backgroundedAt = 0;

function nudgeRealtime(): void {
  const rt = supabase.realtime as unknown as RealtimeLike;
  try {
    // Hiç kanal yoksa soketi diri tutmaya çalışma.
    if (rt.getChannels().length === 0) return;

    // Soket kapalıysa doğrudan bağlan; kanallar reconnect ile (binding'leri koruyarak) yeniden katılır.
    if (!rt.isConnected() && !rt.isConnecting()) {
      rt.connect();
      return;
    }

    // Olası zombi soket: bir heartbeat gönder. Cevapsız kalırsa ikinci dürtme,
    // bekleyen heartbeat'i görüp soketi kapatır ve reconnect tetiklenir.
    rt.sendHeartbeat().catch(() => {});
    setTimeout(() => {
      rt.sendHeartbeat().catch(() => {});
    }, SECOND_PROBE_MS);
  } catch (e) {
    log.warn('realtimeForeground', 'realtime nudge başarısız', e);
  }
}

/** Uygulama yaşam döngüsüne bağlanır; ön plana dönüşte realtime soketini kurtarır. */
export function startRealtimeForegroundRecovery(): () => void {
  if (started) return () => {};
  started = true;

  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') {
      if (lastState === 'active') backgroundedAt = Date.now();
      lastState = state;
      return;
    }

    const wasBackgrounded = lastState !== 'active';
    lastState = 'active';
    if (!wasBackgrounded) return;

    // Kısa süreli geçişlerde (ör. izin diyaloğu) soket ölmez; gereksiz dürtme yapma.
    const awayMs = backgroundedAt ? Date.now() - backgroundedAt : 0;
    if (awayMs < STALE_AFTER_MS) return;

    nudgeRealtime();
  });

  return () => {
    sub.remove();
    started = false;
  };
}
