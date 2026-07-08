import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { writeAudit } from '../audit/auditService.js';
import { requireValidMrzForUpsert } from '../../utils/mrzScanGate.js';

const ParsedDocumentSchema = z.object({
  documentType: z.enum(['passport', 'id_card', 'residence_permit', 'other']),
  fullName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  middleName: z.string().nullable(),
  documentNumber: z.string().nullable(),
  nationalityCode: z.string().nullable(),
  issuingCountryCode: z.string().nullable(),
  birthDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  gender: z.enum(['M', 'F', 'X']).nullable(),
  rawMrz: z.string().nullable(),
  confidence: z.number().nullable(),
  checksumsValid: z.boolean().nullable(),
  warnings: z.array(z.string())
});

const UpsertSchema = z.object({
  arrivalGroupId: z.string().uuid().nullable().optional(),
  parsed: ParsedDocumentSchema,
  scanConfidence: z.number().nullable().optional(),
  rawMrz: z.string().nullable().optional(),
  ocrEngine: z.string().nullable().optional(),
  /** true: MRZ sonrası `scanned` kalır (parti / Beklet); parti ekranında hazıra çekilir. */
  deferReady: z.boolean().optional(),
  kbsPersonKind: z.enum(['tc_citizen', 'ykn_foreign', 'foreign']).nullable().optional(),
  usageKind: z.enum(['konaklama', 'gunluk', 'afetzede']).optional(),
  documentSeries: z.string().nullable().optional(),
  plateNumber: z.string().nullable().optional(),
  guestPhone: z.string().nullable().optional(),
  forwardDated: z.boolean().optional(),
  mrzBatchKey: z.string().uuid().nullable().optional(),
  fatherName: z.string().nullable().optional(),
  motherName: z.string().nullable().optional()
});

function kbsGuestDocumentExtras(body: z.infer<typeof UpsertSchema>) {
  return {
    kbs_person_kind: body.kbsPersonKind ?? null,
    usage_kind: body.usageKind ?? 'konaklama',
    document_series: body.documentSeries ?? null,
    plate_number: body.plateNumber ?? null,
    guest_phone_submitted: body.guestPhone ?? null,
    forward_dated: body.forwardDated ?? false,
    mrz_batch_key: body.mrzBatchKey ?? null
  };
}

