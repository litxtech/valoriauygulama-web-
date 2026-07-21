export type ParsedDocument = {
  documentType: 'passport' | 'id_card' | 'residence_permit' | 'other';
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  documentNumber: string | null;
  /** T.C. kimlik kart seri no (MRZ / OCR). */
  documentSeries?: string | null;
  nationalityCode: string | null;
  issuingCountryCode: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  gender: 'M' | 'F' | 'X' | null;
  motherName?: string | null;
  fatherName?: string | null;
  /** NFC DG11 / çip — doğum yeri */
  placeOfBirth?: string | null;
  /** MRZ opsiyonel alan / NFC identityNo — kişisel numara */
  personalNumber?: string | null;
  /** Ön yüz OCR — EVLİ / BEKAR vb. */
  maritalStatus?: 'married' | 'single' | null;
  rawMrz: string | null;
  confidence: number | null;
  checksumsValid: boolean | null;
  warnings: string[];
  /** Aynı belge no geçmişte varsa — “daha önce geldi” meta. */
  returningGuest?: {
    previousDocumentId: string;
    previousGuestId?: string | null;
    previousCapturedAt?: string | null;
    previousGuestName?: string | null;
    documentNumber?: string | null;
  };
};

export type ScanResult = {
  rawMrz: string;
  parsed: ParsedDocument;
};

export interface ScannerProvider {
  /**
   * Starts a scan session and returns a single scan result.
   * Real implementations may open a native SDK UI.
   */
  scanOnce(): Promise<ScanResult>;
}

