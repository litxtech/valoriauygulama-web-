export type StaffPersonnelWarningSeverity = 'reminder' | 'verbal' | 'written' | 'severe' | 'final';

export const STAFF_WARNING_GATE_SEVERITIES: StaffPersonnelWarningSeverity[] = [
  'verbal',
  'written',
  'severe',
  'final',
];

const SEVERITY_RANK: Record<StaffPersonnelWarningSeverity, number> = {
  reminder: 0,
  verbal: 1,
  written: 2,
  severe: 3,
  final: 4,
};

export function severityRank(s: StaffPersonnelWarningSeverity): number {
  return SEVERITY_RANK[s] ?? 0;
}

export const SEVERITY_LABEL_TR: Record<StaffPersonnelWarningSeverity, string> = {
  reminder: 'Hatırlatma',
  verbal: 'Sözlü uyarı',
  written: 'Yazılı uyarı',
  severe: 'Ciddi uyarı',
  final: 'Son uyarı',
};

export const SEVERITY_DESC_TR: Record<StaffPersonnelWarningSeverity, string> = {
  reminder: 'Bilgilendirme / hafif hatırlatma.',
  verbal: 'Kayıt altına alınan sözlü uyarı.',
  written: 'Resmi yazılı uyarı; tekrarında işlem süreci başlayabilir.',
  severe: 'Disiplin süreci kapsamında ciddi uyarı.',
  final: 'İş ilişiğinin sonlandırılması dahil yaptırımlar gündeme gelebilir.',
};

export function sortWarningsByUrgency<T extends { severity: StaffPersonnelWarningSeverity; created_at: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const dr = severityRank(b.severity) - severityRank(a.severity);
    if (dr !== 0) return dr;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function notificationTitleForSeverity(severity: StaffPersonnelWarningSeverity): string {
  switch (severity) {
    case 'reminder':
      return 'Hatırlatma (yönetim)';
    case 'verbal':
      return 'SÖZLÜ UYARI — yönetim kaydı';
    case 'written':
      return 'YAZILI UYARI — resmi kayıt';
    case 'severe':
      return 'CİDDİ UYARI — disiplin';
    case 'final':
      return 'SON UYARI — iş ilişiği riski';
    default:
      return 'Yönetim uyarısı';
  }
}
