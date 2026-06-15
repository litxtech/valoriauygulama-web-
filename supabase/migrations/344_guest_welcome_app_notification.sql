-- Misafir uygulama hesabı açılışında hoş geldin bildirimi (push + in-app) bir kez gönderilir.
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS welcome_guest_notification_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.guests.welcome_guest_notification_sent_at IS
  'Misafir hesabı hoş geldin uygulama bildirimi gönderildi mi (notify-new-guest-account).';
