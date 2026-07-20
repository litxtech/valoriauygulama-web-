-- Misafir defteri: yazarın silmesi için delete_token

BEGIN;

ALTER TABLE public.kitchen_menu_guest_comments
  ADD COLUMN IF NOT EXISTS delete_token text;

CREATE INDEX IF NOT EXISTS kitchen_menu_guest_comments_delete_token_idx
  ON public.kitchen_menu_guest_comments (id, delete_token)
  WHERE delete_token IS NOT NULL AND status = 'published';

COMMENT ON COLUMN public.kitchen_menu_guest_comments.delete_token IS
  'Yorumu yazanın istemci tarafında sakladığı silme anahtarı (anon).';

COMMIT;
