-- Harcama onayı: admin in-app bildirimi sunucuda (Edge notify-admins 522 önlenir).

CREATE OR REPLACE FUNCTION public.notify_staff_expense_pending_admins(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_title text := 'Harcama onayı bekliyor';
  v_body text;
  v_payload jsonb;
  v_admin_ids uuid[];
BEGIN
  SELECT
    e.id,
    e.amount,
    e.description,
    e.staff_id,
    s.full_name AS staff_name,
    s.organization_id
  INTO v_row
  FROM public.staff_expenses e
  JOIN public.staff s ON s.id = e.staff_id
  WHERE e.id = p_expense_id
    AND e.status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_body := coalesce(nullif(trim(v_row.staff_name), ''), 'Personel')
    || ' · '
    || round(v_row.amount, 2)::text
    || ' ₺'
    || CASE
      WHEN nullif(trim(coalesce(v_row.description, '')), '') IS NOT NULL
        THEN ' — ' || left(trim(v_row.description), 120)
      ELSE ''
    END;

  v_payload := jsonb_build_object(
    'expenseId', p_expense_id::text,
    'url', '/admin/approvals',
    'screen', 'admin_approvals',
    'notificationType', 'expense_pending_approval'
  );

  SELECT array_agg(s.id) INTO v_admin_ids
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND s.role = 'admin'
    AND (v_row.organization_id IS NULL OR s.organization_id = v_row.organization_id);

  IF v_admin_ids IS NULL OR cardinality(v_admin_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    staff_id,
    title,
    body,
    category,
    notification_type,
    data,
    sent_via,
    sent_at,
    created_by
  )
  SELECT
    aid,
    v_title,
    v_body,
    'admin',
    'expense_pending_approval',
    v_payload,
    'in_app',
    now(),
    v_row.staff_id
  FROM unnest(v_admin_ids) AS aid;
END;
$$;

COMMENT ON FUNCTION public.notify_staff_expense_pending_admins(uuid) IS
  'Bekleyen personel harcaması için admin in-app bildirim (Edge push yok).';

CREATE OR REPLACE FUNCTION public.staff_expenses_after_insert_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.notify_staff_expense_pending_admins(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'staff_expenses_after_insert_notify skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_expenses_after_insert_notify ON public.staff_expenses;
CREATE TRIGGER trg_staff_expenses_after_insert_notify
  AFTER INSERT ON public.staff_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_expenses_after_insert_notify();
