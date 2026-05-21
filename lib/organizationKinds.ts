export type OrganizationKind = 'hotel' | 'tour_office' | 'construction' | 'office' | 'general';

export const ORGANIZATION_KIND_LABELS: Record<OrganizationKind, string> = {
  hotel: 'Otel',
  tour_office: 'Tur / Ofis',
  construction: 'İnşaat',
  office: 'Ofis',
  general: 'Genel işletme',
};

export const ORGANIZATION_KINDS: OrganizationKind[] = [
  'hotel',
  'construction',
  'office',
  'tour_office',
  'general',
];

export function organizationKindLabel(kind: string | null | undefined): string {
  if (kind && kind in ORGANIZATION_KIND_LABELS) {
    return ORGANIZATION_KIND_LABELS[kind as OrganizationKind];
  }
  return kind?.trim() || 'İşletme';
}
