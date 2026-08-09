import { Linking, Alert, Platform } from 'react-native';

/** Sadece rakamlar (ülke kodu dahil); wa.me ve tel: için */
export function phoneDigits(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function whatsappUrlFromPhone(phone: string): string | null {
  const d = phoneDigits(phone);
  if (d.length < 10) return null;
  return `https://wa.me/${d}`;
}

export function telUrlFromPhone(phone: string): string {
  const d = phoneDigits(phone);
  return d ? `tel:${d}` : `tel:${phone.trim()}`;
}

export function mailtoUrl(email: string): string {
  return `mailto:${email.trim()}`;
}

export async function openWhatsApp(phone: string, message?: string): Promise<void> {
  const base = whatsappUrlFromPhone(phone);
  if (!base) {
    Alert.alert('WhatsApp', 'Geçerli bir telefon numarası bulunamadı.');
    return;
  }
  const url = message?.trim()
    ? `${base}?text=${encodeURIComponent(message.trim())}`
    : base;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const ok = await Linking.canOpenURL(url).catch(() => false);
  if (!ok) {
    Alert.alert('WhatsApp', 'Bu cihazda WhatsApp açılamadı.');
    return;
  }
  await Linking.openURL(url);
}

export async function openTel(phone: string): Promise<void> {
  const url = telUrlFromPhone(phone);
  await Linking.openURL(url);
}

export async function openMailto(email: string): Promise<void> {
  const e = email.trim();
  if (!e) {
    Alert.alert('E-posta', 'Adres yok.');
    return;
  }
  await Linking.openURL(mailtoUrl(e));
}
