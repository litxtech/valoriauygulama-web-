export const MANAGED_CONTRACT_TYPES = [
  { value: 'kitchen_operation', label: 'Mutfak İşletme Sözleşmesi' },
  { value: 'staff_employment', label: 'Personel Sözleşmesi' },
  { value: 'cleaning_service', label: 'Temizlik Hizmet Sözleşmesi' },
  { value: 'supplier', label: 'Tedarikçi Sözleşmesi' },
  { value: 'lease', label: 'Kira Sözleşmesi' },
  { value: 'subcontractor', label: 'Taşeron Sözleşmesi' },
  { value: 'other', label: 'Diğer' },
] as const;

export type ManagedContractType = (typeof MANAGED_CONTRACT_TYPES)[number]['value'];

export const MANAGED_CONTRACT_STATUSES = [
  { value: 'draft', label: 'Taslak', color: '#64748b', icon: 'document-outline' as const },
  { value: 'pending', label: 'Onay Bekliyor', color: '#d97706', icon: 'time-outline' as const },
  { value: 'active', label: 'Aktif', color: '#059669', icon: 'checkmark-circle-outline' as const },
  { value: 'expired', label: 'Süresi Doldu', color: '#dc2626', icon: 'calendar-outline' as const },
  { value: 'terminated', label: 'Feshedildi', color: '#7c3aed', icon: 'close-circle-outline' as const },
  { value: 'archived', label: 'Arşiv', color: '#475569', icon: 'archive-outline' as const },
] as const;

export type ManagedContractStatus = (typeof MANAGED_CONTRACT_STATUSES)[number]['value'];

export const SIGNATURE_METHODS = [
  { value: 'draw', label: 'Ekrana imza çiz' },
  { value: 'typed_name', label: 'İsim yaz' },
  { value: 'sms', label: 'SMS doğrulama' },
  { value: 'pdf_upload', label: 'PDF imzalama' },
] as const;

export type SignatureMethod = (typeof SIGNATURE_METHODS)[number]['value'];

export const DEPARTMENT_OPTIONS = [
  'mutfak',
  'resepsiyon',
  'housekeeping',
  'teknik',
  'güvenlik',
  'yönetim',
  'muhasebe',
] as const;

export function contractTypeLabel(type: string): string {
  return MANAGED_CONTRACT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function contractStatusLabel(status: string): string {
  return MANAGED_CONTRACT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function contractStatusMeta(status: string) {
  return MANAGED_CONTRACT_STATUSES.find((s) => s.value === status) ?? MANAGED_CONTRACT_STATUSES[0];
}
