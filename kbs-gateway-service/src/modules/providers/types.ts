export type ProviderCredentials = {
  facilityCode: string;
  username: string;
  password: string;
  apiKey?: string | null;
  providerType: string;
};

export type SubmitCheckInPayload = {
  hotelId: string;
  guestDocumentId: string;
  stayAssignmentId: string;
  transactionId: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  documentNumber?: string | null;
  documentSeries?: string | null;
  nationalityCode?: string | null;
  issuingCountryCode?: string | null;
  birthDate?: string | null; // ISO yyyy-mm-dd preferred
  gender?: 'M' | 'F' | 'X' | null;
  roomNumber?: string | null;
  checkInAt?: string | null; // ISO datetime preferred
  /** Pasaport / belge bitiş (ISO date); SOAP’a yalnızca doğrulanmış alan adlarıyla eklenir. */
  documentExpiryDate?: string | null;
  usageKind?: string | null;
  kbsPersonKind?: string | null;
  plateNumber?: string | null;
  phone?: string | null;
  forwardDated?: boolean;
  fatherName?: string | null;
  motherName?: string | null;
  maritalStatus?: 'married' | 'single' | string | null;
};

export type SubmitCheckOutPayload = {
  hotelId: string;
  guestDocumentId: string;
  stayAssignmentId: string;
  transactionId: string;
  documentNumber?: string | null;
  roomNumber?: string | null;
  checkOutAt?: string | null; // ISO datetime preferred
  /** tc_citizen | ykn_foreign | foreign */
  kbsPersonKind?: string | null;
};

export type SubmitDeletePayload = {
  hotelId: string;
  guestDocumentId: string;
  transactionId: string;
  documentNumber?: string | null;
  /** tc_citizen | ykn_foreign | foreign — SOAP operasyonu seçimi */
  kbsPersonKind?: string | null;
};

export type ProviderResponse = {
  externalReference?: string;
  summary?: unknown;
};

export type ProviderTestResponse = {
  ok: boolean;
  message: string;
  details?: unknown;
  /** Railway kbs-core çıkış IPv4 (bilgi; sabit IP zorunlu değil). */
  egressIp?: string | null;
};

export interface OfficialSubmissionProvider {
  submitCheckIn(payload: SubmitCheckInPayload, credentials: ProviderCredentials): Promise<ProviderResponse>;
  submitCheckOut(payload: SubmitCheckOutPayload, credentials: ProviderCredentials): Promise<ProviderResponse>;
  submitDelete(payload: SubmitDeletePayload, credentials: ProviderCredentials): Promise<ProviderResponse>;
  submitUpdate?(payload: unknown, credentials: ProviderCredentials): Promise<ProviderResponse>;
  testConnection(credentials: ProviderCredentials): Promise<ProviderTestResponse>;
}

