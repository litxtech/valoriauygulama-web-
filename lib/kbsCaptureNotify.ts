import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/kbsApi';
import { assignKbsRoom } from '@/lib/kbsStaffOpsEdge';
import {
  enrichKbsParsedFromSources,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsCaptureManualEdit = {
  firstName?: string | null;
  lastName?: string | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  nationalityCode?: string | null;
  gender?: 'M' | 'F' | 'X' | null;
  motherName?: string | null;
  fatherName?: string | null;
  expiryDate?: string | null;
  documentSeries?: string | null;
};

/** Elle düzeltme: parsed_payload + guests + document_number. */
export async function updateKbsCaptureManualFields(
  row: KbsCapturedDocumentRow,
  edit: KbsCaptureManualEdit
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = enrichKbsParsedFromSources(row.parsed_payload) ?? normalizeKbsParsedPayload(row.parsed_payload);
  const base: ParsedDocument = existing ?? {
    documentType: 'id_card',
    fullName: null,
    firstName: null,
    lastName: null,
    middleName: null,
    documentNumber: null,
    nationalityCode: null,
    issuingCountryCode: null,
    birthDate: null,
    expiryDate: null,
    gender: null,
    rawMrz: null,
    confidence: null,
    checksumsValid: null,
    warnings: [],
  };

  const firstName = edit.firstName !== undefined ? edit.firstName?.trim() || null : base.firstName;
  const lastName = edit.lastName !== undefined ? edit.lastName?.trim() || null : base.lastName;
  const documentNumber =
    edit.documentNumber !== undefined ? edit.documentNumber?.trim() || null : base.documentNumber;
  const birthDateRaw = edit.birthDate !== undefined ? edit.birthDate?.trim() || null : base.birthDate;
  const birthDate = birthDateRaw && birthDateRaw.length >= 10 ? birthDateRaw.slice(0, 10) : birthDateRaw;
  const nationalityCode =
    edit.nationalityCode !== undefined
      ? edit.nationalityCode?.trim().toUpperCase() || null
      : base.nationalityCode;
  const gender = edit.gender !== undefined ? edit.gender : base.gender;
  const motherName = edit.motherName !== undefined ? edit.motherName?.trim() || null : base.motherName;
  const fatherName = edit.fatherName !== undefined ? edit.fatherName?.trim() || null : base.fatherName;
  const expiryRaw = edit.expiryDate !== undefined ? edit.expiryDate?.trim() || null : base.expiryDate;
  const expiryDate = expiryRaw && expiryRaw.length >= 10 ? expiryRaw.slice(0, 10) : expiryRaw;
  const documentSeries =
    edit.documentSeries !== undefined ? edit.documentSeries?.trim() || null : base.documentSeries;

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || base.fullName;
  const payload: ParsedDocument = {
    ...base,
    firstName,
    lastName,
    fullName,
    documentNumber,
    documentSeries,
    birthDate,
    expiryDate,
    nationalityCode,
    gender,
    motherName: motherName ?? undefined,
    fatherName: fatherName ?? undefined,
    warnings: (base.warnings ?? []).filter(
      (w) => w !== 'ocr_pending' && w !== 'ocr_processing' && w !== 'ocr_failed'
    ),
  };

  const coreReady = !!(documentNumber && fullName);
  const docPatch: Record<string, unknown> = {
    parsed_payload: payload,
    document_number: documentNumber,
    nationality_code: nationalityCode,
    expiry_date: expiryDate,
    scan_status: coreReady ? 'ready_to_submit' : row.scan_status ?? 'draft',
  };

  const { error: docErr } = await supabase
    .schema('ops')
    .from('guest_documents')
    .update(docPatch)
    .eq('id', row.id);
  if (docErr) return { ok: false, message: docErr.message };

  if (row.guest_id) {
    const guestPatch: Record<string, string | null> = {
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      nationality_code: nationalityCode,
      gender: gender,
      birth_date: birthDate,
      mother_name: motherName ?? null,
      father_name: fatherName ?? null,
    };
    const { error: guestErr } = await supabase
      .schema('ops')
      .from('guests')
      .update(guestPatch)
      .eq('id', row.guest_id);
    if (guestErr) return { ok: false, message: guestErr.message };
  }

  return { ok: true };
}

/** Oda ata → hazır işaretle → check-in bildir. */
export async function notifyKbsCaptureToKbs(args: {
  guestDocumentId: string;
  roomId: string;
  currentStatus?: string | null;
}): Promise<{ ok: true; transactionId?: string } | { ok: false; message: string }> {
  const assign = await assignKbsRoom({
    guestDocumentId: args.guestDocumentId,
    roomId: args.roomId,
  });
  if (!assign.ok) return { ok: false, message: assign.error.message };

  const status = args.currentStatus ?? '';
  if (status === 'scanned' || status === 'draft' || status === 'incomplete' || !status) {
    const mark = await apiPost<{ updated?: number }>('/documents/mark-ready', {
      guestDocumentIds: [args.guestDocumentId],
    });
    if (!mark.ok) {
      const { error } = await supabase
        .schema('ops')
        .from('guest_documents')
        .update({ scan_status: 'ready_to_submit' })
        .eq('id', args.guestDocumentId);
      if (error) return { ok: false, message: mark.error.message };
    }
  }

  const submit = await apiPost<{ transactionId: string; idempotent?: boolean }>('/submissions/check-in', {
    guestDocumentId: args.guestDocumentId,
  });
  if (!submit.ok) return { ok: false, message: submit.error.message };
  return { ok: true, transactionId: submit.data.transactionId };
}
