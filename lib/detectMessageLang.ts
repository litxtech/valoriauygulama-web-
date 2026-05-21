/** Mesaj metninden olası kaynak dili (heuristic). null = belirsiz. */
const ARABIC = /[\u0600-\u06FF\u0750-\u077F]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const TURKISH_CHARS = /[ğüşıöçĞÜŞİÖÇ]/;

const TR_HINT =
  /\b(merhaba|teşekkür|tesekkur|teşekkürler|evet|hayır|hayir|lütfen|lutfen|oda|giriş|giris|çıkış|cikis|yardım|yardim|tamam|nasıl|nasil|için|icin|günaydın|gunaydin|iyi|akşam|aksam|gece|sabah|hoşgeldiniz|hosgeldiniz|rica|ederim|ediyorum|olur|musunuz|müsait|misiniz|bir|değil|degil|var|yok)\b/i;
const EN_HINT =
  /\b(the|hello|hi|thanks|thank|please|room|check|yes|no|help|good|morning|evening|night|would|could|have|your|our|you|are|is)\b/i;
const DE_HINT = /\b(und|der|die|das|ist|nicht|bitte|danke|zimmer|guten|morgen|haben)\b/i;
const FR_HINT = /\b(bonjour|merci|oui|non|chambre|vous|nous|pour|avec|est|une|des)\b/i;
const ES_HINT = /\b(hola|gracias|por favor|habitación|habitacion|sí|si|no|buenos|días|dias)\b/i;
const RU_HINT = /[а-яёА-ЯЁ]{3,}/;

function scoreHints(text: string, re: RegExp): number {
  const m = text.match(new RegExp(re.source, re.flags + 'g'));
  return m?.length ?? 0;
}

export function detectMessageLang(text: string): string | null {
  const t = text.trim();
  if (t.length < 2) return null;

  if (ARABIC.test(t)) return 'ar';
  if (CYRILLIC.test(t) || RU_HINT.test(t)) return 'ru';
  if (TURKISH_CHARS.test(t)) return 'tr';

  const scores: Record<string, number> = {
    tr: scoreHints(t, TR_HINT),
    en: scoreHints(t, EN_HINT),
    de: scoreHints(t, DE_HINT),
    fr: scoreHints(t, FR_HINT),
    es: scoreHints(t, ES_HINT),
  };

  if (/[äöüßÄÖÜ]/.test(t)) scores.de += 2;
  if (/[àâæçéèêëîïôùûüœ]/i.test(t)) scores.fr += 2;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 1) {
    if (/^[a-zA-Z0-9\s.,!?'"\-@#$%&*():;+/=\[\]{}<>~`]+$/.test(t)) return 'en';
    return null;
  }
  const [lang, top] = best;
  const second = Object.entries(scores)
    .filter(([k]) => k !== lang)
    .sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0;
  if (top > 0 && top >= second + 1) return lang;
  if (top > 0 && second === 0) return lang;
  return null;
}

export function isSameLanguageMessage(text: string, targetLang: string): boolean {
  const detected = detectMessageLang(text);
  return detected !== null && detected === targetLang;
}
