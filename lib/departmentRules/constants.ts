export const DEPARTMENT_RULE_DEPARTMENTS = [
  { value: 'all_hotel', label: 'Tüm Otel' },
  { value: 'reception', label: 'Resepsiyon' },
  { value: 'kitchen', label: 'Mutfak' },
  { value: 'housekeeping', label: 'Kat Hizmetleri' },
  { value: 'technical', label: 'Teknik Servis' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'accounting', label: 'Muhasebe' },
  { value: 'management', label: 'Yönetim' },
  { value: 'warehouse', label: 'Depo / Stok' },
  { value: 'restaurant', label: 'Restoran' },
  { value: 'outdoor', label: 'Bahçe / Dış Alan' },
  { value: 'other', label: 'Diğer' },
] as const;

export type DepartmentRuleDepartment = (typeof DEPARTMENT_RULE_DEPARTMENTS)[number]['value'];

export const DEPARTMENT_RULE_TYPES = [
  { value: 'general', label: 'Genel Kural' },
  { value: 'daily_instruction', label: 'Günlük Talimat' },
  { value: 'opening', label: 'Açılış Talimatı' },
  { value: 'closing', label: 'Kapanış Talimatı' },
  { value: 'cleaning_procedure', label: 'Temizlik Prosedürü' },
  { value: 'emergency', label: 'Acil Durum Talimatı' },
  { value: 'hygiene', label: 'Hijyen Kuralı' },
  { value: 'security', label: 'Güvenlik Talimatı' },
  { value: 'guest_relations', label: 'Misafir İlişkileri Kuralı' },
  { value: 'discipline', label: 'Personel Disiplin Kuralı' },
  { value: 'stock_usage', label: 'Stok Kullanım Kuralı' },
  { value: 'kitchen_operation', label: 'Mutfak İşleyiş Kuralı' },
  { value: 'other', label: 'Diğer' },
] as const;

export type DepartmentRuleType = (typeof DEPARTMENT_RULE_TYPES)[number]['value'];

export const DEPARTMENT_RULE_STATUSES = [
  { value: 'draft', label: 'Taslak', color: '#64748b', icon: 'document-outline' as const },
  { value: 'published', label: 'Yayında', color: '#059669', icon: 'checkmark-circle-outline' as const },
  { value: 'scheduled', label: 'Planlandı', color: '#2563eb', icon: 'calendar-outline' as const },
  { value: 'expired', label: 'Süresi Doldu', color: '#dc2626', icon: 'time-outline' as const },
  { value: 'archived', label: 'Arşivlendi', color: '#475569', icon: 'archive-outline' as const },
  { value: 'cancelled', label: 'İptal Edildi', color: '#7c3aed', icon: 'close-circle-outline' as const },
] as const;

export type DepartmentRuleStatus = (typeof DEPARTMENT_RULE_STATUSES)[number]['value'];

export const PUBLISH_SCOPES = [
  { value: 'all', label: 'Tüm personele gönder' },
  { value: 'departments', label: 'Belirli departmana gönder' },
  { value: 'staff', label: 'Sadece belirli personele gönder' },
] as const;

export type PublishScope = (typeof PUBLISH_SCOPES)[number]['value'];

export const STAFF_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'receptionist', label: 'Resepsiyonist' },
  { value: 'housekeeping', label: 'Kat Hizmetleri' },
  { value: 'kitchen', label: 'Mutfak' },
  { value: 'technical', label: 'Teknik' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'other', label: 'Diğer' },
] as const;

export function departmentLabel(dept: string): string {
  return DEPARTMENT_RULE_DEPARTMENTS.find((d) => d.value === dept)?.label ?? dept;
}

export function ruleTypeLabel(type: string): string {
  return DEPARTMENT_RULE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function ruleStatusLabel(status: string): string {
  return DEPARTMENT_RULE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function ruleStatusMeta(status: string) {
  return DEPARTMENT_RULE_STATUSES.find((s) => s.value === status) ?? DEPARTMENT_RULE_STATUSES[0];
}
