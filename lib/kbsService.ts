/**
 * KBS operasyon servisi — giriş, çıkış, silme (stub), yeniden bildir, log.
 * Gerçek SOAP: railway → kbs-gateway. API yoksa kullanıcıya manuel uyarı.
 */
import { apiPost } from '@/lib/kbsApi';
import { assignKbsRoom } from '@/lib/kbsStaffOpsEdge';
import { upsertGuestDocumentLocal } from '@/lib/kbsDocumentUpsertLocal';
import { MRZ_OCR_ENGINE_VISION_MLKIT } from '@/lib/scanner/mrzOcrEngine';
import type { GuestScanItem } from '@/lib/guestScan/types';
import {
  fetchGuestStayById,
  insertGuestStay,
  insertKbsOpLog,
  insertCorrectionHistory,
  updateGuestStay,
} from '@/lib/kbsStays/guestStaysDb';
import type { CheckoutType, GuestStayRow } from '@/lib/kbsStays/types';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import { supabase } from '@/lib/supabase';

export type KbsServiceResult<T = void> =
  | { ok: true; data: T; manualKbsPanelRequired?: boolean }
  | { ok: false; userMessage: string; technicalMessage?: string };

async function resolveAuthContext(): Promise<{ hotelId: string; userId: string } | null> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return null;
  return { hotelId: ctx.hotelId, userId: ctx.userId };
}

function friendlyError(msg: string): string {
  if (/köprü yanıt vermedi|timeout/i.test(msg)) {
    return 'KBS köprüsüne (Railway) ulaşılamadı. Oda ataması Edge’de kayıtlı olabilir; Jandarma bildirimi için Railway + KBS_GATEWAY_URL gerekir.';
  }
  if (/connection|fetch|network/i.test(msg)) return 'KBS bağlantısı kurulamadı.';
  if (/documentNumber|BELGENO/i.test(msg)) return 'Pasaport veya kimlik numarası geçersiz veya eksik.';
  if (/checksum|MRZ/i.test(msg)) return 'Belge doğrulaması başarısız. Bilgileri kontrol edin.';
  if (/FORBIDDEN|permission/i.test(msg)) return 'Bu işlem için yetkiniz yok.';
  if (/already|duplicate|23505/i.test(msg)) return 'Bu kişi daha önce bildirilmiş olabilir.';
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}

