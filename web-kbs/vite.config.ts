import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// valoria.tr/kbs altında yayınlanır → base '/kbs/'.
// Supabase değerleri: VITE_* yoksa mobil uygulamanın EXPO_PUBLIC_* değerlerinden okunur
// (Vercel'de zaten tanımlı olan env'ler; ayrıca eklemenize gerek yok).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  return {
    base: '/kbs/',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    server: {
      host: true,
      port: 5180,
    },
    preview: {
      host: true,
      port: 5180,
    },
  };
});
