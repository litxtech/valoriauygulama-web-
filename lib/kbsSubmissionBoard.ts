/**
 * Kimlik bildirme panosu — durumlar, çift bildirim kontrolü, oda değişimi→KBS.
 */
import { apiGet, apiPost } from '@/lib/kbsApi';
import { assignKbsRoom, fetchKbsOpsRooms } from '@/lib/kbsStaffOpsEdge';
import { deleteGuestFromKbs } from '@/lib/kbsService';
import { fetchGuestStayById, updateGuestStay } from '@/lib/kbsStays/guestStaysDb';
import { supabase } from '@/lib/supabase';

export type KbsBoardTab = 'reached' | 'inProgress' | 'queued' | 'failed';

export type KbsBoardItem = {
  kind: 'transaction' | 'document';
  id: string;
  transactionId: string | null;
  guestDocumentId: string | null;
  transactionType: string;
  status: string;
  kbsStatus: string | null;
  guestName: string | null;
  documentNumber: string | null;
  nationalityCode: string | null;
  roomId: string | null;
  roomNumber: string | null;
  updatedAt: string;
  queueReason: string | null;
  retryCount?: number;
  errorMessage?: string | null;
  canRetry?: boolean;
  canProcess?: boolean;
  needsRoom?: boolean;
};

export type KbsSubmissionBoard = {
  counts: {
    reached: number;
    inProgress: number;
    queued: number;
    failed: number;
  };
  reached: KbsBoardItem[];
  inProgress: KbsBoardItem[];
  queued: KbsBoardItem[];
  failed: KbsBoardItem[];
};

export type KbsActiveByDocument = {
  guestDocumentId: string;
  guestId: string;
  documentNumber: string | null;
  scanStatus: string;
  guestName: string | null;
  alreadyNotified: boolean;
  activeStay: {
    stayAssignmentId: string;
    roomId: string;
    roomNumber: string | null;
    stayStatus: string;
  } | null;
};

export type KbsRoomGuest = {
  stayAssignmentId: string;
  guestId: string;
  stayStatus: string;
  guestDocumentId: string | null;
  scanStatus: string | null;
  documentNumber: string | null;
  nationalityCode: string | null;
  guestName: string | null;
  notified: boolean;
};

export type KbsRoomSummary = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  capacity: number | null;
  guests: KbsRoomGuest[];
  counts: Record<string, number>;
  notifiedCount: number;
  occupied: boolean;
};

export async function fetchKbsSubmissionBoard(): Promise<
  { ok: true; data: KbsSubmissionBoard } | { ok: false; message: string }
> {
  const res = await apiGet<KbsSubmissionBoard>('/submissions/board');
  if (res.ok) return { ok: true, data: res.data };

  // Eski ops: board endpoint yoksa hazır + başarısız listelerinden derle
  const [ready, failed] = await Promise.all([
    apiGet<
      {
        id: string;
        document_number?: string | null;
        nationality_code?: string | null;
        scan_status?: string;
        updated_at?: string;
      }[]
    >('/ready-to-submit'),
    apiGet<
      {
        id: string;
        transaction_type?: string;
        status?: string;
        retry_count?: number;
        error_message?: string | null;
        guest_document_id?: string | null;
        updated_at?: string;
      }[]
    >('/failed-transactions'),
  ]);

  if (!ready.ok && !failed.ok) {
    return { ok: false, message: res.error.message };
  }

  const queued: KbsBoardItem[] = (ready.ok ? ready.data : []).map((d) => ({
    kind: 'document',
    id: d.id,
    transactionId: null,
    guestDocumentId: d.id,
    transactionType: 'check_in',
    status: 'queued',
    kbsStatus: null,
    guestName: null,
    documentNumber: d.document_number ?? null,
    nationalityCode: d.nationality_code ?? null,
    roomId: null,
    roomNumber: null,
    updatedAt: d.updated_at ?? new Date().toISOString(),
    queueReason: 'Bildirim bekliyor (oda kontrolü için board API güncellemesi önerilir)',
    canRetry: false,
    canProcess: true,
    needsRoom: false,
  }));

  const failedItems: KbsBoardItem[] = (failed.ok ? failed.data : []).map((t) => ({
    kind: 'transaction',
    id: t.id,
    transactionId: t.id,
    guestDocumentId: t.guest_document_id ?? null,
    transactionType: t.transaction_type ?? 'check_in',
    status: t.status ?? 'failed',
    kbsStatus: 'failed',
    guestName: null,
    documentNumber: null,
    nationalityCode: null,
    roomId: null,
    roomNumber: null,
    updatedAt: t.updated_at ?? new Date().toISOString(),
    queueReason: t.error_message ?? 'Bildirim başarısız',
    retryCount: t.retry_count ?? 0,
    errorMessage: t.error_message ?? null,
    canRetry: true,
    canProcess: false,
  }));

  return {
    ok: true,
    data: {
      counts: {
        reached: 0,
        inProgress: 0,
        queued: queued.length,
        failed: failedItems.length,
      },
      reached: [],
      inProgress: [],
      queued,
      failed: failedItems,
    },
  };
}

