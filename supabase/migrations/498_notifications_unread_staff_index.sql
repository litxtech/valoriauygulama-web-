-- Fix: "canceling statement due to statement timeout" (SQLSTATE 57014)
-- on the unread-notifications count/list query coming from PostgREST:
--   SELECT ... FROM public.notifications
--   WHERE staff_id = $1 AND read_at IS NULL
--
-- The only matching index was idx_notifications_staff (staff_id only), so a
-- staff member with many notifications forces Postgres to read every row for
-- that staff_id just to filter/count the unread ones. A partial index on
-- staff_id WHERE read_at IS NULL keeps only the unread rows, which is exactly
-- what the badge / unread list query needs and stays tiny over time.

CREATE INDEX IF NOT EXISTS idx_notifications_staff_unread
  ON public.notifications (staff_id)
  WHERE read_at IS NULL;

-- Same pattern is used for guests (see get_guest_notification_summary in
-- 198_guest_notification_summary_and_mark_all.sql), so give it a matching
-- partial index to keep the unread badge fast there too.
CREATE INDEX IF NOT EXISTS idx_notifications_guest_unread
  ON public.notifications (guest_id)
  WHERE read_at IS NULL;
