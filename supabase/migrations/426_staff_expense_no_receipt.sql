-- Harcama: fiş yok seçeneği + gerekçe (fiş fotoğrafı zorunlu değil).

ALTER TABLE public.staff_expenses
  ADD COLUMN IF NOT EXISTS no_receipt boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff_expenses
  ADD COLUMN IF NOT EXISTS no_receipt_reason text;

COMMENT ON COLUMN public.staff_expenses.no_receipt IS
  'true ise fiş fotoğrafı yüklenmemiş; no_receipt_reason zorunlu.';
COMMENT ON COLUMN public.staff_expenses.no_receipt_reason IS
  'Fiş alınmama / kaybolma gerekçesi (no_receipt=true iken).';

DROP FUNCTION IF EXISTS public.insert_my_staff_expense(uuid, date, time, numeric, text, text, text, text[]);

CREATE OR REPLACE FUNCTION public.insert_my_staff_expense(
  p_category_id uuid DEFAULT NULL,
  p_expense_date date DEFAULT NULL,
  p_expense_time time DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_receipt_image_url text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_no_receipt boolean DEFAULT false,
  p_no_receipt_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_category_id uuid;
  v_id uuid;
  v_desc text;
  v_receipt text;
  v_no_receipt boolean;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  v_desc := nullif(trim(COALESCE(p_description, '')), '');
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Harcama açıklaması zorunludur';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Geçersiz tutar';
  END IF;

  IF p_payment_type IS NULL OR p_payment_type NOT IN ('cash', 'credit_card', 'company_card') THEN
    RAISE EXCEPTION 'Geçersiz ödeme tipi';
  END IF;

  v_receipt := nullif(trim(COALESCE(p_receipt_image_url, '')), '');
  v_no_receipt := COALESCE(p_no_receipt, false);
  v_reason := nullif(trim(COALESCE(p_no_receipt_reason, '')), '');

  IF v_receipt IS NOT NULL AND v_no_receipt THEN
    RAISE EXCEPTION 'Fiş fotoğrafı ve fiş alınmadı seçeneği birlikte kullanılamaz';
  END IF;

  IF v_receipt IS NULL THEN
    IF NOT v_no_receipt THEN
      RAISE EXCEPTION 'Fiş fotoğrafı ekleyin veya «Fiş almadım» seçeneğini işaretleyin';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Fiş alınmama gerekçesini en az 10 karakter yazın';
    END IF;
  ELSE
    v_no_receipt := false;
    v_reason := NULL;
  END IF;

  v_category_id := p_category_id;
  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.expense_categories c
    WHERE c.id = v_category_id AND c.is_active = true
  ) THEN
    SELECT c.id INTO v_category_id
    FROM public.expense_categories c
    WHERE c.is_active = true AND c.name ILIKE 'Diğer'
    ORDER BY c.sort_order
    LIMIT 1;

    IF v_category_id IS NULL THEN
      SELECT c.id INTO v_category_id
      FROM public.expense_categories c
      WHERE c.is_active = true
      ORDER BY c.sort_order
      LIMIT 1;
    END IF;
  END IF;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Harcama kategorisi yapılandırılmamış';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_active, true) = true
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel kaydı bulunamadı veya hesap aktif değil';
  END IF;

  INSERT INTO public.staff_expenses (
    staff_id,
    category_id,
    expense_date,
    expense_time,
    amount,
    payment_type,
    description,
    receipt_image_url,
    tags,
    status,
    no_receipt,
    no_receipt_reason
  ) VALUES (
    v_staff_id,
    v_category_id,
    COALESCE(p_expense_date, CURRENT_DATE),
    COALESCE(p_expense_time, LOCALTIME::time),
    p_amount,
    p_payment_type,
    v_desc,
    v_receipt,
    p_tags,
    'pending',
    v_no_receipt,
    v_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.insert_my_staff_expense(uuid, date, time, numeric, text, text, text, text[], boolean, text) IS
  'Personel harcaması; fiş yoksa no_receipt + gerekçe (min 10 karakter).';

GRANT EXECUTE ON FUNCTION public.insert_my_staff_expense(uuid, date, time, numeric, text, text, text, text[], boolean, text) TO authenticated;

-- Admin bildiriminde fiş yok bilgisi
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
    e.no_receipt,
    e.no_receipt_reason,
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
        THEN ' — ' || left(trim(v_row.description), 100)
      ELSE ''
    END
    || CASE
      WHEN COALESCE(v_row.no_receipt, false) AND nullif(trim(coalesce(v_row.no_receipt_reason, '')), '') IS NOT NULL
        THEN ' · Fiş yok: ' || left(trim(v_row.no_receipt_reason), 80)
      WHEN COALESCE(v_row.no_receipt, false)
        THEN ' · Fiş yok'
      ELSE ''
    END;

  v_payload := jsonb_build_object(
    'expenseId', p_expense_id::text,
    'url', '/admin/approvals',
    'screen', 'admin_approvals',
    'notificationType', 'expense_pending_approval',
    'noReceipt', COALESCE(v_row.no_receipt, false)
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
