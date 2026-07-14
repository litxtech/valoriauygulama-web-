import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ready-to-submit', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.submitted' });
    assertHasPermission(allowed, 'kbs.view.submitted', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, document_type, document_number, nationality_code, scan_status, updated_at, created_at, image_thumb_path')
      .eq('hotel_id', auth.hotelId)
      .eq('scan_status', 'ready_to_submit')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/submitted-passports', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.submitted' });
    assertHasPermission(allowed, 'kbs.view.submitted', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, document_type, document_number, nationality_code, scan_status, submitted_at, checked_out_at, last_error, image_thumb_path')
      .eq('hotel_id', auth.hotelId)
      .in('scan_status', ['submitted', 'checkout_pending', 'checked_out', 'failed'])
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/failed-transactions', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.view.failed' });
    assertHasPermission(allowed, 'kbs.view.failed', auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id, transaction_type, status, retry_count, error_message, created_at, updated_at, guest_document_id, stay_assignment_id')
      .eq('hotel_id', auth.hotelId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw Errors.internal('Failed to load');
    return { ok: true, data: data ?? [] };
  });

  app.get('/submissions/status/:transactionId', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const transactionId = z.string().uuid().parse((req.params as any).transactionId);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id, status, transaction_type, retry_count, error_message, external_reference, created_at, updated_at, submitted_at')
      .eq('id', transactionId)
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (error || !data) throw Errors.notFound('Transaction not found');
    return { ok: true, data };
  });

  /**
   * Personel bildirim panosu: ulaştı / devam / kuyruk / başarısız.
   * Kuyruk = hazır belgeler + bekleyen/retry işlemler.
   */
  app.get('/submissions/board', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const allowed =
      auth.role === 'admin'
        ? true
        : (await hasPermission({
            supabase: app.supabase,
            hotelId: auth.hotelId,
            userId: auth.authUserId,
            code: 'kbs.view.submitted',
          })) ||
          (await hasPermission({
            supabase: app.supabase,
            hotelId: auth.hotelId,
            userId: auth.authUserId,
            code: 'kbs.view.failed',
          }));
    assertHasPermission(allowed, 'kbs.view.submitted', auth);

    const hotelId = auth.hotelId;

    const [txRes, readyRes, staysRes] = await Promise.all([
      app.supabase
        .schema('ops')
        .from('official_submission_transactions')
        .select(
          'id, transaction_type, status, kbs_status, retry_count, error_message, kbs_error_message, guest_document_id, stay_assignment_id, created_at, updated_at, submitted_at, kbs_sent_at'
        )
        .eq('hotel_id', hotelId)
        .in('status', ['pending', 'processing', 'submitted', 'failed', 'retrying'])
        .order('updated_at', { ascending: false })
        .limit(400),
      app.supabase
        .schema('ops')
        .from('guest_documents')
        .select(
          'id, guest_id, document_type, document_number, nationality_code, scan_status, updated_at, created_at'
        )
        .eq('hotel_id', hotelId)
        .eq('scan_status', 'ready_to_submit')
        .order('updated_at', { ascending: false })
        .limit(200),
      app.supabase
        .schema('ops')
        .from('stay_assignments')
        .select('id, guest_id, room_id, stay_status')
        .eq('hotel_id', hotelId)
        .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
        .limit(1000),
    ]);

    if (txRes.error) throw Errors.internal('Failed to load transactions');
    if (readyRes.error) throw Errors.internal('Failed to load ready documents');
    if (staysRes.error) throw Errors.internal('Failed to load stays');

    const txs = txRes.data ?? [];
    const readyDocs = readyRes.data ?? [];
    const stays = staysRes.data ?? [];

    const docIds = Array.from(
      new Set(
        [...txs.map((t) => t.guest_document_id), ...readyDocs.map((d) => d.id)].filter(Boolean) as string[]
      )
    );
    const guestIds = Array.from(
      new Set(
        [
          ...readyDocs.map((d) => d.guest_id),
          ...stays.map((s) => s.guest_id),
        ].filter(Boolean) as string[]
      )
    );
    const roomIds = Array.from(new Set(stays.map((s) => s.room_id).filter(Boolean) as string[]));

    const [docsExtraRes, guestsRes, roomsRes] = await Promise.all([
      docIds.length
        ? app.supabase
            .schema('ops')
            .from('guest_documents')
            .select('id, guest_id, document_number, nationality_code, scan_status, document_type')
            .eq('hotel_id', hotelId)
            .in('id', docIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      guestIds.length
        ? app.supabase
            .schema('ops')
            .from('guests')
            .select('id, first_name, last_name, full_name')
            .eq('hotel_id', hotelId)
            .in('id', guestIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      roomIds.length
        ? app.supabase
            .schema('ops')
            .from('rooms')
            .select('id, room_number')
            .eq('hotel_id', hotelId)
            .in('id', roomIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (docsExtraRes.error) throw Errors.internal('Failed to load documents');
    if (guestsRes.error) throw Errors.internal('Failed to load guests');
    if (roomsRes.error) throw Errors.internal('Failed to load rooms');

    const docById = new Map((docsExtraRes.data ?? []).map((d) => [d.id as string, d]));
    const guestById = new Map((guestsRes.data ?? []).map((g) => [g.id as string, g]));
    const roomById = new Map((roomsRes.data ?? []).map((r) => [r.id as string, r]));
    const stayByGuest = new Map<string, (typeof stays)[0]>();
    for (const s of stays) {
      if (!stayByGuest.has(s.guest_id)) stayByGuest.set(s.guest_id, s);
    }

    const displayName = (guestId: string | null | undefined) => {
      if (!guestId) return null;
      const g = guestById.get(guestId);
      if (!g) return null;
      return (
        (g.full_name as string | null)?.trim() ||
        [g.first_name, g.last_name].filter(Boolean).join(' ').trim() ||
        null
      );
    };

    const roomForGuest = (guestId: string | null | undefined) => {
      if (!guestId) return { roomId: null as string | null, roomNumber: null as string | null };
      const stay = stayByGuest.get(guestId);
      if (!stay) return { roomId: null, roomNumber: null };
      const room = roomById.get(stay.room_id);
      return {
        roomId: stay.room_id as string,
        roomNumber: room ? String(room.room_number) : null,
        stayAssignmentId: stay.id as string,
        stayStatus: stay.stay_status as string,
      };
    };

    const reached = txs
      .filter((t) => t.status === 'submitted' || t.kbs_status === 'success')
      .slice(0, 100)
      .map((t) => {
        const doc = t.guest_document_id ? docById.get(t.guest_document_id) : null;
        const room = roomForGuest(doc?.guest_id);
        return {
          kind: 'transaction' as const,
          id: t.id,
          transactionId: t.id,
          guestDocumentId: t.guest_document_id,
          transactionType: t.transaction_type,
          status: t.status,
          kbsStatus: t.kbs_status,
          guestName: displayName(doc?.guest_id),
          documentNumber: doc?.document_number ?? null,
          nationalityCode: doc?.nationality_code ?? null,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          updatedAt: t.kbs_sent_at ?? t.submitted_at ?? t.updated_at,
          queueReason: null as string | null,
        };
      });

    const inProgress = txs
      .filter((t) => t.status === 'processing')
      .map((t) => {
        const doc = t.guest_document_id ? docById.get(t.guest_document_id) : null;
        const room = roomForGuest(doc?.guest_id);
        return {
          kind: 'transaction' as const,
          id: t.id,
          transactionId: t.id,
          guestDocumentId: t.guest_document_id,
          transactionType: t.transaction_type,
          status: t.status,
          kbsStatus: t.kbs_status,
          guestName: displayName(doc?.guest_id),
          documentNumber: doc?.document_number ?? null,
          nationalityCode: doc?.nationality_code ?? null,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          updatedAt: t.updated_at,
          queueReason: 'Jandarma KBS’ye iletiliyor…',
        };
      });

    const failed = txs
      .filter((t) => t.status === 'failed')
      .map((t) => {
        const doc = t.guest_document_id ? docById.get(t.guest_document_id) : null;
        const room = roomForGuest(doc?.guest_id);
        const err = (t.kbs_error_message || t.error_message || 'Bilinmeyen hata') as string;
        return {
          kind: 'transaction' as const,
          id: t.id,
          transactionId: t.id,
          guestDocumentId: t.guest_document_id,
          transactionType: t.transaction_type,
          status: t.status,
          kbsStatus: t.kbs_status,
          guestName: displayName(doc?.guest_id),
          documentNumber: doc?.document_number ?? null,
          nationalityCode: doc?.nationality_code ?? null,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          updatedAt: t.updated_at,
          retryCount: t.retry_count ?? 0,
          errorMessage: err,
          queueReason: err,
        };
      });

    const txDocIds = new Set(
      txs.filter((t) => t.status === 'pending' || t.status === 'processing' || t.status === 'retrying').map((t) => t.guest_document_id)
    );

    const queuedFromTx = txs
      .filter((t) => t.status === 'pending' || t.status === 'retrying')
      .map((t) => {
        const doc = t.guest_document_id ? docById.get(t.guest_document_id) : null;
        const room = roomForGuest(doc?.guest_id);
        const reason =
          t.status === 'retrying'
            ? `Yeniden deneme kuyruğunda${t.error_message ? `: ${t.error_message}` : ''}`
            : 'İşlem kuyruğunda — KBS’ye henüz gönderilmedi';
        return {
          kind: 'transaction' as const,
          id: t.id,
          transactionId: t.id,
          guestDocumentId: t.guest_document_id,
          transactionType: t.transaction_type,
          status: t.status,
          kbsStatus: t.kbs_status,
          guestName: displayName(doc?.guest_id),
          documentNumber: doc?.document_number ?? null,
          nationalityCode: doc?.nationality_code ?? null,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          updatedAt: t.updated_at,
          retryCount: t.retry_count ?? 0,
          errorMessage: t.error_message ?? t.kbs_error_message ?? null,
          queueReason: reason,
          canRetry: true,
          canProcess: false,
        };
      });

    const queuedFromReady = readyDocs
      .filter((d) => !txDocIds.has(d.id))
      .map((d) => {
        const room = roomForGuest(d.guest_id);
        const hasRoom = !!room.roomId;
        return {
          kind: 'document' as const,
          id: d.id,
          transactionId: null as string | null,
          guestDocumentId: d.id,
          transactionType: 'check_in' as string,
          status: 'queued',
          kbsStatus: null as string | null,
          guestName: displayName(d.guest_id),
          documentNumber: d.document_number ?? null,
          nationalityCode: d.nationality_code ?? null,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          updatedAt: d.updated_at,
          queueReason: hasRoom
            ? `Oda ${room.roomNumber ?? '—'} atandı — bildirim bekliyor`
            : 'Oda atanmadı — önce oda seçilmeli',
          canRetry: false,
          canProcess: hasRoom,
          needsRoom: !hasRoom,
        };
      });

    const queued = [...queuedFromTx, ...queuedFromReady].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt))
    );

    return {
      ok: true,
      data: {
        counts: {
          reached: reached.length,
          inProgress: inProgress.length,
          queued: queued.length,
          failed: failed.length,
        },
        reached,
        inProgress,
        queued,
        failed,
      },
    };
  });

  /** Aynı misafirin otelde aktif bildirimi var mı? (yanlışlıkla çift bildirim engeli) */
  app.get('/submissions/active-by-document', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const guestDocumentId = z.string().uuid().parse((req.query as any).guestDocumentId);

    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, document_number, scan_status, nationality_code')
      .eq('id', guestDocumentId)
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');

    const { data: stay } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id, room_id, stay_status, updated_at')
      .eq('hotel_id', auth.hotelId)
      .eq('guest_id', doc.guest_id)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let roomNumber: string | null = null;
    if (stay?.room_id) {
      const { data: room } = await app.supabase
        .schema('ops')
        .from('rooms')
        .select('room_number')
        .eq('id', stay.room_id)
        .maybeSingle();
      roomNumber = room ? String(room.room_number) : null;
    }

    const { data: guest } = await app.supabase
      .schema('ops')
      .from('guests')
      .select('first_name, last_name, full_name')
      .eq('id', doc.guest_id)
      .maybeSingle();

    const alreadyNotified =
      doc.scan_status === 'submitted' ||
      doc.scan_status === 'checkout_pending' ||
      stay?.stay_status === 'checked_in' ||
      stay?.stay_status === 'checkout_pending';

    const guestName =
      (guest?.full_name as string | null)?.trim() ||
      [guest?.first_name, guest?.last_name].filter(Boolean).join(' ').trim() ||
      null;

    return {
      ok: true,
      data: {
        guestDocumentId: doc.id,
        guestId: doc.guest_id,
        documentNumber: doc.document_number,
        scanStatus: doc.scan_status,
        guestName,
        alreadyNotified,
        activeStay: stay
          ? {
              stayAssignmentId: stay.id,
              roomId: stay.room_id,
              roomNumber,
              stayStatus: stay.stay_status,
            }
          : null,
      },
    };
  });
};

