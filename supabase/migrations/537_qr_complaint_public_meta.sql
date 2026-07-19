BEGIN;

-- QR şikayet public sayfa sorumlusu / notlar (app_settings)
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'qr_complaint_public_meta',
  jsonb_build_object(
    'staff_id', null,
    'title', 'Valoria Hotel & Bavulsuite Sorumlusu',
    'brands', 'Valoria Hotel · Bavulsuite',
    'note', 'Anlık şikayet değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir — giriş yapmanız gerekmez.',
    'name_override', null,
    'photo_override', null
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
