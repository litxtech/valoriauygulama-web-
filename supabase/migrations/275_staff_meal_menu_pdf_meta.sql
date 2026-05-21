-- Aylık yemek listesi PDF: onaylayan adı ve kurumsal alt not (admin düzenleyebilir)

BEGIN;

ALTER TABLE public.staff_meal_menus
  ADD COLUMN IF NOT EXISTS pdf_approver_name text NOT NULL DEFAULT 'Soner Toprak',
  ADD COLUMN IF NOT EXISTS pdf_footer_note text NOT NULL DEFAULT
    'Otel kuralları gereği yemek listesi eksiksiz uygulanacaktır. Her yemekten örnek alınıp 1 hafta buzdolabında muhafaza edilecektir.';

COMMENT ON COLUMN public.staff_meal_menus.pdf_approver_name IS 'PDF altında görünen onaylayan adı';
COMMENT ON COLUMN public.staff_meal_menus.pdf_footer_note IS 'PDF alt kurumsal notu';

COMMIT;
