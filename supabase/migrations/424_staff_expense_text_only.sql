-- Harcama girişi: kategori istemciden zorunlu değil; açıklama zorunlu.

CREATE OR REPLACE FUNCTION public.insert_my_staff_expense(
  p_category_id uuid DEFAULT NULL,
  p_expense_date date DEFAULT NULL,
  p_expense_time time DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_receipt_image_url text DEFAULT NULL,
  p_tags text[] DEFAULT NULL
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
    status
  ) VALUES (
    v_staff_id,
    v_category_id,
    COALESCE(p_expense_date, CURRENT_DATE),
    COALESCE(p_expense_time, LOCALTIME::time),
    p_amount,
    p_payment_type,
    v_desc,
    p_receipt_image_url,
    p_tags,
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.insert_my_staff_expense(uuid, date, time, numeric, text, text, text, text[]) IS
  'Personel harcaması; kategori boşsa Diğer; açıklama zorunlu.';

GRANT EXECUTE ON FUNCTION public.insert_my_staff_expense(uuid, date, time, numeric, text, text, text, text[]) TO authenticated;
