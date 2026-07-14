import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { verifyGatewaySignature } from '../../shared/security/signature.js';
import { loadHotelCredentials } from '../credentials/credentialsService.js';
import { MockOfficialProvider } from '../providers/mockProvider.js';
import { HttpOfficialProvider } from '../providers/httpProvider.js';
import type { OfficialSubmissionProvider, SubmitCheckInPayload, SubmitCheckOutPayload } from '../providers/types.js';

const BaseSchema = z.object({
  hotelId: z.string().uuid(),
  guestDocumentId: z.string().uuid(),
  stayAssignmentId: z.string().uuid(),
  transactionId: z.string().uuid(),

  fullName: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  documentSeries: z.string().nullable().optional(),
  nationalityCode: z.string().nullable().optional(),
  issuingCountryCode: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  gender: z.enum(['M', 'F', 'X']).nullable().optional(),
  roomNumber: z.string().nullable().optional(),
  checkInAt: z.string().nullable().optional(),
  checkOutAt: z.string().nullable().optional(),
  documentExpiryDate: z.string().nullable().optional(),
  usageKind: z.string().nullable().optional(),
  kbsPersonKind: z.string().nullable().optional(),
  plateNumber: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  forwardDated: z.boolean().optional(),
  fatherName: z.string().nullable().optional(),
  motherName: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional()
});

function createProvider(app: any): OfficialSubmissionProvider {
  if (app.env.OFFICIAL_PROVIDER_MODE === 'mock') return new MockOfficialProvider();
  if (!app.env.OFFICIAL_PROVIDER_BASE_URL) throw new Error('OFFICIAL_PROVIDER_BASE_URL required for http provider');
  return new HttpOfficialProvider(app.env.OFFICIAL_PROVIDER_BASE_URL);
}

export const gatewayRoutes: FastifyPluginAsync = async (app) => {
  const provider = createProvider(app);

  const rawBodyToStream = (s: string) => Readable.from([s]);

  async function verifyRequest(req: any, rawBody: string) {
    const ts = Number(req.headers['x-gw-ts']);
    const signature = String(req.headers['x-gw-signature'] ?? '');
    const path = req.routerPath ?? req.raw.url ?? '';
    const result = verifyGatewaySignature({
      secret: app.env.GATEWAY_SHARED_SECRET,
      ts,
      method: req.method,
      path,
      body: rawBody,
      signature
    });
    if (!result.ok) {
      app.log.warn({ reason: result.reason }, 'gateway_signature_invalid');
      return false;
    }
    return true;
  }

  // Fastify rawBody capture (for signature)
  app.addHook('preParsing', async (req, _reply, payload) => {
    // @ts-expect-error attach raw body promise
    req.rawBody = await (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    })();
    // Re-inject payload for downstream JSON parser
    // @ts-expect-error return new stream
    return rawBodyToStream(String(req.rawBody ?? ''));
  });

  app.post('/gateway/check-in', async (req: any, reply) => {
    const rawBody = String(req.rawBody ?? '');
    if (!(await verifyRequest(req, rawBody))) return reply.status(401).send({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Unauthorized' } });

    const body = BaseSchema.parse(req.body) as SubmitCheckInPayload;
    const credentials = await loadHotelCredentials({ supabase: app.supabase, hotelId: body.hotelId, secret: app.env.KBS_CREDENTIAL_SECRET });
    try {
      const res = await provider.submitCheckIn(body, credentials);
      return { ok: true, data: res };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      app.log.error({ err: e, transactionId: body.transactionId }, 'provider_checkin_failed');
      // Asla boş/jenerik “Provider check-in failed” bırakma — teşhis için asıl mesaj.
      const message =
        detail && detail.trim() && detail.trim() !== 'Provider check-in failed'
          ? detail.trim()
          : `KBS check-in failed (ayrıntı yok). belge=${body.documentNumber ?? ''} ulke=${body.nationalityCode ?? ''} dogum=${body.birthDate ?? ''} oda=${body.roomNumber ?? ''} kind=${body.kbsPersonKind ?? ''}`;
      return reply.status(502).send({
        ok: false,
        error: {
          code: 'PROVIDER_ERROR',
          message,
        },
      });
    }
  });

  app.post('/gateway/delete', async (req: any, reply) => {
    const rawBody = String(req.rawBody ?? '');
    if (!(await verifyRequest(req, rawBody))) {
      return reply.status(401).send({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Unauthorized' } });
    }

    const body = z
      .object({
        hotelId: z.string().uuid(),
        guestDocumentId: z.string().uuid(),
        transactionId: z.string().uuid(),
        documentNumber: z.string().nullable().optional(),
        kbsPersonKind: z.string().nullable().optional()
      })
      .parse(req.body);

    const credentials = await loadHotelCredentials({
      supabase: app.supabase,
      hotelId: body.hotelId,
      secret: app.env.KBS_CREDENTIAL_SECRET
    });
    try {
      const res = await provider.submitDelete(
        {
          hotelId: body.hotelId,
          guestDocumentId: body.guestDocumentId,
          transactionId: body.transactionId,
          documentNumber: body.documentNumber ?? null,
          kbsPersonKind: body.kbsPersonKind ?? null
        },
        credentials
      );
      return { ok: true, data: res };
    } catch (e) {
      app.log.error({ err: e, transactionId: body.transactionId }, 'provider_delete_failed');
      return reply.status(502).send({ ok: false, error: { code: 'PROVIDER_ERROR', message: 'Provider delete failed' } });
    }
  });

  app.post('/gateway/check-out', async (req: any, reply) => {
    const rawBody = String(req.rawBody ?? '');
    if (!(await verifyRequest(req, rawBody))) return reply.status(401).send({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Unauthorized' } });

    const body = BaseSchema.parse(req.body) as SubmitCheckOutPayload;
    const credentials = await loadHotelCredentials({ supabase: app.supabase, hotelId: body.hotelId, secret: app.env.KBS_CREDENTIAL_SECRET });
    try {
      const res = await provider.submitCheckOut(body, credentials);
      return { ok: true, data: res };
    } catch (e) {
      app.log.error({ err: e, transactionId: body.transactionId }, 'provider_checkout_failed');
      return reply.status(502).send({ ok: false, error: { code: 'PROVIDER_ERROR', message: 'Provider check-out failed' } });
    }
  });

  app.post('/gateway/test-connection', async (req: any, reply) => {
    const rawBody = String(req.rawBody ?? '');
    if (!(await verifyRequest(req, rawBody))) return reply.status(401).send({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Unauthorized' } });

    const body = z.object({ hotelId: z.string().uuid() }).parse(req.body);
    const credentials = await loadHotelCredentials({ supabase: app.supabase, hotelId: body.hotelId, secret: app.env.KBS_CREDENTIAL_SECRET });
    const res = await provider.testConnection(credentials);
    return { ok: true, data: res };
  });
};

