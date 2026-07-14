export type ParsedDocument = {
  documentType: 'passport' | 'id_card' | 'residence_permit' | 'other';
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  documentNumber: string | null;
  documentSeries?: string | null;
  nationalityCode: string | null;
  issuingCountryCode: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  gender: 'M' | 'F' | 'X' | null;
  motherName?: string | null;
  fatherName?: string | null;
  placeOfBirth?: string | null;
  personalNumber?: string | null;
  maritalStatus?: 'married' | 'single' | null;
  rawMrz: string | null;
  confidence: number | null;
  checksumsValid: boolean | null;
  warnings: string[];
};

export type KbsCapturedDocumentRow = {
  id: string;
  guest_id: string;
  captured_at: string | null;
  created_at: string;
  front_image_url: string | null;
  back_image_url: string | null;
  parsed_payload: ParsedDocument | Record<string, unknown> | null;
  scan_status: string;
  ocr_engine: string | null;
  room_number: string | null;
  mrz_batch_key: string | null;
  scanned_by_user_id: string | null;
  captured_by_staff_name: string | null;
  captured_by_hotel_name: string | null;
  hotel_id: string | null;
  hotel_name: string | null;
  guest_phone_submitted: string | null;
  document_number: string | null;
  nationality_code: string | null;
  issuing_country_code: string | null;
  expiry_date: string | null;
  document_type: string | null;
};

export type KbsCopyField = {
  key: string;
  label: string;
  value: string;
};
