import { Redirect } from 'expo-router';

/** Eski rota — [id] ile çakışmayı önlemek için yeni adrese yönlendir. */
export default function StaffHotelMenuThemeRedirect() {
  return <Redirect href="/staff/fnb-hub/menu-theme" />;
}