export async function submitGuestCheckin(args: {
  item: GuestScanItem;
  roomId: string;
  roomNo: string;
  sessionId: string;
}): Promise<KbsServiceResult<{ guestDocumentId: string; guestStayId: string }>> {
  const ctx = await resolveAuthContext();
  if (!ctx) return { ok: false, userMessage: 'Oturum bulunamadı.' };
  const { hotelId, userId } = ctx;

  const parsed = args.item.parsed;
  if (!parsed) return { ok: false, userMessage: 'Belge verisi eksik.' };

  const upsert = await upsertGuestDocumentLocal({
    parsed,
    scanConfidence: args.item.confidenceScore,
    rawMrz: args.item.rawMrz,
    deferReady: false,
    kbsPersonKind: args.item.guestType,
    usageKind: args.item.usageKind,
    documentSeries: args.item.documentSerialNo,
    plateNumber: args.item.plateNumber,
    guestPhone: args.item.guestPhone,
    forwardDated: args.item.forwardDated,
    fatherName: args.item.fatherName,
    motherName: args.item.motherName,
    mrzBatchKey: args.sessionId,
    ocrEngine: args.item.sourceType === 'camera' ? MRZ_OCR_ENGINE_VISION_MLKIT : 'expo-text-extractor',
  });

  if (!upsert.ok) {
    await insertKbsOpLog({
      hotelId,
      sessionId: args.sessionId,
      guestScanItemId: args.item.id,
      actionType: 'checkin',
      status: 'failed',
      errorMessage: upsert.message,
      submittedBy: userId,
      requestPayload: { step: 'upsert' },
    });
    return { ok: false, userMessage: friendlyError(upsert.message), technicalMessage: upsert.message };
  }

  const guestDocumentId = upsert.data.guestDocumentId;

  const roomRes = await assignKbsRoom({ guestDocumentId, roomId: args.roomId });
  if (!roomRes.ok) {
    const stay = await insertGuestStay({
      hotelId,
      roomNo: args.roomNo,
      item: args.item,
      guestDocumentId,
      kbsCheckinStatus: 'failed',
      kbsErrorMessage: roomRes.error.message,
      submittedBy: userId,
      scanSessionId: args.sessionId,
    }).catch(() => null);
    await insertKbsOpLog({
      hotelId,
      guestStayId: stay?.id,
      guestDocumentId,
      actionType: 'checkin',
      status: 'failed',
      errorMessage: roomRes.error.message,
      submittedBy: userId,
    });
    return { ok: false, userMessage: friendlyError(roomRes.error.message), technicalMessage: roomRes.error.message };
  }

  const kbsRes = await apiPost<{ transactionId?: string; externalReference?: string; summary?: unknown }>(
    '/submissions/check-in',
    { guestDocumentId }
  );

  if (!kbsRes.ok) {
    const stay = await insertGuestStay({
      hotelId,
      roomNo: args.roomNo,
      item: args.item,
      guestDocumentId,
      kbsCheckinStatus: 'failed',
      kbsErrorMessage: kbsRes.error.message,
      submittedBy: userId,
      scanSessionId: args.sessionId,
    });
    await insertKbsOpLog({
      hotelId,
      guestStayId: stay.id,
      guestDocumentId,
      actionType: 'checkin',
      status: 'failed',
      errorMessage: kbsRes.error.message,
      submittedBy: userId,
      requestPayload: { step: 'check-in' },
    });
    return { ok: false, userMessage: friendlyError(kbsRes.error.message), technicalMessage: kbsRes.error.message };
  }

  const ref =
    kbsRes.data?.externalReference ??
    (kbsRes.data?.transactionId ? `tx:${kbsRes.data.transactionId}` : null);

  const stay = await insertGuestStay({
    hotelId,
    roomNo: args.roomNo,
    item: args.item,
    guestDocumentId,
    kbsCheckinStatus: 'sent',
    kbsReferenceNo: ref,
    submittedBy: userId,
    scanSessionId: args.sessionId,
  });

  await supabase
    .schema('ops')
    .from('guest_scan_items')
    .update({
      kbs_status: 'sent',
      kbs_reference_no: ref,
      kbs_submitted_at: new Date().toISOString(),
      kbs_submitted_by: userId,
      guest_document_id: guestDocumentId,
    })
    .eq('id', args.item.id);

  await insertKbsOpLog({
    hotelId,
    guestStayId: stay.id,
    guestScanItemId: args.item.id,
    guestDocumentId,
    actionType: 'checkin',
    status: 'success',
    submittedBy: userId,
    requestPayload: { roomNo: args.roomNo },
    responsePayload: kbsRes.data,
  });

  return { ok: true, data: { guestDocumentId, guestStayId: stay.id } };
}

export async function submitGuestCheckout(args: {
  stay: GuestStayRow;
  checkoutType?: CheckoutType;
}): Promise<KbsServiceResult> {
  const ctx = await resolveAuthContext();
  if (!ctx) return { ok: false, userMessage: 'Oturum bulunamadı.' };
  const { userId } = ctx as { hotelId: string; userId: string };

  if (!args.stay.guest_document_id) {
    return { ok: false, userMessage: 'Belge kaydı bulunamadı. Önce giriş bildirimi yapılmalı.' };
  }

  await updateGuestStay(args.stay.id, { stay_status: 'checkout_pending', kbs_checkout_status: 'pending' });

  const kbsRes = await apiPost('/submissions/check-out', { guestDocumentId: args.stay.guest_document_id });

  if (!kbsRes.ok) {
    await updateGuestStay(args.stay.id, {
      stay_status: 'checkout_failed',
      kbs_checkout_status: 'failed',
      kbs_checkout_error_message: kbsRes.error.message,
    });
    await insertKbsOpLog({
      hotelId: args.stay.hotel_id,
      guestStayId: args.stay.id,
      guestDocumentId: args.stay.guest_document_id,
      actionType: 'checkout',
      status: 'failed',
      errorMessage: kbsRes.error.message,
      submittedBy: userId,
    });
    return { ok: false, userMessage: friendlyError(kbsRes.error.message), technicalMessage: kbsRes.error.message };
  }

  const now = new Date().toISOString();
  await updateGuestStay(args.stay.id, {
    stay_status: 'checked_out',
    kbs_checkout_status: 'sent',
    checkout_at: now,
    checkout_by: userId,
    checkout_type: args.checkoutType ?? 'single',
    kbs_checkout_error_message: null,
  });

  await insertKbsOpLog({
    hotelId: args.stay.hotel_id,
    guestStayId: args.stay.id,
    guestDocumentId: args.stay.guest_document_id,
    actionType: 'checkout',
    status: 'success',
    submittedBy: userId,
    responsePayload: kbsRes.data,
  });

  return { ok: true, data: undefined };
}

