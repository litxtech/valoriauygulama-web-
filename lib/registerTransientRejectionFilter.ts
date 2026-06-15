import { Platform } from 'react-native';
import { log } from '@/lib/logger';
import {
  extractErrorMessage,
  isTransientSupabaseRejection,
  sanitizeSupabaseErrorMessage,
} from '@/lib/supabaseTransientErrors';

let registered = false;

function handleTransient(reason: unknown, source: string): boolean {
  if (!isTransientSupabaseRejection(reason)) return false;
  log.warn(source, sanitizeSupabaseErrorMessage(extractErrorMessage(reason)));
  return true;
}

/** RN redbox: Cloudflare 522 HTML promise rejection gürültüsünü filtrele. */
export function registerTransientRejectionFilter(): void {
  if (registered) return;
  registered = true;

  const g = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: (e: { reason?: unknown; preventDefault?: () => void }) => void) => void;
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };

  if (typeof g.addEventListener === 'function') {
    g.addEventListener('unhandledrejection', (event) => {
      if (handleTransient(event.reason, 'supabase:unhandledRejection')) {
        event.preventDefault?.();
      }
    });
  }

  if (Platform.OS !== 'web' && g.ErrorUtils?.getGlobalHandler && g.ErrorUtils?.setGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      if (handleTransient(error, 'supabase:globalHandler')) return;
      prev(error, isFatal);
    });
  }
}
