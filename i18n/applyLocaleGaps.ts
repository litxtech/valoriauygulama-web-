import { arGaps } from './arGaps';
import { extras } from './extras';
import type { LangCode } from './index';

type Resources = Record<string, { translation: Record<string, string> }>;

/** Eksik çeviri anahtarlarını tamamlar; modül ekstralarını birleştirir. */
export function applyLocaleGaps(resources: Resources, languages: readonly { code: LangCode }[]) {
  const tr = resources.tr.translation;
  const en = resources.en.translation;
  const ar = resources.ar.translation;

  for (const lang of languages) {
    const code = lang.code;
    if (extras[code as keyof typeof extras]) {
      Object.assign(resources[code].translation, extras[code as keyof typeof extras]);
    }
  }

  for (const key of Object.keys(tr)) {
    if (!(key in en)) en[key] = tr[key];
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

  for (const code of ['de', 'fr', 'ru', 'es'] as const) {
    const target = resources[code]?.translation;
    if (!target) continue;
    for (const key of Object.keys(tr)) {
      if (!(key in target)) target[key] = en[key] ?? tr[key];
    }
  }
}
