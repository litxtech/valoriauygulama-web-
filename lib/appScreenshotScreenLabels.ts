/** pathname → admin raporunda görünen ekran adı */
export function screenLabelFromPathname(pathname: string | null | undefined): string {
  const p = (pathname ?? '').replace(/\/+$/, '') || '/';
  if (p.includes('/staff/chat/')) return 'Personel sohbet';
  if (p.includes('/admin/messages/chat/')) return 'Admin sohbet';
  if (p.includes('/customer/chat/')) return 'Misafir sohbet';
  if (p.startsWith('/staff/(tabs)/tasks') || p.startsWith('/staff/tasks')) return 'Görevler';
  if (p.startsWith('/staff/tips')) return 'Bahşişler';
  if (p.startsWith('/staff/feed')) return 'Personel akış';
  if (p.startsWith('/staff/profile')) return 'Personel profil';
  if (p.startsWith('/staff/cameras')) return 'Canlı kameralar';
  if (p.startsWith('/staff/kbs')) return 'KBS / kimlik';
  if (p.startsWith('/staff/occupancy')) return 'Doluluk';
  if (p.startsWith('/staff/(tabs)')) return 'Personel ana menü';
  if (p.startsWith('/staff')) return 'Personel uygulaması';
  if (p.startsWith('/customer/(tabs)/messages') || p.startsWith('/customer/messages')) return 'Misafir mesajlar';
  if (p.startsWith('/customer/tips')) return 'Misafir bahşişler';
  if (p.startsWith('/customer/complaints')) return 'Misafir şikayet';
  if (p.startsWith('/customer/(tabs)')) return 'Misafir ana menü';
  if (p.startsWith('/customer')) return 'Misafir uygulaması';
  if (p.startsWith('/admin/messages')) return 'Admin mesajlar';
  if (p.startsWith('/admin/guests')) return 'Admin misafirler';
  if (p.startsWith('/admin/staff')) return 'Admin personel';
  if (p.startsWith('/admin/tasks')) return 'Admin görevler';
  if (p.startsWith('/admin/tips')) return 'Admin bahşişler';
  if (p.startsWith('/admin')) return 'Yönetim paneli';
  if (p.startsWith('/guest')) return 'Misafir kayıt / sözleşme';
  return 'Uygulama';
}