export async function fetchKbsActiveByDocument(
  guestDocumentId: string
): Promise<{ ok: true; data: KbsActiveByDocument } | { ok: false; message: string }> {
  const res = await apiGet<KbsActiveByDocument>(
    `/submissions/active-by-document?guestDocumentId=${encodeURIComponent(guestDocumentId)}`
  );
  if (!res.ok) return { ok: false, message: res.error.message };
  return { ok: true, data: res.data };
}

export async function fetchKbsRoomsSummary(): Promise<
  { ok: true; data: KbsRoomSummary[] } | { ok: false; message: string }
> {
  const res = await apiGet<KbsRoomSummary[]>('/rooms/summary');
  if (!res.ok) return { ok: false, message: res.error.message };
  const data = (res.data ?? []).map((r) => ({
    ...r,
    notifiedCount: r.notifiedCount ?? (r.guests ?? []).filter((g) => g.notified).length,
    occupied: r.occupied ?? (r.guests ?? []).length > 0,
    guests: (r.guests ?? []).map((g) => ({
      ...g,
      guestName: g.guestName ?? null,
      notified:
        g.notified ??
        (g.scanStatus === 'submitted' ||
          g.scanStatus === 'checkout_pending' ||
          g.stayStatus === 'checked_in' ||
          g.stayStatus === 'checkout_pending'),
    })),
  }));
  return { ok: true, data };
}

export function duplicateNotifyWarning(active: KbsActiveByDocument): string {
  const name = active.guestName || active.documentNumber || 'Bu misafir';
  const room = active.activeStay?.roomNumber
    ? ` Oda ${active.activeStay.roomNumber}`
    : '';
  return (
    `${name}${room} için KBS bildirimi zaten yapılmış (durum: ${active.scanStatus}).\n\n` +
    `Aynı kişiyi tekrar bildirmek Jandarma kaydında çakışma yaratabilir.\n\n` +
    `Oda değişecekse: Odalar → misafir → «Oda değiştir (KBS)».\n` +
    `Bilgi düzeltilecekse: İçeridekiler → Sil ve yeniden bildir.`
  );
}

/** Kuyruktaki hazır kaydı işle (check-in). */
export async function processQueuedDocument(
  guestDocumentId: string
): Promise<{ ok: true; transactionId?: string } | { ok: false; message: string }> {
  const active = await fetchKbsActiveByDocument(guestDocumentId);
  if (active.ok && active.data.alreadyNotified) {
    return { ok: false, message: duplicateNotifyWarning(active.data) };
  }
  const res = await apiPost<{ transactionId: string; idempotent?: boolean }>('/submissions/check-in', {
    guestDocumentId,
  });
  if (!res.ok) return { ok: false, message: res.error.message };
  if (res.data.idempotent) {
    return {
      ok: false,
      message:
        'Bu bildirim zaten işlenmiş (idempotent). Aynı misafir tekrar gönderilmedi. Odalar veya Ulaştı listesini kontrol edin.',
    };
  }
  return { ok: true, transactionId: res.data.transactionId };
}

