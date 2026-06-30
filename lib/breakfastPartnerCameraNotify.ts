/**
 * Kamera talebi — partner bildirimleri (video yüklendiğinde).
 */
import { insertPartnerHotelNotification } from '@/lib/breakfastPartner';
import { fetchPartnerUserIdsForHotel } from '@/lib/breakfastPartnerNotify';
import { supabase, supabaseAnonKey } from '@/lib/supabase';
import { log } from '@/lib/logger';

const EDGE_FN_PUSH = 'send-expo-push';

async function sendPartnerPush(params: {
  partnerUserIds: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<void> {
  if (params.partnerUserIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
    const { error } = await supabase.functions.invoke(EDGE_FN_PUSH, {
      body: {
        partnerUserIds: params.partnerUserIds,
        title: params.title,
        body: params.body,
        data: params.data,
      },
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (error) log.warn('breakfastPartnerCameraNotify', 'push', error);
  } catch (e) {
    log.warn('breakfastPartnerCameraNotify', 'push exception', e);
  }
}

export async function notifyPartnerCameraRequestVideoReady(params: {
  partnerHotelId: string;
  requestId: string;
  hotelName?: string;
}): Promise<void> {
  const ids = await fetchPartnerUserIdsForHotel(params.partnerHotelId);
  const title = 'Kamera kaydı hazır';
  const body = 'Kamera kaydı talebiniz sonuçlandırıldı. Görüntüyü izlemek için tıklayın.';
  const detailPath = `/partner/camera-requests/${params.requestId}`;

  void sendPartnerPush({
    partnerUserIds: ids,
    title,
    body,
    data: {
      notificationType: 'breakfast_partner_camera_video',
      screen: detailPath,
      url: detailPath,
      requestId: params.requestId,
      partnerHotelId: params.partnerHotelId,
      hotelName: params.hotelName ?? null,
    },
  });

  void insertPartnerHotelNotification(
    params.partnerHotelId,
    'breakfast_partner_camera_video',
    title,
    body,
    {
      requestId: params.requestId,
      screen: detailPath,
      url: detailPath,
    }
  );
}