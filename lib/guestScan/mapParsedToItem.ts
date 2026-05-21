import type { ParsedDocument } from '@/lib/scanner/types';
import { inferKbsPersonKind, type KbsPersonKind } from '@/lib/kbsInferPersonKind';
import type { GuestScanDocumentType, GuestScanItem, GuestScanSourceType } from '@/lib/guestScan/types';
import { validateGuestScanItem } from '@/lib/guestScan/validateGuestItem';

const CONF_WARN = 0.72;

function documentTypeFromParsed(parsed: ParsedDocument, guestType: KbsPersonKind): GuestScanDocumentType {
  if (parsed.documentType === 'passport') return 'passport';
  if (guestType === 'tc_citizen') return 'tc_id';
  return 'foreign_id';
}

function newId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mapLockPayloadToGuestItem(args: {
  sessionId: string;
  payload: {
    parsed: ParsedDocument;
    mrz: string | null;
    sourceType: GuestScanSourceType;
    rawOcr?: string[] | null;
  };
  documentSerialNo?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
}): GuestScanItem {
  const { parsed, mrz, sourceType, rawOcr } = args.payload;
  const guestType = inferKbsPersonKind(parsed);
  const docType = documentTypeFromParsed(parsed, guestType);
  const conf = parsed.confidence ?? (parsed.checksumsValid ? 0.95 : 0.7);

  const lowConfidenceFields: string[] = [];
  if ((parsed.confidence ?? 1) < CONF_WARN) lowConfidenceFields.push('documentNumber');
  if (!parsed.firstName || !parsed.lastName) lowConfidenceFields.push('name');

  const serial = args.documentSerialNo ?? parsed.documentSeries ?? null;

  const item: GuestScanItem = {
    id: newId(),
    sessionId: args.sessionId,
    guestType,
    documentType: docType,
    sourceType,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    identityNo: guestType !== 'foreign' ? parsed.documentNumber : null,
    passportNo:
      docType === 'passport' || guestType === 'foreign' ? (parsed.documentNumber ?? null) : null,
    documentSerialNo: serial,
    birthDate: parsed.birthDate,
    gender: parsed.gender,
    nationality: parsed.nationalityCode,
    country: parsed.issuingCountryCode ?? parsed.nationalityCode,
    motherName: args.motherName ?? parsed.motherName ?? null,
    fatherName: args.fatherName ?? parsed.fatherName ?? null,
    passportExpiryDate: parsed.expiryDate,
    rawMrz: mrz ?? parsed.rawMrz,
    rawOcr: rawOcr ?? null,
    confidenceScore: conf,
    validationStatus: 'needs_review',
    kbsStatus: 'pending',
    kbsErrorMessage: null,
    guestDocumentId: null,
    guestPhone: null,
    plateNumber: null,
    usageKind: 'konaklama',
    forwardDated: false,
    lowConfidenceFields,
    parsed,
  };

  const issues = validateGuestScanItem(item);
  item.validationStatus =
    issues.length === 0 ? 'valid' : issues.length >= 3 ? 'invalid' : 'needs_review';
  return item;
}
