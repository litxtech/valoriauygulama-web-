import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { writeAudit } from '../audit/auditService.js';
import { encrypt } from '../../shared/security/crypto.js';
import { GatewayClient } from '../../integrations/gateway-client/gatewayClient.js';

/** KBS kimlik okuma: admin + manager. Şifre yazma: yalnızca admin (RLS ile uyumlu). */
function assertKbsSettingsReadRole(role: string) {
  if (role !== 'admin' && role !== 'manager') {
    throw Errors.forbidden('KBS ayarları: yalnızca ops.app_users rolü admin veya manager olmalı');
  }
}

function assertKbsSettingsWriteRole(role: string) {
  if (role !== 'admin') {
    throw Errors.forbidden('KBS otel şifresi yalnızca admin tarafından kaydedilebilir');
  }
}

const UpsertSchema = z.object({
  facilityCode: z
    .string()
    .min(1)
    .transform((s) => s.trim().replace(/\s+/g, ''))
    .refine((s) => /^\d{1,12}$/.test(s), 'facilityCode must be numeric (KBS TssKod)'),
  username: z
    .string()
    .min(1)
    .transform((s) => s.trim().replace(/\D/g, ''))
    .refine((s) => s.length === 11, 'username must be 11-digit KullaniciTC'),
  /**
   * Password is write-only:
   * - if provided => overwrite
   * - if null/undefined => keep existing encrypted value
   */
  password: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  providerType: z.string().default('default'),
  isActive: z.boolean().default(true)
});

export const adminKbsSettingsRoutes: FastifyPluginAsync = async (app) => {
  const gw = new GatewayClient({ baseUrl: app.env.GATEWAY_BASE_URL, sharedSecret: app.env.GATEWAY_SHARED_SECRET });

  app.get('/admin/kbs-settings', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    assertKbsSettingsReadRole(auth.role);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('hotel_kbs_credentials')
      .select(
        'hotel_id, facility_code, username, provider_type, is_active, last_updated_by, last_tested_at, updated_at, created_at, password_encrypted'
      )
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (error) throw Errors.internal('Failed to load settings');

    if (!data) return { ok: true, data: null };

    const { password_encrypted: _pw, ...safe } = data as typeof data & { password_encrypted?: string };
    return {
      ok: true,
      data: {
        ...safe,
        has_password: Boolean(_pw && String(_pw).length > 0),
        /** DB alanı `username`; Jandarma SOAP KullaniciTC */
        kullanici_tc: safe.username
      }
    };
  });

  app.post('/admin/kbs-settings', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    assertKbsSettingsWriteRole(auth.role);

    let body: z.infer<typeof UpsertSchema>;
    try {
      body = UpsertSchema.parse(req.body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        const msg = e.issues.map((i) => i.message).join('; ') || 'Geçersiz form';
        throw Errors.badRequest(msg);
      }
      throw e;
    }

    const { data: existing } = await app.supabase
      .schema('ops')
      .from('hotel_kbs_credentials')
      .select('password_encrypted, api_key_encrypted')
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();

    const passwordEncrypted =
      body.password != null ? encrypt(body.password, app.env.KBS_CREDENTIAL_SECRET) : existing?.password_encrypted;
    if (!passwordEncrypted) throw Errors.badRequest('Password required for first-time setup');

    const apiKeyEncrypted =
      body.apiKey != null ? encrypt(body.apiKey, app.env.KBS_CREDENTIAL_SECRET) : existing?.api_key_encrypted ?? null;

    const { error } = await app.supabase.schema('ops').from('hotel_kbs_credentials').upsert(
      {
        hotel_id: auth.hotelId,
        facility_code: body.facilityCode,
        username: body.username,
        password_encrypted: passwordEncrypted,
        api_key_encrypted: apiKeyEncrypted,
        provider_type: body.providerType,
        is_active: body.isActive,
        last_updated_by: auth.authUserId
      },
      { onConflict: 'hotel_id' }
    );
    if (error) throw Errors.internal('Failed to save settings');

    try {
      await writeAudit({
        supabase: app.supabase,
        hotelId: auth.hotelId,
        actorUserId: auth.authUserId,
        action: 'kbs.settings.update',
        entityType: 'hotel_kbs_credentials',
        entityId: auth.hotelId,
        metadata: {
          changed_fields: {
            facility_code: true,
            username: true,
            password: body.password != null ? true : false,
            api_key: body.apiKey != null ? true : false,
            provider_type: true,
            is_active: true
          }
        }
      });
    } catch (auditErr) {
      req.log.warn({ err: auditErr }, 'kbs_settings_audit_failed');
    }

    return { ok: true, data: { saved: true } };
  });

  app.post('/admin/kbs-settings/test-connection', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    assertKbsSettingsReadRole(auth.role);

    const gwRes = await gw.post<{ ok: boolean; message: string; details?: unknown }>('/gateway/test-connection', {
      hotelId: auth.hotelId
    });

    await app.supabase
      .schema('ops')
      .from('hotel_kbs_credentials')
      .update({ last_tested_at: new Date().toISOString() })
      .eq('hotel_id', auth.hotelId);

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.connection.test',
      entityType: 'hotel_kbs_credentials',
      entityId: auth.hotelId,
      metadata: { ok: gwRes.ok ? true : false }
    });

    return gwRes.ok ? { ok: true, data: gwRes.data } : gwRes;
  });
};

