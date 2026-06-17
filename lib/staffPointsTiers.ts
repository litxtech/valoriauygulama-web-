/** Personel puan eşikleri — otel içi güven ve denetim politikası */
export const STAFF_POINTS_AUDIT_THRESHOLD = 50;
export const STAFF_POINTS_TRUST_THRESHOLD = 100;

export type StaffPointsTier = 'critical' | 'building' | 'trusted';

export type StaffPointsTierMeta = {
  tier: StaffPointsTier;
  label: string;
  headline: string;
  detail: string;
  color: string;
  bg: string;
  border: string;
  icon: 'warning' | 'trending-up' | 'shield';
  pulse?: boolean;
};

export function getStaffPointsTier(total: number): StaffPointsTier {
  if (total < STAFF_POINTS_AUDIT_THRESHOLD) return 'critical';
  if (total < STAFF_POINTS_TRUST_THRESHOLD) return 'building';
  return 'trusted';
}

export function getStaffPointsTierMeta(total: number): StaffPointsTierMeta {
  const tier = getStaffPointsTier(total);
  const gapAudit = STAFF_POINTS_AUDIT_THRESHOLD - total;
  const gapTrust = STAFF_POINTS_TRUST_THRESHOLD - total;

  if (tier === 'critical') {
    return {
      tier,
      label: 'Denetim bölgesi',
      headline: '50 puanın altındasınız',
      detail:
        gapAudit > 0
          ? `Denetim sürecine girebilirsiniz. ${gapAudit} puan daha kazanarak güvenli bölgeye çıkın.`
          : 'Puanınız denetim eşiğinin altında. Performansınız yakından izlenir.',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      icon: 'warning',
      pulse: true,
    };
  }

  if (tier === 'building') {
    return {
      tier,
      label: 'Güven inşa ediliyor',
      headline: 'İyi yoldasınız',
      detail: `${gapTrust} puan sonra otel ailesinin güvenilir üyesi statüsüne ulaşırsınız. Farklı bölümlerde çalışma değerlendirmesi için 100 puan hedeflenir.`,
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FDE68A',
      icon: 'trending-up',
    };
  }

  return {
    tier,
    label: 'Güvenilir personel',
    headline: 'Otel ailesinin güvenilir üyesi',
    detail:
      'Şirket içi ve aile içi güven kazandınız. İleride farklı bölümlerde çalışma ve yeni sorumluluklar değerlendirilebilir.',
    color: '#047857',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'shield',
  };
}

/** 0–100 yolculuk çubuğu için doluluk (görsel üst sınır 100) */
export function staffPointsJourneyPercent(total: number): number {
  return Math.min(100, Math.max(0, total));
}

export function staffPointsNextMilestone(total: number): { target: number; remaining: number; label: string } | null {
  if (total < STAFF_POINTS_AUDIT_THRESHOLD) {
    return {
      target: STAFF_POINTS_AUDIT_THRESHOLD,
      remaining: STAFF_POINTS_AUDIT_THRESHOLD - total,
      label: 'Denetim eşiği',
    };
  }
  if (total < STAFF_POINTS_TRUST_THRESHOLD) {
    return {
      target: STAFF_POINTS_TRUST_THRESHOLD,
      remaining: STAFF_POINTS_TRUST_THRESHOLD - total,
      label: 'Güvenilir personel',
    };
  }
  return null;
}
