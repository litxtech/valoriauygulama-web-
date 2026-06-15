import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { dismissGuestWelcome, shouldShowGuestWelcome } from '@/lib/guestWelcomeCard';
import {
  fetchGuestWelcomeCardForGuest,
  guestWelcomeCardLang,
  resolveGuestWelcomeContent,
  type GuestWelcomeCardLangContent,
} from '@/lib/guestWelcomeCardContent';
import { GuestWelcomeCard } from '@/components/guest/GuestWelcomeCard';

/** Yeni misafir hesabı oluşturulduğunda bir kez karşılama kartını gösterir. */
export function GuestWelcomeGate() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [content, setContent] = useState<GuestWelcomeCardLangContent | null>(null);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      setGuestId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const guest = await getOrCreateGuestForCurrentSession();
      if (cancelled || !guest?.guest_id) return;
      const show = await shouldShowGuestWelcome(guest.guest_id);
      if (cancelled) return;
      if (show) {
        const stored = await fetchGuestWelcomeCardForGuest(guest.guest_id);
        if (cancelled) return;
        setGuestId(guest.guest_id);
        setContent(resolveGuestWelcomeContent(stored, guestWelcomeCardLang()));
        setVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const closeCard = useCallback(async () => {
    if (guestId) await dismissGuestWelcome(guestId);
    setVisible(false);
  }, [guestId]);

  const onEditProfile = useCallback(async () => {
    await closeCard();
    router.push('/customer/profile/edit');
  }, [closeCard, router]);

  if (!content) return null;

  return (
    <GuestWelcomeCard
      visible={visible}
      content={content}
      onClose={closeCard}
      onNotNow={closeCard}
      onEditProfile={onEditProfile}
    />
  );
}
