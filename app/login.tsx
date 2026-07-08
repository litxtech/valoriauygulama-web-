import { Redirect } from 'expo-router';

/** Eski /login bağlantıları ve yaygın giriş yolu → /auth */
export default function LoginRedirect() {
  return <Redirect href="/auth" />;
}
