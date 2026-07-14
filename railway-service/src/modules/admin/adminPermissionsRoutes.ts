import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { writeAudit } from '../audit/auditService.js';

const UpdateUserPermissionsSchema = z.object({
  permissions: z.record(z.string(), z.boolean())
});

/** Admin panel zaten id_capture / admin shell ile açılıyor; ops.role=admin tekrar şartı yok. */
function assertAuthenticated(auth: { authUserId: string; hotelId: string; role: string } | undefined) {
  if (!auth) throw Errors.unauthorized();
}

export const adminPermissionsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin/permission-catalog', async (req) => {
    assertAuthenticated(req.auth);

    const { data, error } = await app.supabase
      .schema('ops')
      .from('app_permissions')
      .select('code, name, description')
      .order('code', { ascending: true });
    if (error) throw Errors.internal('Failed to load permission catalog');
    return { ok: true, data: data ?? [] };
  });

  app.get('/admin/users-with-permissions', async (req) => {
    assertAuthenticated(req.auth);
    const auth = req.auth!;

    const { data: users, error: uErr } = await app.supabase
      .schema('ops')
      .from('app_users')
      .select('id, full_name, role, is_active, created_at, kbs_access_enabled')
      .eq('hotel_id', auth.hotelId);
    if (uErr) throw Errors.internal('Failed to load users');

    const { data: perms, error: pErr } = await app.supabase
      .schema('ops')
      .from('user_permissions')
      .select('user_id, permission_code, is_allowed')
      .eq('hotel_id', auth.hotelId);
    if (pErr) throw Errors.internal('Failed to load permissions');

    const byUser: Record<string, Record<string, boolean>> = {};
    for (const row of perms ?? []) {
      const userMap = byUser[row.user_id] ?? {};
      userMap[row.permission_code] = row.is_allowed;
      byUser[row.user_id] = userMap;
    }

    return {
      ok: true,
      data: (users ?? []).map((u) => ({
        id: u.id,
        fullName: u.full_name,
        role: u.role,
        isActive: u.is_active,
        kbsAccessEnabled: (u as { kbs_access_enabled?: boolean }).kbs_access_enabled !== false,
        permissions: byUser[u.id] ?? {}
      }))
    };
  });

  app.post('/admin/users/:userId/kbs-access', async (req) => {
    assertAuthenticated(req.auth);
    const auth = req.auth!;

    const userId = z.string().uuid().parse((req.params as any).userId);
    const body = z.object({ enabled: z.boolean() }).parse(req.body);

    if (userId === auth.authUserId) {
      throw Errors.badRequest('Cannot modify own KBS access');
    }

    const { data: target, error: findErr } = await app.supabase
      .schema('ops')
      .from('app_users')
      .select('id')
      .eq('id', userId)
      .eq('hotel_id', auth.hotelId)
      .maybeSingle();
    if (findErr || !target) throw Errors.notFound('User not found');

    const { error: upErr } = await app.supabase
      .schema('ops')
      .from('app_users')
      .update({ kbs_access_enabled: body.enabled })
      .eq('id', userId)
      .eq('hotel_id', auth.hotelId);
    if (upErr) throw Errors.internal('Failed to update KBS access');

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'kbs.access.toggle',
      entityType: 'app_users',
      entityId: userId,
      metadata: { enabled: body.enabled }
    });

    return { ok: true, data: { saved: true } };
  });

  app.post('/admin/users/:userId/permissions', async (req) => {
    assertAuthenticated(req.auth);
    const auth = req.auth!;

    const userId = z.string().uuid().parse((req.params as any).userId);
    const body = UpdateUserPermissionsSchema.parse(req.body);

    if (userId === auth.authUserId) {
      // prevent self-lockout
      throw Errors.badRequest('Cannot modify own permissions');
    }

    const entries = Object.entries(body.permissions).map(([code, allowed]) => ({
      hotel_id: auth.hotelId,
      user_id: userId,
      permission_code: code,
      is_allowed: allowed,
      assigned_by: auth.authUserId
    }));

    // Upsert each permission code for user
    for (const e of entries) {
      await app.supabase.schema('ops').from('user_permissions').upsert(e, { onConflict: 'hotel_id,user_id,permission_code' });
    }

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'permission.grant_revoke',
      entityType: 'user_permissions',
      entityId: userId,
      metadata: { changed: Object.keys(body.permissions) }
    });

    return { ok: true, data: { saved: true } };
  });
};
