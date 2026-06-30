import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export const DOC_HUB_TAGLINE =
  'Ruhsat, sözleşme, sigorta ve operasyon belgelerini tek yerde saklayın; süre ve onay takibini kaçırmayın.';

export type DocCountKey = 'pendingApprovals' | 'expiringSoon' | 'expired' | 'totalActive' | 'archived';

export type DocHubItem = {
  key: string;
  suffix: string;
  icon: IconName;
  title: string;
  description: string;
  countKey?: DocCountKey;
  accent?: 'amber' | 'rose' | 'slate' | 'teal' | 'indigo';
};

export type DocHubSection = {
  id: string;
  title: string;
  subtitle: string;
  items: DocHubItem[];
};

export const DOC_HUB_SECTIONS: DocHubSection[] = [
  {
    id: 'action',
    title: 'İşlem gerektiren',
    subtitle: 'Onay veya süre nedeniyle müdahale gereken belgeler',
    items: [
      {
        key: 'pending',
        suffix: 'pending',
        icon: 'hourglass-outline',
        title: 'Onay bekleyenler',
        description: 'Yüklendi, yönetici onayı bekliyor. İnceleyip onaylayın veya reddedin.',
        countKey: 'pendingApprovals',
        accent: 'amber',
      },
      {
        key: 'expiring',
        suffix: 'expiring',
        icon: 'calendar-outline',
        title: 'Süresi yaklaşanlar',
        description: 'Önümüzdeki 30 gün içinde sona erecek belgeler (yenileme planı).',
        countKey: 'expiringSoon',
        accent: 'rose',
      },
      {
        key: 'expired',
        suffix: 'expired',
        icon: 'warning-outline',
        title: 'Süresi dolanlar',
        description: 'Geçerlilik tarihi geçmiş; güncelleme veya arşivleme gerekir.',
        countKey: 'expired',
        accent: 'rose',
      },
    ],
  },
  {
    id: 'library',
    title: 'Belge arşivi',
    subtitle: 'Tüm kayıtlar ve arşivlenmiş belgeler',
    items: [
      {
        key: 'all',
        suffix: 'all',
        icon: 'folder-open-outline',
        title: 'Tüm belgeler',
        description: 'Aktif belgelerin tam listesi; arama, önizleme ve detay.',
        countKey: 'totalActive',
        accent: 'indigo',
      },
      {
        key: 'archive',
        suffix: 'archive',
        icon: 'archive-outline',
        title: 'Arşiv',
        description: 'Kullanımdan kalkan belgeler; gerektiğinde geri alınabilir.',
        countKey: 'archived',
        accent: 'slate',
      },
    ],
  },
  {
    id: 'setup',
    title: 'Kurulum',
    subtitle: 'Kategori yapısı ve modül tercihleri',
    items: [
      {
        key: 'categories',
        suffix: 'categories',
        icon: 'pricetags-outline',
        title: 'Kategoriler',
        description: 'Belge türlerini gruplayın; hangi kategoriler onay gerektirir belirleyin.',
        accent: 'teal',
      },
      {
        key: 'settings',
        suffix: 'settings',
        icon: 'options-outline',
        title: 'Ayarlar',
        description: 'Dosya türleri, onay kuralları ve bildirim tercihleri (yakında).',
        accent: 'slate',
      },
    ],
  },
  {
    id: 'audit',
    title: 'Denetim',
    subtitle: 'Kim, ne zaman, ne yaptı',
    items: [
      {
        key: 'logs',
        suffix: 'logs',
        icon: 'reader-outline',
        title: 'İşlem geçmişi',
        description: 'Yükleme, onay, arşivleme ve düzenleme kayıtları.',
        accent: 'slate',
      },
    ],
  },
];

export const DOC_SCREEN_INTROS: Record<
  string,
  { icon: IconName; title: string; description: string; tip?: string }
> = {
  all: {
    icon: 'folder-open-outline',
    title: 'Tüm belgeler',
    description: 'Aktif (arşivlenmemiş) belgeler burada listelenir. Satıra dokunarak detay ve dosyayı açın.',
  },
  pending: {
    icon: 'hourglass-outline',
    title: 'Onay bekleyenler',
    description: 'Personel veya sizin yüklediğiniz belgeler onay sürecindeyse burada görünür.',
    tip: 'Yeşil onay düğmesi belgeyi aktif hale getirir.',
  },
  expiring: {
    icon: 'calendar-outline',
    title: 'Süresi yaklaşanlar',
    description: 'Son geçerlilik tarihi bugünden itibaren 30 gün içinde olan belgeler.',
    tip: 'Yenileme öncesi bu listeden takip edin.',
  },
  expired: {
    icon: 'warning-outline',
    title: 'Süresi dolanlar',
    description: 'Geçerlilik tarihi geçmiş belgeler. Güncel sürüm yükleyin veya arşivleyin.',
  },
  archive: {
    icon: 'archive-outline',
    title: 'Arşiv',
    description: 'Arşivlenmiş belgeler günlük listede görünmez; buradan geri alabilirsiniz.',
  },
  categories: {
    icon: 'pricetags-outline',
    title: 'Kategoriler',
    description: 'Ruhsat, sözleşme, sigorta gibi gruplar oluşturun. Onay zorunlu kategoriler yüklemede onaya düşer.',
  },
  logs: {
    icon: 'reader-outline',
    title: 'İşlem geçmişi',
    description: 'Belge üzerinde yapılan işlemlerin denetim kaydı (yükleme, onay, arşiv vb.).',
  },
  settings: {
    icon: 'options-outline',
    title: 'Modül ayarları',
    description: 'Gelişmiş onay kuralları ve bildirim kanalları bu ekrandan yönetilecek.',
  },
};
