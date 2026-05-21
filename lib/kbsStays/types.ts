export type GuestStayStatus =
  | 'draft'
  | 'checked_in'
  | 'checkout_pending'
  | 'checked_out'
  | 'checkout_failed'
  | 'correction_required'
  | 'delete_pending'
  | 'deleted_from_kbs'
  | 'delete_failed'
  | 're_submitted'
  | 'cancelled';

export type KbsOpStatus = 'pending' | 'sent' | 'failed';

export type CheckoutType = 'single' | 'room' | 'group' | 'selected_bulk';

export type KbsLogActionType = 'checkin' | 'checkout' | 'delete' | 'resubmit' | 'correction';

export type GuestStayRow = {
  id: string;
  hotel_id: string;
  room_no: string;
  group_id: string | null;
  scan_session_id: string | null;
  guest_scan_item_id: string | null;
  guest_document_id: string | null;
  stay_assignment_id: string | null;
  first_name: string | null;
  last_name: string | null;
  guest_type: string | null;
  document_type: string | null;
  nationality: string | null;
  identity_no_masked: string | null;
  passport_no_masked: string | null;
  checkin_at: string;
  checkout_at: string | null;
  stay_status: GuestStayStatus;
  kbs_checkin_status: KbsOpStatus;
  kbs_checkout_status: KbsOpStatus | null;
  kbs_delete_status: KbsOpStatus | null;
  kbs_reference_no: string | null;
  kbs_error_message: string | null;
  kbs_checkout_error_message: string | null;
  kbs_delete_error_message: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  checkout_by: string | null;
  deleted_by: string | null;
  corrected_by: string | null;
  checkout_type: CheckoutType | null;
  created_at: string;
  updated_at: string;
};

export type LodgersFilter =
  | 'active'
  | 'today_checkin'
  | 'checkout_pending'
  | 'errors'
  | 'correction'
  | 'checkout_failed'
  | 'checked_out';
