import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import type { AuthContext } from '../../shared/security/authTypes.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const HeaderSchema = z.object({
  authorization: z.string().optional()
});

type AppUserRow = {
  id: string;
  hotel_id: string;
  role: string;
  is_active: boolean | null;
};

/**
 * Auth strategy:
 * - Verify Supabase JWT using the service client (getUser).
 * - Resolve ops.app_users row for hotel scope and role (ensure + staff admin sync).
 *
 * NOTE: This is the enforcement point; UI must never receive service role keys.
 */
export const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    const expected = app.env.KBS_GATEWAY_TOKEN;
    if (expected && expected.length > 0) {
      const edge = req.headers['x-kbs-gateway-token'];
      const gotRaw = typeof edge === 'string' ? edge : Array.isArray(edge) ? edge[0] : '';
      const got = typeof gotRaw === 'string' ? gotRaw : '';
      if (got !== expected) {
        req.log.warn(
          {
            event: 'gateway_token_mismatch',
            path: req.url,
            hasHeader: got.length > 0,
            gotLen: got.length,
            expectedLen: expected.length
          },
          'Invalid or missing gateway token'
        );
        throw Errors.forbidden('Invalid or missing gateway token');
      }
    }

    const headers = HeaderSchema.safeParse(req.headers);
    if (!headers.success) throw Errors.unauthorized();
    const bearer = headers.data.authorization;
    if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) {
      req.log.warn({ event: 'auth_missing_bearer', path: req.url }, 'Missing bearer token');
      throw Errors.unauthorized('Missing bearer token');
    }
    const token = bearer.slice('bearer '.length).trim();
    if (!token) throw Errors.unauthorized('Missing bearer token');

    const { data: userData, error: userErr } = await app.supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      req.log.warn(
        { event: 'auth_invalid_jwt', path: req.url, err: userErr?.message ?? null },
        'Invalid token'
      );
      throw Errors.unauthorized('Invalid token');
    }

    const authUserId = userData.user.id;

    const loadAppUser = async (): Promise<AppUserRow | null> => {
      const { data, error } = await app.supabase
        .schema('ops')
        .from('app_users')
        .select('id, hotel_id, role, is_active')
        .eq('id', authUserId)
        .maybeSingle();
      if (error) {
        req.log.warn({ event: 'auth_app_user_query', path: req.url, err: error.message }, 'User not provisioned');
        throw Errors.unauthorized('User not provisioned');
      }
      return (data as AppUserRow | null) ?? null;
    };

    let appUser = await loadAppUser();

    // Edge/RPC tarafı otomatik oluşturur; Railway path'te de aynı ensure çalışsın.
    if (!appUser) {
      const { error: ensureErr } = await app.supabase.schema('ops').rpc('ensure_app_user_for_auth', {
        p_user_id: authUserId
      });
      if (ensureErr) {
        req.log.warn(
          { event: 'auth_ensure_app_user', path: req.url, err: ensureErr.message, authUserId },
          'Failed to ensure ops.app_users'
        );
        throw Errors.unauthorized('User not provisioned');
      }
      appUser = await loadAppUser();
    }

    if (!appUser || appUser.is_active === false) {
      req.log.warn(
        { event: 'auth_user_inactive', path: req.url, authUserId, found: Boolean(appUser) },
        'User inactive'
      );
      throw Errors.forbidden('User inactive');
    }

    // Eski receptionist kaydı kalmış Valoria admin: ops rolünü staff.admin ile hizala.
    if (appUser.role !== 'admin') {
      const { data: staff } = await app.supabase
        .from('staff')
        .select('role')
        .eq('auth_id', authUserId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (staff?.role === 'admin') {
        const { error: syncErr } = await app.supabase
          .schema('ops')
          .from('app_users')
          .update({ role: 'admin', is_active: true })
          .eq('id', authUserId);
        if (!syncErr) {
          appUser = { ...appUser, role: 'admin', is_active: true };
        } else {
          req.log.warn(
            { event: 'auth_sync_staff_admin', path: req.url, err: syncErr.message },
            'Failed to sync ops role from staff admin'
          );
        }
      }
    }

    req.auth = {
      authUserId,
      hotelId: appUser.hotel_id,
      role: appUser.role
    } as AuthContext;
  });
};
