/**
 * Partner otel portalı push bildirimleri (onay, fiyat, manuel tetikleme).
 */
import { supabase, supabaseAnonKey } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { insertPartnerHotelNotification, listPartnerHotels } from '@/lib/breakfastPartner';
import { fmtMoneyTry } from '@/lib/finance';

const EDGE_FN_PUSH = 'send-expo-push';

async function sendPartnerPush(params: {
  partnerUserIds: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const { partnerUserIds, title, body, data } = params;
  if (partnerUserIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? supabaseAnonKey;
    const { error } = await supabase.functions.invoke(EDGE_FN_PUSH, {
      body: { partnerUserIds, title, body, data },
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (error) log.warn('breakfastPartnerNotify', 'sendPartnerPush', error);
  } catch (e) {
    log.warn('breakfastPartnerNotify', 'sendPartnerPush exception', e);
  }
}

export async function fetchPartnerUserIdsForHotel(partnerHotelId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('breakfast_partner_users')
    .select('id')
    .eq('partner_hotel_id', partnerHotelId)
    .eq('is_active', true);
  if (error) {
    log.warn('breakfastPartnerNotify', 'fetchPartnerUserIdsForHotel', error);
    return [];
  }
  return (data ?? []).map((r) => String(r.id)).filter(Boolean);
}

export async function notifyPartnerHotelApproved(params: {
  partnerHotelId: string;
  hotelName: string;
  unitPrice?: number;
}): Promise<void> {
  const ids = await fetchPartnerUserIdsForHotel(params.partnerHotelId);
  const priceHint =
    params.unitPrice != null && params.unitPrice > 0
      ? ` Kişi başı ücret: ${fmtMoneyTry(params.unitPrice)}.`
      : '';
  void sendPartnerPush({
    partnerUserIds: ids,
    title: 'Hesabınız onaylandı',
    body: `${params.hotelName} partner hesabınız aktif edildi.${priceHint} Günlük kahvaltı sayısı girebilirsiniz.`,
    data: {
      notificationType: 'breakfast_partner_approved',
      screen: '/partner/(tabs)',
      url: '/partner/(tabs)',
      hotelName: params.hotelName,
    },
  });
  void insertPartnerHotelNotification(
    params.partnerHotelId,
    'breakfast_partner_approved',
    'Hesabınız onaylandı',
    `${params.hotelName} partner hesabınız aktif edildi.${priceHint}`,
    { hotelName: params.hotelName, unitPrice: params.unitPrice ?? null }
  );
}

export async function notifyPartnerPriceChanged(params: {
  partnerHotelId: string;
  hotelName: string;
  unitPrice: number;
}): Promise<void> {
  if (params.unitPrice <= 0) return;
  const ids = await fetchPartnerUserIdsForHotel(params.partnerHotelId);
  void sendPartnerPush({
    partnerUserIds: ids,
    title: 'Birim fiyat güncellendi',
    body: `${params.hotelName} için kişi başı ücret ${fmtMoneyTry(params.unitPrice)} olarak güncellendi.`,
    data: {
      notificationType: 'breakfast_partner_price',
      screen: '/partner/(tabs)/account',
      url: '/partner/(tabs)/account',
      unitPrice: params.unitPrice,
      hotelName: params.hotelName,
    },
  });
  void insertPartnerHotelNotification(
    params.partnerHotelId,
    'breakfast_partner_price',
    'Birim fiyat güncellendi',
    `Kişi başı ücret ${fmtMoneyTry(params.unitPrice)} olarak güncellendi.`,
    { unitPrice: params.unitPrice, hotelName: params.hotelName }
  );
}

export async function notifyPartnerStatusSuspended(params: {
  partnerHotelId: string;
  hotelName: string;
}): Promise<void> {
  const ids = await fetchPartnerUserIdsForHotel(params.partnerHotelId);
  void sendPartnerPush({
    partnerUserIds: ids,
    title: 'Hesap askıya alındı',
    body: `${params.hotelName} partner hesabınız geçici olarak askıya alındı. Detay için yöneticinizle iletişime geçin.`,
    data: {
      notificationType: 'breakfast_partner_suspended',
      screen: '/partner/pending',
      url: '/partner/pending',
      hotelName: params.hotelName,
    },
  });
  void insertPartnerHotelNotification(
    params.partnerHotelId,
    'breakfast_partner_suspended',
    'Hesap askıya alındı',
    `${params.hotelName} hesabınız geçici olarak askıya alındı.`,
    { hotelName: params.hotelName }
  );
}

/** Varsayılan fiyat değişince özel fiyatı olmayan aktif partnerlere bildirim. */
export async function notifyPartnersDefaultPriceChanged(params: {
  organizationId: string;
  unitPrice: number;
}): Promise<number> {
  if (params.unitPrice <= 0) return 0;
  const hotels = await listPartnerHotels(params.organizationId);
  const targets = hotels.filter((h) => h.status === 'active' && (h.unit_price == null || h.unit_price <= 0));
  let sent = 0;
  for (const hotel of targets) {
    await notifyPartnerPriceChanged({
      partnerHotelId: hotel.id,
      hotelName: hotel.name,
      unitPrice: params.unitPrice,
    });
    sent += 1;
  }
  return sent;
}

/** Tüm aktif partnerlere kampanya / duyuru bildirimi. */
export async function notifyPartnerCampaign(params: {
  organizationId: string;
  title: string;
  body: string;
}): Promise<number> {
  const title = params.title.trim();
  const body = params.body.trim();
  if (!title || !body) return 0;

  const hotels = await listPartnerHotels(params.organizationId);
  const targets = hotels.filter((h) => h.status === 'active');
  let sent = 0;

  for (const hotel of targets) {
    const ids = await fetchPartnerUserIdsForHotel(hotel.id);
    void sendPartnerPush({
      partnerUserIds: ids,
      title,
      body,
      data: {
        notificationType: 'breakfast_partner_campaign',
        screen: '/partner/(tabs)/notifications',
        url: '/partner/(tabs)/notifications',
        hotelName: hotel.name,
      },
    });
    void insertPartnerHotelNotification(
      hotel.id,
      'breakfast_partner_campaign',
      title,
      body,
      { hotelName: hotel.name }
    );
    sent += 1;
  }

  return sent;
}

const VALORIA_BREAKFAST_VENUE = 'Valoria Hotel';

/** Misafir QR'ı resepsiyonda okutulunca partner otel kullanıcılarına bildirim. */
export async function notifyPartnerGuestPassRedeemed(params: {
  partnerHotelId: string;
  guestName: string;
  roomNumber?: string | null;
  passId?: string;
}): Promise<void> {
  const guestName = params.guestName.trim() || 'Misafir';
  const roomHint = params.roomNumber?.trim() ? ` (Oda ${params.roomNumber.trim()})` : '';
  const title = 'Misafir kahvaltıya başladı';
  const body = `${guestName}${roomHint} QR okuttu — ${VALORIA_BREAKFAST_VENUE}'de kahvaltıya başladı.`;

  const ids = await fetchPartnerUserIdsForHotel(params.partnerHotelId);
  const passPath = params.passId
    ? `/partner/guest-passes/${params.passId}`
    : '/partner/guest-passes';

  void sendPartnerPush({
    partnerUserIds: ids,
    title,
    body,
    data: {
      notificationType: 'breakfast_guest_pass_redeemed',
      screen: passPath,
      url: passPath,
      guestName,
      roomNumber: params.roomNumber ?? null,
      passId: params.passId ?? null,
    },
  });

  void insertPartnerHotelNotification(
    params.partnerHotelId,
    'breakfast_guest_pass_redeemed',
    title,
    body,
    {
      guestName,
      roomNumber: params.roomNumber ?? null,
      passId: params.passId ?? null,
      venue: VALORIA_BREAKFAST_VENUE,
    }
  );
}
