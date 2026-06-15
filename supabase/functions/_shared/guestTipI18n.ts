type Lang = 'tr' | 'en' | 'ar' | 'de' | 'fr' | 'ru' | 'es';

type Pack = {
  stripeProductTitle: (name: string) => string;
  stripeDescription: (guest: string, staff: string) => string;
  errors: Record<string, string>;
};

const PACKS: Record<Lang, Pack> = {
  tr: {
    stripeProductTitle: (n) => `Bahşiş · ${n}`,
    stripeDescription: (g, s) => `${g} → ${s} bahşişi`,
    errors: {
      UNAUTHORIZED: 'Oturum geçersiz',
      GUEST_ONLY: 'Bahşiş yalnızca misafir hesabından',
      INVALID_AMOUNT: 'Bahşiş tutarı 10–50.000 arasında olmalı',
      STAFF_BLOCKED: 'Bu personele bahşiş gönderemezsiniz',
      GUEST_NOT_FOUND: 'Misafir oturumu bulunamadı',
      STAFF_NOT_FOUND: 'Personel bulunamadı',
      HOTEL_NOT_FOUND: 'Otel bilgisi bulunamadı',
      TIPS_DISABLED: 'Bu personele bahşiş gönderilemez',
    },
  },
  en: {
    stripeProductTitle: (n) => `Tip · ${n}`,
    stripeDescription: (g, s) => `Tip from ${g} to ${s}`,
    errors: {
      UNAUTHORIZED: 'Invalid session',
      GUEST_ONLY: 'Tips can only be sent from a guest account',
      INVALID_AMOUNT: 'Tip amount must be between 10 and 50,000',
      STAFF_BLOCKED: 'You cannot tip this staff member',
      GUEST_NOT_FOUND: 'Guest session not found',
      STAFF_NOT_FOUND: 'Staff member not found',
      HOTEL_NOT_FOUND: 'Hotel information not found',
    },
  },
  ar: {
    stripeProductTitle: (n) => `بقشيش · ${n}`,
    stripeDescription: (g, s) => `بقشيش من ${g} إلى ${s}`,
    errors: {
      UNAUTHORIZED: 'جلسة غير صالحة',
      GUEST_ONLY: 'يمكن إرسال البقشيش من حساب ضيف فقط',
      INVALID_AMOUNT: 'يجب أن يكون المبلغ بين 10 و 50,000',
      STAFF_BLOCKED: 'لا يمكنك إرسال بقشيش لهذا الموظف',
      GUEST_NOT_FOUND: 'لم يُعثر على جلسة الضيف',
      STAFF_NOT_FOUND: 'لم يُعثر على الموظف',
      HOTEL_NOT_FOUND: 'لم تُعثر على معلومات الفندق',
      TIPS_DISABLED: 'لا يمكن إرسال بقشيش لهذا الموظف',
    },
  },
  de: {
    stripeProductTitle: (n) => `Trinkgeld · ${n}`,
    stripeDescription: (g, s) => `Trinkgeld von ${g} an ${s}`,
    errors: {
      UNAUTHORIZED: 'Ungültige Sitzung',
      GUEST_ONLY: 'Trinkgeld nur vom Gästekonto',
      INVALID_AMOUNT: 'Betrag muss zwischen 10 und 50.000 liegen',
      STAFF_BLOCKED: 'An dieses Personal kein Trinkgeld möglich',
      GUEST_NOT_FOUND: 'Gästesitzung nicht gefunden',
      STAFF_NOT_FOUND: 'Personal nicht gefunden',
      HOTEL_NOT_FOUND: 'Hotelinformation nicht gefunden',
      TIPS_DISABLED: 'Trinkgeld für dieses Personal deaktiviert',
    },
  },
  fr: {
    stripeProductTitle: (n) => `Pourboire · ${n}`,
    stripeDescription: (g, s) => `Pourboire de ${g} à ${s}`,
    errors: {
      UNAUTHORIZED: 'Session invalide',
      GUEST_ONLY: 'Pourboire réservé au compte client',
      INVALID_AMOUNT: 'Montant entre 10 et 50 000 requis',
      STAFF_BLOCKED: 'Pourboire impossible pour ce personnel',
      GUEST_NOT_FOUND: 'Session client introuvable',
      STAFF_NOT_FOUND: 'Personnel introuvable',
      HOTEL_NOT_FOUND: 'Informations hôtel introuvables',
    },
  },
  ru: {
    stripeProductTitle: (n) => `Чаевые · ${n}`,
    stripeDescription: (g, s) => `Чаевые от ${g} для ${s}`,
    errors: {
      UNAUTHORIZED: 'Недействительная сессия',
      GUEST_ONLY: 'Чаевые только с гостевого аккаунта',
      INVALID_AMOUNT: 'Сумма от 10 до 50 000',
      STAFF_BLOCKED: 'Нельзя отправить чаевые этому сотруднику',
      GUEST_NOT_FOUND: 'Гостевая сессия не найдена',
      STAFF_NOT_FOUND: 'Сотрудник не найден',
      HOTEL_NOT_FOUND: 'Информация об отеле не найдена',
      TIPS_DISABLED: 'Чаевые для этого сотрудника отключены',
    },
  },
  es: {
    stripeProductTitle: (n) => `Propina · ${n}`,
    stripeDescription: (g, s) => `Propina de ${g} a ${s}`,
    errors: {
      UNAUTHORIZED: 'Sesión no válida',
      GUEST_ONLY: 'Propina solo desde cuenta de huésped',
      INVALID_AMOUNT: 'Importe entre 10 y 50.000',
      STAFF_BLOCKED: 'No puede dar propina a este empleado',
      GUEST_NOT_FOUND: 'Sesión de huésped no encontrada',
      STAFF_NOT_FOUND: 'Empleado no encontrado',
      HOTEL_NOT_FOUND: 'Información del hotel no encontrada',
      TIPS_DISABLED: 'Las propinas no están habilitadas para este empleado',
    },
  },
};

export function parseGuestTipLang(raw: string | undefined | null): Lang {
  const l = (raw ?? 'tr').toLowerCase().split('-')[0];
  if (l === 'en' || l === 'ar' || l === 'de' || l === 'fr' || l === 'ru' || l === 'es') return l;
  return 'tr';
}

export function stripeLocaleForLang(lang: Lang): string {
  const map: Record<Lang, string> = {
    tr: 'tr',
    en: 'en',
    ar: 'auto',
    de: 'de',
    fr: 'fr',
    ru: 'ru',
    es: 'es',
  };
  return map[lang] ?? 'auto';
}

export function guestTipPack(lang: Lang): Pack {
  return PACKS[lang] ?? PACKS.tr;
}

export function guestTipError(lang: Lang, code: string, fallback?: string): { error: string; error_code: string } {
  const pack = guestTipPack(lang);
  return {
    error: pack.errors[code] ?? fallback ?? pack.errors.UNAUTHORIZED ?? 'Error',
    error_code: code,
  };
}
