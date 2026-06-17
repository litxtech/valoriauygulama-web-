const DEPARTMENT_LABELS: Record<string, string> = {
  owner: 'Sahip',
  general_manager: 'Genel Müdür',
  manager: 'Müdür',
  supervisor: 'Sorumlu / Şef',
  housekeeping: 'Temizlik',
  technical: 'Teknik',
  receptionist: 'Resepsiyon',
  front_office: 'Ön Büro',
  security: 'Güvenlik',
  reception_chief: 'Resepsiyon Şefi',
  kitchen: 'Mutfak',
  kitchen_staff: 'Mutfak Personeli',
  chef: 'Aşçı',
  head_chef: 'Baş Aşçı',
  pastry: 'Pastane',
  restaurant: 'Restoran',
  service: 'Servis',
  bar: 'Bar',
  hr: 'İnsan Kaynakları',
  accounting: 'Muhasebe',
};

export function getDepartmentLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return DEPARTMENT_LABELS[value] ?? value.replace(/_/g, ' ');
}

export const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));
