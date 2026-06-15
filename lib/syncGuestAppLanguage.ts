import type { LangCode } from '@/i18n';
import { resolveAppLang } from '@/lib/appLang';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { supabase } from '@/lib/supabase';

/** Misafir bildirimleri `guests.contract_lang` ile eşleşsin diye uygulama dilini DB'ye yazar. */
export async function syncGuestAppLanguage(langCode?: LangCode | string | null): Promise<void> {
  const code = resolveAppLang(langCode);
  const guest = await getOrCreateGuestForCurrentSession();
  if (!guest?.guest_id) return;
  await supabase.from('guests').update({ contract_lang: code }).eq('id', guest.guest_id);
}
