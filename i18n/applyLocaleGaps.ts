import { arGaps } from './arGaps';
import { extras } from './extras';
import { staffLocales } from './staffLocales';
import { staffLocalesExtended } from './staffLocalesExtended';
import type { LangCode } from './languages';

type Resources = Record<string, { translation: Record<string, string> }>;

/** Eksik çeviri anahtarlarını tamamlar; modül ekstralarını birleştirir. */
export function applyLocaleGaps(resources: Resources, languages: readonly { code: LangCode }[]) {
  const tr = resources.tr?.translation;
  const en = resources.en?.translation;
  const ar = resources.ar?.translation;
  if (!tr || !en) return;

  for (const lang of languages) {
    const code = lang.code;
    const target = resources[code]?.translation;
    if (!target) continue;
    if (extras[code as keyof typeof extras]) {
      Object.assign(target, extras[code as keyof typeof extras]);
    }
    const staffPack = staffLocales[code as keyof typeof staffLocales];
    if (staffPack) {
      Object.assign(target, staffPack);
    }
    const staffExt = staffLocalesExtended[code as keyof typeof staffLocalesExtended];
    if (staffExt) {
      Object.assign(target, staffExt);
    }
  }

  if (ar) {
    const staffEn = staffLocales.en;
    for (const key of Object.keys(staffEn)) {
      if (!(key in ar) && staffLocales.ar[key as keyof typeof staffLocales.ar]) {
        ar[key] = staffLocales.ar[key as keyof typeof staffLocales.ar];
      }
    }
    for (const key of Object.keys(staffLocalesExtended.en)) {
      if (!(key in ar) && staffLocalesExtended.ar[key as keyof typeof staffLocalesExtended.ar]) {
        ar[key] = staffLocalesExtended.ar[key as keyof typeof staffLocalesExtended.ar];
      }
    }
    for (const [key, value] of Object.entries(arGaps)) {
      ar[key] = value;
    }
    for (const key of Object.keys(en)) {
      if (!(key in ar) && arGaps[key]) ar[key] = arGaps[key];
    }
    for (const key of Object.keys(tr)) {
      if (!(key in ar) && arGaps[key]) ar[key] = arGaps[key];
    }
  }

  for (const key of Object.keys(tr)) {
    if (!(key in en)) en[key] = tr[key];
  }

  for (const code of ['de', 'fr', 'ru', 'es'] as const) {
    const target = resources[code]?.translation;
    if (!target) continue;
    for (const key of Object.keys(tr)) {
      if (!(key in target)) target[key] = en[key] ?? tr[key];
    }
    const staffEnPack = staffLocales.en;
    for (const key of Object.keys(staffEnPack)) {
      if (!(key in target)) target[key] = staffEnPack[key as keyof typeof staffEnPack];
    }
    const staffExtEn = staffLocalesExtended.en;
    for (const key of Object.keys(staffExtEn)) {
      if (!(key in target)) target[key] = staffExtEn[key as keyof typeof staffExtEn];
    }
  }
}

// Yeni dil eklendiğinde çevirisi boşsa İngilizce kullanılır
export function patchSparseLocales(resources: Resources, languages: readonly { code: LangCode }[]) {
  for (const { code } of languages) {
    const res = resources[code]?.translation;
    if (res && code !== 'tr' && code !== 'en' && Object.keys(res).length < 10) {
      resources[code].translation = {
        ...(resources.en.translation as Record<string, string>),
        ...res,
      };
    }
  }
}
