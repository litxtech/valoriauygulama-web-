/** Paylaşım etiketleri — kurumsal + misafir */
export const POST_TAGS = [
  { value: 'acil', label: 'Acil' },
  { value: 'onemli', label: 'Önemli' },
  { value: 'bilgilendirme', label: 'Bilgilendirme' },
  { value: 'duyuru', label: 'Duyuru' },
  { value: 'egitim', label: 'Eğitim' },
  { value: 'ik', label: 'İnsan Kaynakları' },
  { value: 'sikayet', label: 'Şikayet' },
  { value: 'istek', label: 'İstek' },
  { value: 'oneri', label: 'Öneri' },
  { value: 'tesekkur', label: 'Teşekkür' },
  { value: 'soru', label: 'Soru' },
  { value: 'diger', label: 'Diğer' },
] as const;

export type PostTagValue = (typeof POST_TAGS)[number]['value'] | null;
