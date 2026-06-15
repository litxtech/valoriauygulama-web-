import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '@/lib/logger';
import { supabaseResilientFetch } from '@/lib/supabaseResilientFetch';
import Constants from 'expo-constants';

type PublicExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function getPublicExtra(): PublicExtra {
  // Expo runtime can expose config in different places depending on platform/build:
  // - Constants.expoConfig (dev-client / many native runs)
  // - Constants.manifest (older)
  // - Constants.manifest2?.extra (newer updates)
  const anyConstants = Constants as unknown as {
    expoConfig?: { extra?: unknown };
    manifest?: { extra?: unknown };
    manifest2?: { extra?: unknown };
  };
  const extra =
    ((anyConstants.expoConfig?.extra ?? anyConstants.manifest?.extra ?? anyConstants.manifest2?.extra ?? {}) as Record<string, unknown>);
  const pub = (extra.public ?? {}) as Record<string, unknown>;
  return {
    supabaseUrl: typeof pub.supabaseUrl === 'string' ? pub.supabaseUrl : undefined,
    supabaseAnonKey: typeof pub.supabaseAnonKey === 'string' ? pub.supabaseAnonKey : undefined,
  };
}

const publicExtra = getPublicExtra();
const supabaseUrl = publicExtra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = publicExtra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

log.info('Supabase init', {
  hasUrl: !!supabaseUrl,
  urlPrefix: supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : 'MISSING',
  hasAnonKey: !!supabaseAnonKey,
});
if (!supabaseUrl || !supabaseAnonKey) {
  log.error('Supabase env eksik', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey });
}

export { supabaseUrl, supabaseAnonKey };
const supabaseAuthOptions = {
  storage: AsyncStorage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
} as const;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: supabaseResilientFetch,
  },
  auth: supabaseAuthOptions,
});

/** Misafir mesaj RPC — ham fetch; resilient sarmalayıcı geçici 503 üretip "sunucuya ulaşılamıyor" göstermesin. */
export const supabaseMessaging = createClient(supabaseUrl, supabaseAnonKey, {
  auth: supabaseAuthOptions,
});

export type GuestStatus = 'pending' | 'checked_in' | 'checked_out' | 'cancelled';
export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'out_of_order';
export type StaffRole = 'admin' | 'reception_chief' | 'receptionist' | 'housekeeping' | 'technical' | 'security';
