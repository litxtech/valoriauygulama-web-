-- Toplu temizlik onayı: kontrol listesi + oda başına bildirim kapatma
BEGIN;

ALTER TABLE public.room_cleaning_plan_assignments
  ADD COLUMN IF NOT EXISTS completion_checklist JSONB;

COMMENT ON COLUMN public.room_cleaning_plan_assignments.completion_checklist IS
  'Personel toplu tamamlama onayında işaretlediği kontrol listesi (priz, banyo, tavan vb.)';

-- Oda oda push/bildirim tetikleyicisini kaldır (toplu onay uygulama katmanından tek bildirim)
DROP TRIGGER IF EXISTS trg_room_cleaning_notify_status ON public.room_cleaning_plan_rooms;

COMMIT;
