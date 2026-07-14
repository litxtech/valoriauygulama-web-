import { supabase } from '@/lib/supabase';
import { assignKbsRoom, submitKbsCheckInEdge } from '@/lib/kbsStaffOpsEdge';
import { resolveOpsHotelIdForCaller } from '@/lib/resolveOpsHotelId';
import type { MrzRecentDocRow } from '@/lib/loadMrzRecentDocuments';

export type MrzArchiveEditPayload = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  birth_date?: string | null;
  document_number?: string | null;
};

export async function updateMrzArchiveRecord(
  row: MrzRecentDocRow,
  edit: MrzArchiveEditPayload
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const fullName =
    edit.full_name?.trim() ||
    [edit.first_name, edit.last_name].filter(Boolean).join(' ').trim() ||
    undefined;

  const guestPatch: Record<string, unknown> = {};
  if (edit.first_name !== undefined) guestPatch.first_name = edit.first_name?.trim() || null;
  if (edit.last_name !== undefined) guestPatch.last_name = edit.last_name?.trim() || null;
  if (fullName) guestPatch.full_name = fullName;
  if (edit.birth_date !== undefined) guestPatch.birth_date = edit.birth_date || null;

  if (Object.keys(guestPatch).length > 0 && row.guest_id) {
    const { error } = await supabase
      .schema('ops')
      .from('guests')
      .update(guestPatch)
      .eq('id', row.guest_id)
      .eq('hotel_id', ctx.hotelId);
    if (error) return { ok: false, message: error.message };
  }

  if (edit.document_number !== undefined) {
    const { error } = await supabase
      .schema('ops')
      .from('guest_documents')
      .update({ document_number: edit.document_number?.trim() || null })
      .eq('id', row.id)
      .eq('hotel_id', ctx.hotelId);
    if (error) return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function deleteMrzArchiveRecord(
  row: MrzRecentDocRow
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await resolveOpsHotelIdForCaller();
  if (!ctx.ok) return { ok: false, message: ctx.message };

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .delete()
    .eq('id', row.id)
    .eq('hotel_id', ctx.hotelId);

  if (docErr) {
    const msg = docErr.message.includes('violates foreign key')
      ? 'Bu belge resmi KBS bildirimine bağlı; önce bildirimi iptal edin veya destek alın.'
      : docErr.message;
    return { ok: false, message: msg };
  }

  if (row.guest_id) {
    const { count, error: cntErr } = await supabase
      .schema('ops')
      .from('guest_documents')
      .select('id', { count: 'exact', head: true })
      .eq('guest_id', row.guest_id)
      .eq('hotel_id', ctx.hotelId);
    if (!cntErr && (count ?? 0) === 0) {
      await supabase.schema('ops').from('guests').delete().eq('id', row.guest_id).eq('hotel_id', ctx.hotelId);
    }
  }

  return { ok: true };
}

/** Oda ata → Edge check-in (Railway JWT yok). */
export async function notifyMrzArchiveToKbs(args: {
  guestDocumentId: string;
  roomId: string;
  currentStatus: string;
}): Promise<{ ok: true; transactionId?: string } | { ok: false; message: string }> {
  const assign = await assignKbsRoom({
    guestDocumentId: args.guestDocumentId,
    roomId: args.roomId,
  });
  if (!assign.ok) return { ok: false, message: assign.error.message };

  const submit = await submitKbsCheckInEdge({ guestDocumentId: args.guestDocumentId });
  if (!submit.ok) return { ok: false, message: submit.error.message };

  return { ok: true, transactionId: submit.data.transactionId };
}
