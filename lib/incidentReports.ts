import { supabase } from '@/lib/supabase';
import { sendNotificationToStaffIds } from '@/lib/notificationService';

export type IncidentReportStatus =
  | 'draft'
  | 'pending_admin_approval'
  | 'revision_requested'
  | 'approved'
  | 'pdf_generated'
  | 'archived'
  | 'cancelled';

export type IncidentReportRow = {
  id: string;
  report_no: string;
  report_type_id: string;
  department: string | null;
  hotel_name: string;
  occurred_at: string;
  location_label: string;
  room_number: string | null;
  related_guest_name: string | null;
  related_staff_name: string | null;
  related_external_person_name: string | null;
  description: string;
  action_taken: string | null;
  status: IncidentReportStatus;
  created_by_staff_id: string;
  submitted_at: string | null;
  approved_by_staff_id: string | null;
  approved_at: string | null;
  revision_requested_by_staff_id: string | null;
  revision_requested_at: string | null;
  revision_note: string | null;
  cancelled_by_staff_id: string | null;
  cancelled_at: string | null;
  archived_by_staff_id: string | null;
  archived_at: string | null;
  pdf_file_path: string | null;
  pdf_generated_at: string | null;
  pdf_generated_by_staff_id: string | null;
  printed_at: string | null;
  printed_by_staff_id: string | null;
  parent_report_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IncidentReportTypeRow = {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export type IncidentReportRecipientRow = {
  id: string;
  report_id: string;
  staff_id: string;
  notified_at: string | null;
  created_at: string;
  staff?: { id: string; full_name: string | null; role: string | null; department: string | null } | null;
};

export type IncidentReportMediaRow = {
  id: string;
  report_id: string;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export async function listIncidentReportTypes() {
  return await supabase
    .from('incident_report_types')
    .select('id, code, name, is_system, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: false })
    .order('name', { ascending: true });
}

export async function listIncidentReports(args: {
  status?: IncidentReportStatus;
  roomNumber?: string;
  reportNo?: string;
  typeId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  let q = supabase
    .from('incident_reports')
    .select(
      'id, report_no, report_type_id, department, hotel_name, occurred_at, location_label, room_number, related_guest_name, related_staff_name, related_external_person_name, description, action_taken, status, created_by_staff_id, submitted_at, approved_by_staff_id, approved_at, revision_requested_by_staff_id, revision_requested_at, revision_note, cancelled_by_staff_id, cancelled_at, archived_by_staff_id, archived_at, pdf_file_path, pdf_generated_at, pdf_generated_by_staff_id, printed_at, printed_by_staff_id, parent_report_id, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 200);

  if (args.status) q = q.eq('status', args.status);
  if (args.roomNumber && args.roomNumber.trim()) q = q.eq('room_number', args.roomNumber.trim());
  if (args.reportNo && args.reportNo.trim()) q = q.eq('report_no', args.reportNo.trim());
  if (args.typeId) q = q.eq('report_type_id', args.typeId);
  if (args.from) q = q.gte('occurred_at', args.from);
  if (args.to) q = q.lte('occurred_at', args.to);
  if (args.search && args.search.trim()) {
    const term = args.search.trim();
    q = q.or(`description.ilike.%${term}%,related_guest_name.ilike.%${term}%,related_staff_name.ilike.%${term}%`);
  }
  return await q;
}

export async function getIncidentReportDetail(reportId: string) {
  const reportRes = await supabase
    .from('incident_reports')
    .select(
      'id, report_no, report_type_id, department, hotel_name, occurred_at, location_label, room_number, related_guest_name, related_staff_name, related_external_person_name, description, action_taken, status, created_by_staff_id, submitted_at, approved_by_staff_id, approved_at, revision_requested_by_staff_id, revision_requested_at, revision_note, cancelled_by_staff_id, cancelled_at, archived_by_staff_id, archived_at, pdf_file_path, pdf_generated_at, pdf_generated_by_staff_id, printed_at, printed_by_staff_id, parent_report_id, created_at, updated_at'
    )
    .eq('id', reportId)
    .single();

  if (reportRes.error) {
    return {
      reportRes,
      mediaRes: null as any,
      peopleRes: null as any,
      signaturesRes: null as any,
      internalNotesRes: null as any,
      auditRes: null as any,
      recipientsRes: null as any,
    };
  }

  const [mediaRes, peopleRes, signaturesRes, internalNotesRes, auditRes, recipientsRes] = await Promise.all([
    supabase
      .from('incident_report_media')
      .select('id, report_id, file_path, thumbnail_path, caption, sort_order, is_primary, created_at')
      .eq('report_id', reportId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('incident_report_people')
      .select('id, report_id, person_role, full_name, title, contact_info, signature_status, refusal_note, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('incident_report_signatures')
      .select('id, report_id, signer_role, signer_name, signer_title, signature_file_path, refused, refusal_note, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
    supabase
      .from('incident_report_internal_notes')
      .select('id, report_id, note, include_in_pdf, created_by_staff_id, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false }),
    supabase
      .from('incident_report_audit_log')
      .select('id, report_id, event_type, event_payload, actor_staff_id, created_at')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false }),
    supabase
      .from('incident_report_recipients')
      .select('id, report_id, staff_id, notified_at, created_at, staff:staff_id (id, full_name, role, department)')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true }),
  ]);

  return { reportRes, mediaRes, peopleRes, signaturesRes, internalNotesRes, auditRes, recipientsRes };
}

export async function createIncidentReport(payload: {
  organization_id: string;
  report_no: string;
  report_type_id: string;
  occurred_at: string;
  location_label: string;
  description: string;
  department?: string | null;
  hotel_name?: string | null;
  room_number?: string | null;
  related_guest_name?: string | null;
  related_staff_name?: string | null;
  related_external_person_name?: string | null;
  action_taken?: string | null;
  created_by_staff_id: string;
  parent_report_id?: string | null;
}) {
  return await supabase.from('incident_reports').insert(payload).select('id').single();
}

export async function updateIncidentReportDraft(reportId: string, patch: Partial<IncidentReportRow>) {
  return await supabase.from('incident_reports').update(patch).eq('id', reportId).select('id').single();
}

export async function submitIncidentReportForApproval(reportId: string) {
  return await supabase
    .from('incident_reports')
    .update({
      status: 'pending_admin_approval',
      submitted_at: new Date().toISOString(),
      revision_note: null,
    })
    .eq('id', reportId)
    .select('id, status')
    .single();
}

export async function requestIncidentReportRevision(reportId: string, note: string, reviewerStaffId: string) {
  return await supabase
    .from('incident_reports')
    .update({
      status: 'revision_requested',
      revision_note: note.trim(),
      revision_requested_by_staff_id: reviewerStaffId,
      revision_requested_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('id, status')
    .single();
}

export async function approveIncidentReport(reportId: string, approverStaffId: string) {
  return await supabase
    .from('incident_reports')
    .update({
      status: 'approved',
      approved_by_staff_id: approverStaffId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('id, status')
    .single();
}

export async function markIncidentReportPdfGenerated(reportId: string, args: { filePath: string; generatedByStaffId: string }) {
  void args.generatedByStaffId;
  return await supabase
    .rpc('mark_incident_report_pdf_generated', {
      p_report_id: reportId,
      p_file_path: args.filePath,
    })
    .single();
}

export async function archiveIncidentReport(reportId: string, archivedByStaffId: string) {
  return await supabase
    .from('incident_reports')
    .update({
      status: 'archived',
      archived_by_staff_id: archivedByStaffId,
      archived_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('id, status')
    .single();
}

export async function addIncidentReportInternalNote(payload: {
  organization_id: string;
  report_id: string;
  note: string;
  include_in_pdf?: boolean;
  created_by_staff_id: string;
}) {
  return await supabase.from('incident_report_internal_notes').insert(payload).select('id').single();
}

export async function addIncidentReportMedia(payload: {
  organization_id: string;
  report_id: string;
  file_path: string;
  thumbnail_path?: string | null;
  caption?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  created_by_staff_id: string;
}) {
  return await supabase.from('incident_report_media').insert(payload).select('id').single();
}

export async function listIncidentReportRecipients(reportId: string) {
  return await supabase
    .from('incident_report_recipients')
    .select('id, report_id, staff_id, notified_at, created_at, staff:staff_id (id, full_name, role, department)')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });
}

export async function syncIncidentReportRecipients(args: {
  organizationId: string;
  reportId: string;
  staffIds: string[];
  createdByStaffId: string;
}) {
  const unique = [...new Set(args.staffIds.filter(Boolean))];
  const existing = await supabase
    .from('incident_report_recipients')
    .select('id, staff_id')
    .eq('report_id', args.reportId);

  if (existing.error) return { error: existing.error };

  const existingIds = new Set((existing.data ?? []).map((r) => r.staff_id as string));
  const toRemove = (existing.data ?? []).filter((r) => !unique.includes(r.staff_id as string));
  const toAdd = unique.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    const del = await supabase
      .from('incident_report_recipients')
      .delete()
      .in(
        'id',
        toRemove.map((r) => r.id as string)
      );
    if (del.error) return { error: del.error };
  }

  if (toAdd.length > 0) {
    const ins = await supabase.from('incident_report_recipients').insert(
      toAdd.map((staffId) => ({
        organization_id: args.organizationId,
        report_id: args.reportId,
        staff_id: staffId,
        created_by_staff_id: args.createdByStaffId,
      }))
    );
    if (ins.error) return { error: ins.error };
  }

  const names = unique.length
    ? (
        await supabase.from('staff').select('full_name').in('id', unique)
      ).data
        ?.map((s) => (s.full_name ?? '').trim())
        .filter(Boolean)
        .join(', ') ?? null
    : null;

  if (names !== null) {
    await supabase.from('incident_reports').update({ related_staff_name: names || null }).eq('id', args.reportId);
  }

  return { error: null };
}

export async function notifyIncidentReportRecipients(args: {
  report: Pick<IncidentReportRow, 'id' | 'report_no' | 'location_label' | 'room_number' | 'status'>;
  staffIds: string[];
  createdByStaffId: string;
  isStaffRoute?: boolean;
  message?: string;
}) {
  const unique = [...new Set(args.staffIds.filter((id) => id && id !== args.createdByStaffId))];
  if (unique.length === 0) {
    return { count: 0, error: 'Bildirim gönderilecek personel seçilmedi.' };
  }

  const roomPart = args.report.room_number ? `Oda ${args.report.room_number}` : args.report.location_label;
  const body =
    args.message?.trim() ||
    `${args.report.report_no} · ${roomPart} · Durum: ${args.report.status === 'draft' ? 'Taslak' : args.report.status}`;

  const base = args.isStaffRoute ? '/staff/incident-reports' : '/admin/incident-reports';
  const result = await sendNotificationToStaffIds({
    staffIds: unique,
    title: `Tutanak: ${args.report.report_no}`,
    body,
    createdByStaffId: args.createdByStaffId,
    notificationType: 'report_status',
    category: 'staff',
    data: {
      screen: `${base}/${args.report.id}`,
      url: `${base}/${args.report.id}`,
      incidentReportId: args.report.id,
      reportNo: args.report.report_no,
    },
  });

  if (!result.error && result.count > 0) {
    await supabase
      .from('incident_report_recipients')
      .update({ notified_at: new Date().toISOString() })
      .eq('report_id', args.report.id)
      .in('staff_id', unique);
  }

  return result;
}

export async function resendIncidentReportToPrinter(reportId: string) {
  const reportRes = await supabase
    .from('incident_reports')
    .select('id, organization_id, report_no, pdf_file_path, status')
    .eq('id', reportId)
    .single();

  if (reportRes.error) return { data: null, error: reportRes.error };
  if (!reportRes.data.pdf_file_path) {
    return {
      data: null,
      error: { message: 'Bu tutanak icin PDF dosyasi bulunamadi.' } as any,
    };
  }

  return await supabase.functions.invoke('print-incident-report', {
    body: {
      type: 'MANUAL_RESEND',
      table: 'incident_reports',
      record: {
        id: reportRes.data.id,
        organization_id: reportRes.data.organization_id,
        report_no: reportRes.data.report_no,
        pdf_file_path: reportRes.data.pdf_file_path,
      },
    },
  });
}