export async function submitBulkCheckout(
  stays: GuestStayRow[],
  checkoutType: CheckoutType
): Promise<{ ok: number; failed: number; results: { stayId: string; ok: boolean; message?: string }[] }> {
  const results: { stayId: string; ok: boolean; message?: string }[] = [];
  let ok = 0;
  let failed = 0;
  for (const stay of stays) {
    const r = await submitGuestCheckout({ stay, checkoutType });
    if (r.ok) {
      ok++;
      results.push({ stayId: stay.id, ok: true });
    } else {
      failed++;
      results.push({ stayId: stay.id, ok: false, message: r.userMessage });
    }
  }
  return { ok, failed, results };
}

/** KBS’den misafir kaydı silme (SOAP: MusteriYabanciSil / MusteriTCSIil). */
export async function deleteGuestFromKbs(stay: GuestStayRow): Promise<KbsServiceResult> {
  const ctx = await resolveAuthContext();
  if (!ctx) return { ok: false, userMessage: 'Oturum bulunamadı.' };
  const { userId } = ctx;

  if (!stay.guest_document_id) {
    return { ok: false, userMessage: 'Belge kaydı yok; KBS silme yapılamaz.' };
  }

  await updateGuestStay(stay.id, {
    stay_status: 'delete_pending',
    kbs_delete_status: 'pending',
  });

  const delRes = await apiPost<{ transactionId?: string }>('/submissions/delete', {
    guestDocumentId: stay.guest_document_id,
    guestStayId: stay.id,
  });

  if (!delRes.ok) {
    const msg = friendlyError(delRes.error.message);
    await updateGuestStay(stay.id, {
      stay_status: 'delete_failed',
      kbs_delete_status: 'failed',
      kbs_delete_error_message: delRes.error.message,
      deleted_by: userId,
    });
    await insertKbsOpLog({
      hotelId: stay.hotel_id,
      guestStayId: stay.id,
      guestDocumentId: stay.guest_document_id,
      actionType: 'delete',
      status: 'failed',
      errorMessage: delRes.error.message,
      submittedBy: userId,
    });
    return { ok: false, userMessage: msg, technicalMessage: delRes.error.message };
  }

  await updateGuestStay(stay.id, {
    stay_status: 'deleted_from_kbs',
    kbs_delete_status: 'sent',
    deleted_by: userId,
    kbs_delete_error_message: null,
  });

  await insertKbsOpLog({
    hotelId: stay.hotel_id,
    guestStayId: stay.id,
    guestDocumentId: stay.guest_document_id,
    actionType: 'delete',
    status: 'success',
    submittedBy: userId,
    responsePayload: delRes.data,
  });

  return { ok: true, data: undefined };
}

export async function resubmitGuestAfterCorrection(args: {
  stayId: string;
  item: GuestScanItem;
  roomId: string;
  roomNo: string;
}): Promise<KbsServiceResult<{ guestStayId: string }>> {
  const ctx = await resolveAuthContext();
  if (!ctx) return { ok: false, userMessage: 'Oturum bulunamadı.' };
  const { userId } = ctx as { userId: string };

  const prev = await fetchGuestStayById(args.stayId);
  if (!prev) return { ok: false, userMessage: 'Kayıt bulunamadı.' };

  await insertCorrectionHistory({
    hotelId: prev.hotel_id,
    guestStayId: prev.id,
    oldData: prev as unknown as Record<string, unknown>,
    newData: { item: args.item, roomNo: args.roomNo },
    correctionType: 'delete_and_resubmit',
    correctedBy: userId,
    reason: 'Sil ve yeniden bildir',
  });

  const checkin = await submitGuestCheckin({
    item: args.item,
    roomId: args.roomId,
    roomNo: args.roomNo,
    sessionId: args.item.sessionId,
  });

  if (!checkin.ok) return checkin;

  await updateGuestStay(prev.id, { stay_status: 're_submitted', corrected_by: userId });
  await insertKbsOpLog({
    hotelId: prev.hotel_id,
    guestStayId: checkin.data.guestStayId,
    actionType: 'resubmit',
    status: 'success',
    submittedBy: userId,
  });

  return { ok: true, data: { guestStayId: checkin.data.guestStayId } };
}

export async function updateGuestOnKbs(_payload: unknown): Promise<KbsServiceResult> {
  return {
    ok: false,
    userMessage: 'KBS güncelleme servisi henüz tanımlı değil. Sil ve yeniden bildir akışını kullanın.',
  };
}

export function getKbsStatus(_referenceNo: string | null): Promise<KbsServiceResult<{ status: string }>> {
  return Promise.resolve({ ok: false, userMessage: 'KBS durum sorgusu henüz bağlı değil.' });
}
