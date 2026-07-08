import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsPersonKind, UsageKind } from '@/lib/kbsInferPersonKind';

export type GuestScanSessionType = 'single' | 'family' | 'group';
export type GuestScanSessionStatus = 'draft' | 'ready' | 'submitted' | 'partial_error' | 'completed';
export type GuestScanSourceType = 'camera' | 'gallery' | 'nfc';
export type GuestScanDocumentType = 'tc_id' | 'foreign_id' | 'passport';
export type GuestScanValidationStatus = 'valid' | 'needs_review' | 'invalid';
export type GuestScanKbsStatus = 'pending' | 'sent' | 'failed';

export type GuestScanItem = {
  id: string;
  sessionId: string;
  guestType: KbsPersonKind;
  documentType: GuestScanDocumentType;
  sourceType: GuestScanSourceType;
  firstName: string | null;
  lastName: string | null;
  identityNo: string | null;
  passportNo: string | null;
  documentSerialNo: string | null;
  birthDate: string | null;
  gender: 'M' | 'F' | 'X' | null;
  nationality: string | null;
  country: string | null;
  motherName: string | null;
  fatherName: string | null;
  passportExpiryDate: string | null;
  rawMrz: string | null;
  rawOcr: string[] | null;
  confidenceScore: number | null;
  validationStatus: GuestScanValidationStatus;
  kbsStatus: GuestScanKbsStatus;
  kbsErrorMessage: string | null;
  guestDocumentId: string | null;
  guestPhone: string | null;
  plateNumber: string | null;
  usageKind: UsageKind;
  forwardDated: boolean;
  /** Düşük güven alanları (sarı border). */
  lowConfidenceFields: string[];
  parsed?: ParsedDocument;
};

export type GuestScanLockPayload = {
  parsed: ParsedDocument;
  mrz: string | null;
  sourceType: GuestScanSourceType;
  rawOcr?: string[] | null;
};

export type GuestScanSession = {
  id: string;
  sessionType: GuestScanSessionType;
  status: GuestScanSessionStatus;
  roomNo: string | null;
  checkinAt: string | null;
  checkoutAt: string | null;
  items: GuestScanItem[];
};

export type FieldValidationIssue = { field: string; messageKey: string };
