/** Valoria mobil uygulama mağaza linkleri */
export const VALORIA_GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.valoria.hotel&pcampaignid=web_share';

const APPLE_APP_ID = '6760633347';

/** App Store — dil parametresi sözleşme / şikayet diline göre */
export function valoriaAppStoreUrl(lang?: string | null): string {
  const code = (lang || 'tr').toLowerCase().slice(0, 2);
  const l = ['tr', 'en', 'ar', 'de', 'fr', 'ru', 'es'].includes(code) ? code : 'tr';
  return `https://apps.apple.com/tr/app/valoria/id${APPLE_APP_ID}?l=${l}`;
}

export type AppStorePromoCopy = {
  badge: string;
  title: string;
  subtitle: string;
  appStore: string;
  appStoreSub: string;
  playStore: string;
  playStoreSub: string;
  getOn: string;
};

export function appStorePromoCopy(lang?: string | null): AppStorePromoCopy {
  const code = (lang || 'tr').toLowerCase().slice(0, 2);
  const map: Record<string, AppStorePromoCopy> = {
    tr: {
      badge: 'Valoria uygulaması',
      title: 'Otel deneyimini cebinize alın',
      subtitle: 'Mesajlaşma, şikayet, oda servisi ve daha fazlası — ücretsiz indirin.',
      appStore: 'App Store',
      appStoreSub: 'iPhone & iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'İndir',
    },
    en: {
      badge: 'Valoria app',
      title: 'Take the hotel experience with you',
      subtitle: 'Messaging, complaints, room service and more — download free.',
      appStore: 'App Store',
      appStoreSub: 'iPhone & iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'Get',
    },
    ar: {
      badge: 'تطبيق Valoria',
      title: 'خذ تجربة الفندق معك',
      subtitle: 'المراسلة والشكاوى وخدمة الغرف والمزيد — حمّل مجاناً.',
      appStore: 'App Store',
      appStoreSub: 'iPhone و iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'تحميل',
    },
    de: {
      badge: 'Valoria App',
      title: 'Hotel-Erlebnis in Ihrer Tasche',
      subtitle: 'Nachrichten, Anliegen, Zimmerservice und mehr — kostenlos laden.',
      appStore: 'App Store',
      appStoreSub: 'iPhone & iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'Laden',
    },
    fr: {
      badge: 'App Valoria',
      title: 'L’expérience hôtel dans votre poche',
      subtitle: 'Messages, demandes, room service et plus — téléchargez gratuitement.',
      appStore: 'App Store',
      appStoreSub: 'iPhone & iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'Obtenir',
    },
    ru: {
      badge: 'Приложение Valoria',
      title: 'Отель в вашем кармане',
      subtitle: 'Сообщения, жалобы, room service и другое — скачайте бесплатно.',
      appStore: 'App Store',
      appStoreSub: 'iPhone и iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'Скачать',
    },
    es: {
      badge: 'App Valoria',
      title: 'Lleva el hotel en el bolsillo',
      subtitle: 'Mensajes, quejas, room service y más — descarga gratis.',
      appStore: 'App Store',
      appStoreSub: 'iPhone y iPad',
      playStore: 'Google Play',
      playStoreSub: 'Android',
      getOn: 'Obtener',
    },
  };
  return map[code] ?? map.tr;
}
