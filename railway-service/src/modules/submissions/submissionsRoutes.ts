import crypto from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GatewayClient } from '../../integrations/gateway-client/gatewayClient.js';
import { hasPermission } from '../permissions/permissionService.js';
import { assertHasPermission } from '../permissions/permission.js';
import { writeAudit } from '../audit/auditService.js';
import { Errors } from '../../shared/errors/appError.js';
import { recordKbsGatewayResult } from '../kbs/kbsLogService.js';

const SubmitSingleSchema = z.object({
  guestDocumentId: z.string().uuid(),
  stayAssignmentId: z.string().uuid().optional()
});

export const submissionsRoutes: FastifyPluginAsync = async (app) => {
  const gw = new GatewayClient({ baseUrl: app.env.GATEWAY_BASE_URL, sharedSecret: app.env.GATEWAY_SHARED_SECRET });

  async function loadGatewaySubmitContext(args: { hotelId: string; guestDocumentId: string; stayAssignmentId: string }) {
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select(
        'id, hotel_id, guest_id, document_number, nationality_code, issuing_country_code, parsed_payload, document_series, usage_kind, kbs_person_kind, plate_number, guest_phone_submitted, forward_dated, expiry_date'
      )
      .eq('id', args.guestDocumentId)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');

    const { data: guest, error: guestErr } = await app.supabase
      .schema('ops')
      .from('guests')
      .select('id, full_name, first_name, last_name, middle_name, birth_date, gender, nationality_code, father_name, mother_name')
      .eq('id', doc.guest_id)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (guestErr || !guest) throw Errors.notFound('Guest not found');

    const { data: stay, error: stayErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id, hotel_id, room_id, check_in_at, check_out_at')
      .eq('id', args.stayAssignmentId)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (stayErr || !stay) throw Errors.notFound('Stay assignment not found');

    const { data: room, error: roomErr } = await app.supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number')
      .eq('id', stay.room_id)
      .eq('hotel_id', args.hotelId)
      .maybeSingle();
    if (roomErr || !room) throw Errors.notFound('Room not found');

    const parsed = (doc.parsed_payload ?? {}) as Record<string, unknown>;
    const birthDate =
      (typeof parsed.birthDate === 'string' ? parsed.birthDate : null) ??
      (guest.birth_date ? String(guest.birth_date) : null);
    const gender = (typeof parsed.gender === 'string' ? parsed.gender : null) ?? (guest.gender ? String(guest.gender) : null);
    const middleFromParsed = typeof parsed.middleName === 'string' ? parsed.middleName : null;

    return {
      fullName: guest.full_name ?? null,
      firstName: guest.first_name ?? null,
      lastName: guest.last_name ?? null,
      middleName: guest.middle_name ?? middleFromParsed,
      documentNumber: doc.document_number ?? null,
      documentSeries: doc.document_series ?? null,
      nationalityCode: doc.nationality_code ?? guest.nationality_code ?? null,
      issuingCountryCode: doc.issuing_country_code ?? null,
      birthDate,
      gender: gender === 'M' || gender === 'F' || gender === 'X' ? (gender as 'M' | 'F' | 'X') : null,
      roomNumber: room.room_number ?? null,
      checkInAt: stay.check_in_at ? String(stay.check_in_at) : null,
      documentExpiryDate: doc.expiry_date ? String(doc.expiry_date) : null,
      usageKind: doc.usage_kind ? String(doc.usage_kind) : 'konaklama',
      kbsPersonKind: doc.kbs_person_kind ? String(doc.kbs_person_kind) : null,
      plateNumber: doc.plate_number ?? null,
      phone: doc.guest_phone_submitted ?? null,
      forwardDated: Boolean(doc.forward_dated),
      fatherName: guest.father_name ?? null,
      motherName: guest.mother_name ?? null,
      maritalStatus:
        typeof parsed.maritalStatus === 'string'
          ? parsed.maritalStatus
          : typeof parsed.marital_status === 'string'
            ? parsed.marital_status
            : null
    };
  }

  async function resolveStayAssignmentId(args: { hotelId: string; guestDocumentId: string; stayAssignmentId?: string }): Promise<string> {
    if (args.stayAssignmentId) return args.stayAssignmentId;
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id')
      .eq('id', args.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== args.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const { data: stay, error: stayErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id')
      .eq('hotel_id', args.hotelId)
      .eq('guest_id', doc.guest_id)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stayErr || !stay) throw Errors.conflict('Active stay assignment not found (assign room first)');
    return stay.id as string;
  }

  async function getOrCreateTransaction(args: {
    hotelId: string;
    guestId: string;
    guestDocumentId: string;
    stayAssignmentId: string;
    transactionType: 'check_in' | 'check_out' | 'update';
    createdBy: string;
  }): Promise<{ id: string; idempotent: boolean }> {
    const idempotencyKey = `${args.guestDocumentId}:${args.stayAssignmentId}:${args.transactionType}`;
    const { data: tx, error: txErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .insert({
        hotel_id: args.hotelId,
        guest_id: args.guestId,
        guest_document_id: args.guestDocumentId,
        stay_assignment_id: args.stayAssignmentId,
        transaction_type: args.transactionType,
        provider: 'gateway',
        status: 'processing',
        idempotency_key: idempotencyKey,
        created_by: args.createdBy
      })
      .select('id')
      .single();

    if (!txErr && tx) return { id: tx.id as string, idempotent: false };

    const { data: existing, error: exErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id')
      .eq('hotel_id', args.hotelId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (exErr || !existing) throw Errors.conflict('Transaction already exists or cannot be created');
    return { id: existing.id as string, idempotent: true };
  }

  const handleCheckIn = async (req: FastifyRequest) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const body = SubmitSingleSchema.parse(req.body);
    const allowed = auth.role === 'admin'
      ? true
      : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.submit.single' });
    assertHasPermission(allowed, 'kbs.submit.single', auth);

    // Resolve guest_id from guest_documents and ensure same hotel.
    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id, scan_status')
      .eq('id', body.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const stayAssignmentId = await resolveStayAssignmentId({
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      ...(body.stayAssignmentId ? { stayAssignmentId: body.stayAssignmentId } : {})
    });

    const tx = await getOrCreateTransaction({
      hotelId: auth.hotelId,
      guestId: doc.guest_id,
      guestDocumentId: body.guestDocumentId,
      stayAssignmentId,
      transactionType: 'check_in',
      createdBy: auth.authUserId
    });

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.submit.single',
      entityType: 'guest_document',
      entityId: body.guestDocumentId,
      metadata: { transactionId: tx.id, idempotent: tx.idempotent }
    });

    if (tx.idempotent) {
      return { ok: true, data: { transactionId: tx.id, idempotent: true } };
    }

    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({
        kbs_status: 'pending',
        kbs_last_attempt_at: new Date().toISOString()
      })
      .eq('id', tx.id);

    const ctx = await loadGatewaySubmitContext({ hotelId: auth.hotelId, guestDocumentId: body.guestDocumentId, stayAssignmentId });
    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>('/gateway/check-in', {
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      stayAssignmentId,
      transactionId: tx.id,
      ...ctx
    });

    if (!gwRes.ok) {
      const now = new Date().toISOString();
      await app.supabase
        .schema('ops')
        .from('official_submission_transactions')
        .update({
          status: 'failed',
          error_message: gwRes.error.message,
          updated_at: now,
          kbs_status: 'failed',
          kbs_last_attempt_at: now,
          kbs_error_code: gwRes.error.code,
          kbs_error_message: gwRes.error.message,
          kbs_response_payload: null
        })
        .eq('id', tx.id);
      await recordKbsGatewayResult(app.supabase, {
        hotelId: auth.hotelId,
        transactionId: tx.id,
        guestDocumentId: body.guestDocumentId,
        status: 'failed',
        errorMessage: gwRes.error.message,
        requestSummary: { transactionType: 'check_in', guestDocumentId: body.guestDocumentId, stayAssignmentId }
      });
      return { ok: false, error: gwRes.error };
    }

    const sentAt = new Date().toISOString();
    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({
        status: 'submitted',
        external_reference: gwRes.data.externalReference ?? null,
        submitted_at: sentAt,
        kbs_status: 'success',
        kbs_last_attempt_at: sentAt,
        kbs_sent_at: sentAt,
        kbs_error_code: null,
        kbs_error_message: null,
        kbs_response_payload: gwRes.data as object
      })
      .eq('id', tx.id);

    await recordKbsGatewayResult(app.supabase, {
      hotelId: auth.hotelId,
      transactionId: tx.id,
      guestDocumentId: body.guestDocumentId,
      status: 'success',
      responseSummary: gwRes.data
    });

    // Best-effort status update (authoritative status is still ops tables).
    await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', body.guestDocumentId);
    await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_in' }).eq('id', stayAssignmentId);
    return { ok: true, data: { transactionId: tx.id, ...gwRes.data } };
  };

  app.post('/submissions/check-in', handleCheckIn);
  app.post('/kbs/check-in', handleCheckIn);

  const DeleteSchema = z.object({
    guestDocumentId: z.string().uuid(),
    guestStayId: z.string().uuid().optional()
  });

  const handleDelete = async (req: FastifyRequest) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const body = DeleteSchema.parse(req.body);
    const allowed =
      auth.role === 'admin' || auth.role === 'manager'
        ? true
        : await hasPermission({
            supabase: app.supabase,
            hotelId: auth.hotelId,
            userId: auth.authUserId,
            code: 'kbs.credentials.edit'
          });
    assertHasPermission(allowed, 'kbs.credentials.edit', auth);

    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, hotel_id, document_number, kbs_person_kind')
      .eq('id', body.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const transactionId = crypto.randomUUID();
    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>('/gateway/delete', {
      hotelId: auth.hotelId,
      guestDocumentId: body.guestDocumentId,
      transactionId,
      documentNumber: doc.document_number ?? null,
      kbsPersonKind: doc.kbs_person_kind ?? null
    });

    if (!gwRes.ok) {
      await recordKbsGatewayResult(app.supabase, {
        hotelId: auth.hotelId,
        transactionId,
        guestDocumentId: body.guestDocumentId,
        status: 'failed',
        errorMessage: gwRes.error.message,
        requestSummary: { transactionType: 'delete' }
      });
      return { ok: false, error: gwRes.error };
    }

    const sentAt = new Date().toISOString();
    await app.supabase
      .schema('ops')
      .from('guest_documents')
      .update({ scan_status: 'draft', submitted_at: null })
      .eq('id', body.guestDocumentId);

    if (body.guestStayId) {
      await app.supabase
        .schema('ops')
        .from('guest_stays')
        .update({
          stay_status: 'deleted_from_kbs',
          kbs_delete_status: 'sent',
          deleted_by: auth.authUserId,
          kbs_delete_error_message: null,
          updated_at: sentAt
        })
        .eq('id', body.guestStayId)
        .eq('hotel_id', auth.hotelId);
    }

    await recordKbsGatewayResult(app.supabase, {
      hotelId: auth.hotelId,
      transactionId,
      guestDocumentId: body.guestDocumentId,
      status: 'success',
      responseSummary: gwRes.data
    });

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.delete.single',
      entityType: 'guest_document',
      entityId: body.guestDocumentId,
      metadata: { transactionId, guestStayId: body.guestStayId ?? null }
    });

    return { ok: true, data: { transactionId, ...gwRes.data } };
  };

  app.post('/submissions/delete', handleDelete);
  app.post('/kbs/delete', handleDelete);

  app.post('/submissions/retry', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const body = z.object({ transactionId: z.string().uuid() }).parse(req.body);
    const allowed = auth.role === 'admin'
      ? true
      : await hasPermission({ supabase: app.supabase, hotelId: auth.hotelId, userId: auth.authUserId, code: 'kbs.retry.failed' });
    assertHasPermission(allowed, 'kbs.retry.failed', auth);

    const { data: tx, error: txErr } = await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .select('id, hotel_id, transaction_type, status, retry_count, guest_document_id, stay_assignment_id')
      .eq('id', body.transactionId)
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (txErr || !tx) throw Errors.notFound('Transaction not found');
    if (tx.status !== 'failed') throw Errors.conflict('Only failed transactions can be retried');
    if (!tx.guest_document_id || !tx.stay_assignment_id) throw Errors.badRequest('Transaction missing references');

    const retryStarted = new Date().toISOString();
    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({
        status: 'processing',
        retry_count: (tx.retry_count ?? 0) + 1,
        error_message: null,
        updated_at: retryStarted,
        kbs_status: 'pending',
        kbs_last_attempt_at: retryStarted
      })
      .eq('id', tx.id);

    const gatewayPath = tx.transaction_type === 'check_out' ? '/gateway/check-out' : '/gateway/check-in';
    const ctx = await loadGatewaySubmitContext({ hotelId: auth.hotelId, guestDocumentId: tx.guest_document_id, stayAssignmentId: tx.stay_assignment_id });
    const gwRes = await gw.post<{ externalReference?: string; summary?: unknown }>(gatewayPath, {
      hotelId: auth.hotelId,
      guestDocumentId: tx.guest_document_id,
      stayAssignmentId: tx.stay_assignment_id,
      transactionId: tx.id,
      ...ctx,
      checkOutAt: tx.transaction_type === 'check_out' ? new Date().toISOString() : undefined
    });

    if (!gwRes.ok) {
      const now = new Date().toISOString();
      await app.supabase
        .schema('ops')
        .from('official_submission_transactions')
        .update({
          status: 'failed',
          error_message: gwRes.error.message,
          updated_at: now,
          kbs_status: 'failed',
          kbs_last_attempt_at: now,
          kbs_error_code: gwRes.error.code,
          kbs_error_message: gwRes.error.message,
          kbs_response_payload: null
        })
        .eq('id', tx.id);
      await recordKbsGatewayResult(app.supabase, {
        hotelId: auth.hotelId,
        transactionId: tx.id,
        guestDocumentId: tx.guest_document_id,
        status: 'failed',
        errorMessage: gwRes.error.message,
        requestSummary: { transactionType: tx.transaction_type, retry: true }
      });
      return { ok: false, error: gwRes.error };
    }

    const sentAt = new Date().toISOString();
    await app.supabase
      .schema('ops')
      .from('official_submission_transactions')
      .update({
        status: 'submitted',
        external_reference: gwRes.data.externalReference ?? null,
        submitted_at: sentAt,
        kbs_status: 'success',
        kbs_last_attempt_at: sentAt,
        kbs_sent_at: sentAt,
        kbs_error_code: null,
        kbs_error_message: null,
        kbs_response_payload: gwRes.data as object
      })
      .eq('id', tx.id);

    await recordKbsGatewayResult(app.supabase, {
      hotelId: auth.hotelId,
      transactionId: tx.id,
      guestDocumentId: tx.guest_document_id,
      status: 'success',
      responseSummary: gwRes.data
    });

    if (tx.transaction_type === 'check_out') {
      await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_out', check_out_at: new Date().toISOString() }).eq('id', tx.stay_assignment_id);
      await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'checked_out', checked_out_at: new Date().toISOString() }).eq('id', tx.guest_document_id);
    } else {
      await app.supabase.schema('ops').from('stay_assignments').update({ stay_status: 'checked_in' }).eq('id', tx.stay_assignment_id);
      await app.supabase.schema('ops').from('guest_documents').update({ scan_status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', tx.guest_document_id);
    }

    return { ok: true, data: { transactionId: tx.id, ...gwRes.data } };
  });
};

