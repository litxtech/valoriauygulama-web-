-- Misafir check-in: ödeme şekli ve rezervasyon kanalı alanları

BEGIN;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (
    payment_method IS NULL OR payment_method IN (
      'cash', 'credit_card', 'debit_card', 'transfer', 'online'
    )
  ),
  ADD COLUMN IF NOT EXISTS reservation_channel TEXT CHECK (
    reservation_channel IS NULL OR reservation_channel IN (
      'walk_in', 'phone', 'whatsapp', 'web', 'booking_com', 'trivago',
      'airbnb', 'hotels_com', 'expedia', 'agoda', 'tatilbudur',
      'jolly', 'etstur', 'agency', 'corporate', 'social_media', 'other'
    )
  );

COMMENT ON COLUMN public.guests.payment_method IS 'Ödeme şekli: cash, credit_card, debit_card, transfer, online';
COMMENT ON COLUMN public.guests.reservation_channel IS 'Rezervasyon kanalı: walk_in, phone, whatsapp, web, booking_com, trivago, vb.';

COMMIT;