export async function retryFailedTransaction(
  transactionId: string
): Promise<{ ok: true; transactionId: string } | { ok: false; message: string }> {
  const res = await apiPost<{ transactionId: string }>('/submissions/retry', { transactionId });
  if (!res.ok) return { ok: false, message: res.error.message };
  return { ok: true, transactionId: res.data.transactionId };
}

/**
 * Oda değişikliği → KBS’ye ilet (sil + yeni oda + yeniden bildir).
 * Yerel oda güncellemesi Jandarma’ya gitmez; bu akış zorunludur.
 */
export async function changeKbsRoomAndNotify(args: {
  guestDocumentId: string;
  newRoomId: string;
  newRoomNumber: string;
  guestStayId?: string | null;
}): Promise<{ ok: true; transactionId?: string } | { ok: false; message: string }> {
  let stayRow = args.guestStayId ? await fetchGuestStayById(args.guestStayId) : null;

  if (!stayRow && args.guestDocumentId) {
    const { data } = await supabase
      .schema('ops')
      .from('guest_stays')
      .select('id')
      .eq('guest_document_id', args.guestDocumentId)
      .in('stay_status', ['checked_in', 'checkout_pending', 're_submitted', 'checkout_failed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) stayRow = await fetchGuestStayById(data.id);
  }

  if (stayRow) {
    const del = await deleteGuestFromKbs(stayRow);
    if (!del.ok) {
      return {
        ok: false,
        message: `KBS silme başarısız — oda değişimi yapılamadı: ${del.userMessage}`,
      };
    }
  }

  const assign = await assignKbsRoom({
    guestDocumentId: args.guestDocumentId,
    roomId: args.newRoomId,
  });
  if (!assign.ok) return { ok: false, message: assign.error.message };

  await supabase
    .schema('ops')
    .from('guest_documents')
    .update({ scan_status: 'ready_to_submit' })
    .eq('id', args.guestDocumentId);

  const submit = await apiPost<{ transactionId: string }>('/submissions/check-in', {
    guestDocumentId: args.guestDocumentId,
  });
  if (!submit.ok) {
    return {
      ok: false,
      message: `Yeni oda atandı ama KBS bildirimi başarısız: ${submit.error.message}. Kuyruk / Başarısız listesinden yeniden iletin.`,
    };
  }

  if (stayRow) {
    await updateGuestStay(stayRow.id, {
      room_no: args.newRoomNumber,
      stay_status: 're_submitted',
      kbs_checkin_status: 'sent',
      kbs_error_message: null,
    });
  }

  return { ok: true, transactionId: submit.data.transactionId };
}

export async function listRoomsForPicker(): Promise<{ id: string; room_number: string }[]> {
  const res = await fetchKbsOpsRooms();
  if (!res.ok) return [];
  return (res.data ?? []).map((r) => ({ id: r.id, room_number: String(r.room_number) }));
}

export function boardTabLabel(tab: KbsBoardTab): string {
  switch (tab) {
    case 'reached':
      return 'Ulaştı';
    case 'inProgress':
      return 'Devam';
    case 'queued':
      return 'Kuyruk';
    case 'failed':
      return 'Başarısız';
  }
}

export function boardTabHint(tab: KbsBoardTab): string {
  switch (tab) {
    case 'reached':
      return 'KBS’ye başarıyla iletilen kimlikler';
    case 'inProgress':
      return 'Şu an Jandarma’ya gönderiliyor';
    case 'queued':
      return 'Bekleyenler — nedeni okuyun, İşle veya Yeniden ilet';
    case 'failed':
      return 'Hata alan bildirimler — yeniden deneyin';
  }
}
