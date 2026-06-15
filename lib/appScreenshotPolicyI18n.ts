import i18n from '@/i18n';

const TR = {
  screenshotProhibitedTitle: 'Ekran görüntüsü yasaktır',
  screenshotProhibitedBody:
    'Gizlilik ve güvenlik nedeniyle bu uygulamada ekran görüntüsü almak yasaktır. Bu işlem kayıt altına alınmış ve yönetime bildirilmiştir.',
  screenshotProhibitedOk: 'Tamam',
  screenshotAdminTitle: 'Ekran görüntüsü uyarısı',
  screenshotAdminBody: '{{who}} · {{screen}}{{detail}}',
  screenshotAdminDetailChat: ' · Sohbet: {{name}}',
  screenshotActorStaff: 'Personel',
  screenshotActorGuest: 'Misafir',
  screenshotActorAdmin: 'Yönetici',
  screenshotActorUnknown: 'Kullanıcı',
};

const EN: typeof TR = {
  screenshotProhibitedTitle: 'Screenshots are not allowed',
  screenshotProhibitedBody:
    'For privacy and security, screenshots are prohibited in this app. This action has been logged and reported to management.',
  screenshotProhibitedOk: 'OK',
  screenshotAdminTitle: 'Screenshot alert',
  screenshotAdminBody: '{{who}} · {{screen}}{{detail}}',
  screenshotAdminDetailChat: ' · Chat: {{name}}',
  screenshotActorStaff: 'Staff',
  screenshotActorGuest: 'Guest',
  screenshotActorAdmin: 'Admin',
  screenshotActorUnknown: 'User',
};

const MAP: Record<string, typeof TR> = { tr: TR, en: EN };

function lang(): string {
  return (i18n.language || 'tr').split('-')[0].toLowerCase();
}

export function screenshotPolicyText(key: keyof typeof TR, vars?: Record<string, string>): string {
  const pack = MAP[lang()] ?? TR;
  let s: string = pack[key] ?? TR[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
  }
  return s;
}
