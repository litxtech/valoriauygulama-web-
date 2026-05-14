import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import { writeAudit } from '../audit/auditService.js';

const AssignSchema = z.object({
  guestDocumentId: z.string().uuid(),
  roomId: z.string().uuid()
});

const MarkReadySchema = z.object({
  guestDocumentIds: z.array(z.string().uuid()).min(1)
});

export const staysRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rooms', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const { data, error } = await app.supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number, floor, capacity, is_active')
      .eq('hotel_id', auth.hotelId)
      .eq('is_active', true)
      .order('room_number', { ascending: true })
      .limit(200);
    if (error) throw Errors.internal('Failed to load rooms');
    return { ok: true, data: data ?? [] };
  });

  app.get('/stay/active-by-document/:guestDocumentId', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const guestDocumentId = z.string().uuid().parse((req.params as any).guestDocumentId);

    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id')
      .eq('id', guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    const { data: stay, error: stayErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id, room_id, stay_status, check_in_at, check_out_at, updated_at')
      .eq('hotel_id', auth.hotelId)
      .eq('guest_id', doc.guest_id)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stayErr || !stay) throw Errors.notFound('Active stay not found');
    return { ok: true, data: stay };
  });

  app.get('/rooms/summary', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();

    const { data: rooms, error: rErr } = await app.supabase
      .schema('ops')
      .from('rooms')
      .select('id, room_number, floor, capacity, is_active')
      .eq('hotel_id', auth.hotelId)
      .eq('is_active', true)
      .order('room_number', { ascending: true })
      .limit(300);
    if (rErr) throw Errors.internal('Failed to load rooms');

    const { data: stays, error: sErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .select('id, guest_id, room_id, stay_status, updated_at')
      .eq('hotel_id', auth.hotelId)
      .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (sErr) throw Errors.internal('Failed to load stays');

    const guestIds = Array.from(new Set((stays ?? []).map((s) => s.guest_id).filter(Boolean)));
    const { data: docs, error: dErr } = guestIds.length
      ? await app.supabase
          .schema('ops')
          .from('guest_documents')
          .select('id, guest_id, scan_status, updated_at, document_number, nationality_code')
          .eq('hotel_id', auth.hotelId)
          .in('guest_id', guestIds)
          .order('updated_at', { ascending: false })
          .limit(2000)
      : { data: [], error: null };
    if (dErr) throw Errors.internal('Failed to load documents');

    const latestDocByGuest = new Map<string, any>();
    for (const d of docs ?? []) {
      if (!latestDocByGuest.has(d.guest_id)) latestDocByGuest.set(d.guest_id, d);
    }

    const staysByRoom = new Map<string, any[]>();
    for (const s of stays ?? []) {
      const arr = staysByRoom.get(s.room_id) ?? [];
      arr.push(s);
      staysByRoom.set(s.room_id, arr);
    }

    const payload = (rooms ?? []).map((room) => {
      const roomStays = staysByRoom.get(room.id) ?? [];
      const guests = roomStays.map((s) => {
        const d = latestDocByGuest.get(s.guest_id);
        return {
          stayAssignmentId: s.id,
          guestId: s.guest_id,
          stayStatus: s.stay_status,
          guestDocumentId: d?.id ?? null,
          scanStatus: d?.scan_status ?? null,
          documentNumber: d?.document_number ?? null,
          nationalityCode: d?.nationality_code ?? null
        };
      });
      const counts = guests.reduce(
        (acc, g) => {
          const key = String(g.scanStatus ?? 'unknown');
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      return {
        roomId: room.id,
        roomNumber: room.room_number,
        floor: room.floor,
        capacity: room.capacity,
        guests,
        counts
      };
    });

    return { ok: true, data: payload };
  });

  app.post('/stay/assign-room', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const body = AssignSchema.parse(req.body);

    const { data: doc, error: docErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, guest_id, hotel_id')
      .eq('id', body.guestDocumentId)
      .maybeSingle();
    if (docErr || !doc) throw Errors.notFound('Guest document not found');
    if (doc.hotel_id !== auth.hotelId) throw Errors.forbidden('Hotel scope mismatch');

    // Try create stay. If an active stay already exists (unique partial index), update that stay's room_id.
    const { data: created, error: createErr } = await app.supabase
      .schema('ops')
      .from('stay_assignments')
      .insert({
        hotel_id: auth.hotelId,
        guest_id: doc.guest_id,
        room_id: body.roomId,
        stay_status: 'assigned',
        created_by: auth.authUserId
      })
      .select('id, room_id, stay_status')
      .maybeSingle();

    let stay = created ?? null;
    if (!stay) {
      // Fallback: update current active stay (assigned/checked_in/checkout_pending)
      const { data: active, error: activeErr } = await app.supabase
        .schema('ops')
        .from('stay_assignments')
        .select('id, stay_status')
        .eq('hotel_id', auth.hotelId)
        .eq('guest_id', doc.guest_id)
        .in('stay_status', ['assigned', 'checked_in', 'checkout_pending'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeErr || !active) throw Errors.conflict('Guest already has an active stay');

      const { data: updated, error: updErr } = await app.supabase
        .schema('ops')
        .from('stay_assignments')
        .update({ room_id: body.roomId })
        .eq('id', active.id)
        .select('id, room_id, stay_status')
        .single();
      if (updErr || !updated) throw Errors.internal('Failed to update stay');
      stay = updated;
    }

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'stay.assign_room',
      entityType: 'stay_assignment',
      entityId: stay.id,
      metadata: { guestDocumentId: body.guestDocumentId, roomId: body.roomId }
    });

    return { ok: true, data: stay };
  });

  /** Parti (Beklet) sonrası: `scanned` → `ready_to_submit` (oda ataması ayrıca yapılmalı). */
  app.post('/documents/mark-ready', async (req) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized();
    const body = MarkReadySchema.parse(req.body);

    const { data: rows, error: qErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .select('id, scan_status')
      .eq('hotel_id', auth.hotelId)
      .in('id', body.guestDocumentIds);
    if (qErr) throw Errors.internal('Failed to load documents');

    const allowed = (rows ?? []).filter((r) => r.scan_status === 'scanned').map((r) => r.id as string);
    if (!allowed.length) {
      return { ok: true, data: { updated: 0 } };
    }

    const { data: upd, error: uErr } = await app.supabase
      .schema('ops')
      .from('guest_documents')
      .update({ scan_status: 'ready_to_submit' })
      .in('id', allowed)
      .eq('hotel_id', auth.hotelId)
      .eq('scan_status', 'scanned')
      .select('id');
    if (uErr) throw Errors.internal('Failed to mark documents ready');

    await writeAudit({
      supabase: app.supabase,
      hotelId: auth.hotelId,
      actorUserId: auth.authUserId,
      action: 'document.mark_ready',
      entityType: 'guest_document',
      entityId: allowed[0] ?? 'batch',
      metadata: { count: upd?.length ?? 0, ids: allowed }
    });

    return { ok: true, data: { updated: upd?.length ?? 0 } };
  });
};

