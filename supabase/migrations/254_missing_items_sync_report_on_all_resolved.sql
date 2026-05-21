BEGIN;

-- Son acik kalem giderilince raporu otomatik kapat
CREATE OR REPLACE FUNCTION public.missing_items_sync_report_when_all_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open integer;
BEGIN
  IF NEW.report_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'resolved' AND OLD.status = 'open' THEN
    SELECT count(*)::integer
    INTO v_open
    FROM public.missing_items mi
    WHERE mi.report_id = NEW.report_id AND mi.status = 'open';

    IF v_open = 0 THEN
      UPDATE public.missing_item_reports r
      SET status = 'resolved',
          resolved_by_staff_id = COALESCE(NEW.resolved_by_staff_id, public.current_staff_id())
      WHERE r.id = NEW.report_id AND r.status = 'open';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_items_sync_report_resolved ON public.missing_items;
CREATE TRIGGER trg_missing_items_sync_report_resolved
  AFTER UPDATE OF status ON public.missing_items
  FOR EACH ROW EXECUTE FUNCTION public.missing_items_sync_report_when_all_resolved();

COMMIT;
