/** Departman / pozisyon → kurumsal rol rozeti (emoji + kısa etiket) */
export function getFeedRoleBadge(
  department: string | null | undefined,
  position: string | null | undefined
): { emoji: string; label: string } | null {
  const raw = `${department ?? ''} ${position ?? ''}`.toLowerCase().trim();
  if (!raw) return null;

  if (/owner|sahip|kurucu|founder/.test(raw)) return { emoji: '👑', label: 'Owner' };
  if (/genel\s*müdür|general\s*manager|gm\b/.test(raw)) return { emoji: '👔', label: 'Genel Müdür' };
  if (/mutfak|chef|aşçı|sous/.test(raw)) return { emoji: '👨‍🍳', label: 'Mutfak Şefi' };
  if (/kat\s*hizmet|housekeep|temizlik|oda/.test(raw)) return { emoji: '🧹', label: 'Kat Hizmetleri' };
  if (/resepsiyon|reception|front\s*desk|lobi/.test(raw)) return { emoji: '🛎️', label: 'Resepsiyon' };
  if (/güvenlik|security/.test(raw)) return { emoji: '🛡️', label: 'Güvenlik' };
  if (/spa|wellness/.test(raw)) return { emoji: '💆', label: 'Spa' };
  if (/insan\s*kaynak|hr\b|ik\b/.test(raw)) return { emoji: '🟡', label: 'İnsan Kaynakları' };
  if (/muhasebe|accounting|finance/.test(raw)) return { emoji: '📊', label: 'Muhasebe' };
  if (/satış|sales|pazarlama|marketing/.test(raw)) return { emoji: '📣', label: 'Satış & Pazarlama' };
  if (/teknik|maintenance|bakım|engineering/.test(raw)) return { emoji: '🔧', label: 'Teknik Servis' };
  if (/admin|yönetim|management/.test(raw)) return { emoji: '👔', label: 'Yönetim' };

  const label = (position || department || '').trim();
  return label ? { emoji: '💼', label } : null;
}

export type FeedCelebrationKind = 'birthday' | 'employee_of_month' | 'promotion';

export function detectFeedCelebration(title: string | null | undefined): FeedCelebrationKind | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  if (/🎂|doğum\s*gün/i.test(t)) return 'birthday';
  if (/🏆|ayın\s*personel/i.test(t)) return 'employee_of_month';
  if (/🎉|terfi/i.test(t)) return 'promotion';
  return null;
}