export const documentsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/documents/batch/:mrzBatchKey', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const mrzBatchKey = z.string().uuid().parse((req.params as { mrzBatchKey?: string }).mrzBatchKey);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select(
        'id, guest_id, scan_status, document_type, document_number, kbs_person_kind, usage_kind, mrz_batch_key, guests(full_name, first_name, last_name)'
      )
      .eq('hotel_id', auth.hotelId)
      .eq('mrz_batch_key', mrzBatchKey)
      .in('scan_status', ['scanned', 'ready_to_submit'])
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw Errors.internal('Failed to load batch documents');

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      guest_id: string;
      scan_status: string;
      document_type: string | null;
      document_number: string | null;
      kbs_person_kind: string | null;
      usage_kind: string | null;
      mrz_batch_key: string | null;
      guests:
        | { full_name: string | null; first_name: string | null; last_name: string | null }
        | { full_name: string | null; first_name: string | null; last_name: string | null }[]
        | null;
    }>;

    const mapped = rows.map((r) => {
      const g = r.guests;
      const guest = Array.isArray(g) ? g[0] ?? null : g ?? null;
      return {
        id: r.id,
        guest_id: r.guest_id,
        scan_status: r.scan_status,
        document_type: r.document_type,
        document_number: r.document_number,
        kbs_person_kind: r.kbs_person_kind,
        usage_kind: r.usage_kind,
        mrz_batch_key: r.mrz_batch_key,
        guest
      };
    });

    return { ok: true, data: mapped };
  });

  app.post('/documents/upsert', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const body = UpsertSchema.parse(req.body);
    const mrzExtra = requireValidMrzForUpsert({
      parsed: body.parsed,
      rawMrz: body.rawMrz ?? null,
      ocrEngine: body.ocrEngine ?? null
    });
    const scanMeta = { scanned_by_user_id: auth.authUserId as string };
    const normalizedDocNo = body.parsed.documentNumber ? body.parsed.documentNumber.trim() : null;
    const fullName =
      body.parsed.fullName ??
      (([body.parsed.firstName, body.parsed.lastName].filter(Boolean).join(' ').trim() || null) as string | null);
    const birthDate = body.parsed.birthDate && body.parsed.birthDate.length >= 10 ? body.parsed.birthDate.slice(0, 10) : null;
    const expiryDate = body.parsed.expiryDate && body.parsed.expiryDate.length >= 10 ? body.parsed.expiryDate.slice(0, 10) : null;

    const hasMrz = !!(body.parsed.rawMrz ?? body.rawMrz);
    const deferReady = body.deferReady === true;
    const coreReady = !!(normalizedDocNo && fullName);
    const scanStatus = deferReady
      ? hasMrz || coreReady
        ? 'scanned'
        : 'draft'
      : coreReady
        ? 'ready_to_submit'
        : hasMrz
          ? 'scanned'
          : 'draft';

    const kbsExtras = kbsGuestDocumentExtras(body);

    // Idempotency:
    // - If document identity exists (hotel + type + document_number), update and return it.
    // - Otherwise create a new guest + guest_document row.
    if (normalizedDocNo) {
      const { data: existing, error: exErr } = await app.supabase
        .schema('ops')
        .from('guest_documents')
        .select('id, guest_id, scan_status')
        .eq('hotel_id', auth.hotelId)
        .eq('document_type', body.parsed.documentType)
        .eq('document_number', normalizedDocNo)
        .maybeSingle();
      if (exErr) throw Errors.internal('Failed to load existing document');
      if (existing) {
        const { data: updated, error: updErr } = await app.supabase
          .schema('ops')
          .from('guest_documents')
          .update({
            document_number: normalizedDocNo,
            issuing_country_code: body.parsed.issuingCountryCode,
            nationality_code: body.parsed.nationalityCode,
            expiry_date: expiryDate,
            raw_mrz: body.parsed.rawMrz ?? body.rawMrz ?? null,
            parsed_payload: body.parsed,
            scan_confidence: body.scanConfidence ?? body.parsed.confidence ?? null,
            scan_status: scanStatus,
            ...kbsExtras,
            ...mrzExtra,
            ...scanMeta
          })
          .eq('id', existing.id)
          .select('id, guest_id, scan_status')
          .single();
        if (updErr || !updated) throw Errors.internal('Failed to update document');

        await app.supabase
          .schema('ops')
          .from('guests')
          .update({
            full_name: fullName ?? 'UNKNOWN',
            first_name: body.parsed.firstName,
            last_name: body.parsed.lastName,
            middle_name: body.parsed.middleName,
            nationality_code: body.parsed.nationalityCode,
            gender: body.parsed.gender,
            birth_date: birthDate,
            ...(body.fatherName !== undefined ? { father_name: body.fatherName } : {}),
            ...(body.motherName !== undefined ? { mother_name: body.motherName } : {})
          })
          .eq('id', existing.guest_id)
          .eq('hotel_id', auth.hotelId);

        await writeAudit({
          supabase: app.supabase,
          hotelId: auth.hotelId,
          actorUserId: auth.authUserId,
          action: 'document.upsert',
          entityType: 'guest_document',
          entityId: updated.id,
          metadata: { scan_status: updated.scan_status, idempotent: true }
        });

        return { ok: true, data: { guestId: updated.guest_id, guestDocumentId: updated.id, scanStatus: updated.scan_status } };
      }
    }

    // Create guest
    const { data: guest, error: gErr } = await app.supabase
      .schema('ops')
      .from('guests')
      .insert({
        hotel_id: auth.hotelId,
        arrival_group_id: body.arrivalGroupId ?? null,
        full_name: fullName ?? 'UNKNOWN',
        first_name: body.parsed.firstName,
        last_name: body.parsed.lastName,
        middle_name: body.parsed.middleName,
        nationality_code: body.parsed.nationalityCode,
        gender: body.parsed.gender,
        birth_date: birthDate,
        father_name: body.fatherName ?? null,
        mother_name: body.motherName ?? null
      })
      .select('id')
      .single();
    if (gErr || !guest) throw Errors.internal('Failed to create guest');

    // Create document
    const { data: doc, error: dErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .insert({
        guest_id: guest.id,
        hotel_id: auth.hotelId,
        document_type: body.parsed.documentType,
        document_number: normalizedDocNo,
        issuing_country_code: body.parsed.issuingCountryCode,
        nationality_code: body.parsed.nationalityCode,
        expiry_date: expiryDate,
        raw_mrz: body.parsed.rawMrz ?? body.rawMrz ?? null,
        parsed_payload: body.parsed,
        scan_confidence: body.scanConfidence ?? body.parsed.confidence ?? null,
        scan_status: scanStatus,
        ...kbsExtras,
        ...mrzExtra,
        ...scanMeta
      })
      .select('id, scan_status')
      .single();

    if (dErr || !doc) {
      // If unique constraint hits (e.g. concurrent inserts), fetch and return existing.
      if (normalizedDocNo) {
        const { data: again, error: againErr } = await app.supabase
          .schema('ops')
          .from('guest_documents')
          .select('id, guest_id, scan_status')
          .eq('hotel_id', auth.hotelId)
          .eq('document_type', body.parsed.documentType)
          .eq('document_number', normalizedDocNo)
          .maybeSingle();
        if (!againErr && again) {
          return { ok: true, data: { guestId: again.guest_id, guestDocumentId: again.id, scanStatus: again.scan_status } };
        }
      }
      throw Errors.conflict('Document already exists for this hotel');
    }

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'document.upsert',
      entityType: 'guest_document',
      entityId: doc.id,
      metadata: { scan_status: doc.scan_status }
    });

    return { ok: true, data: { guestId: guest.id, guestDocumentId: doc.id, scanStatus: doc.scan_status } };
  });

  app.get('/documents/mrz-recent', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const { data: docs, error: e0 } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select(
        'id, created_at, document_type, document_number, nationality_code, expiry_date, raw_mrz, scan_status, guest_id, mrz_checksum_valid, ocr_engine'
      )
      .eq('hotel_id', auth.hotelId)
      .not('raw_mrz', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (e0) throw Errors.internal('Failed to load passport MRZ list');

    const list = (docs ?? []) as Array<{
      id: string;
      guest_id: string | null;
      [k: string]: unknown;
    }>;
    const gids = [...new Set(list.map((d) => d.guest_id).filter(Boolean))] as string[];

    const guestMap: Record<string, { full_name: string | null; first_name: string | null; last_name: string | null }> = {};
    if (gids.length) {
      const { data: guests, error: e1 } = await app.supabase
        .schema('ops')
        .from('guests')
        .select('id, full_name, first_name, last_name')
        .in('id', gids);
      if (e1) throw Errors.internal('Failed to load guest names');
      for (const g of guests ?? []) {
        const row = g as { id: string; full_name: string | null; first_name: string | null; last_name: string | null };
        guestMap[row.id] = { full_name: row.full_name, first_name: row.first_name, last_name: row.last_name };
      }
    }

    const items = list.map((d) => ({ ...d, guest: d.guest_id ? guestMap[d.guest_id] ?? null : null }));

    return { ok: true, data: items };
  });
};

