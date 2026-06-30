-- Banka ekstresi içe aktarım: pasif cari eşleşmesini atla, aktif cari bul/oluştur

BEGIN;

CREATE OR REPLACE FUNCTION public.finance_import_bank_statement(
  p_organization_id uuid,
  p_staff_id uuid,
  p_file_name text,
  p_file_format text,
  p_bank_code text,
  p_ledger_scope text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_batch_id uuid;
  v_line jsonb;
  v_line_id uuid;
  v_mov_id uuid;
  v_cp_id uuid;
  v_new_cp jsonb;
  v_period_start date;
  v_period_end date;
  v_movement_count int := 0;
  v_skipped_count int := 0;
  v_new_cp_count int := 0;
  v_dup_count int := 0;
  v_kind text;
  v_dedup text;
BEGIN
  IF p_ledger_scope NOT IN ('hotel', 'personal') THEN
    RAISE EXCEPTION 'invalid ledger_scope';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines array required';
  END IF;

  SELECT min((l->>'value_date')::date), max((l->>'value_date')::date)
  INTO v_period_start, v_period_end
  FROM jsonb_array_elements(p_lines) AS l;

  INSERT INTO public.finance_bank_import_batches (
    organization_id, file_name, file_format, bank_code, ledger_scope,
    period_start, period_end, line_count, created_by_staff_id
  ) VALUES (
    p_organization_id, p_file_name, COALESCE(NULLIF(p_file_format, ''), 'unknown'),
    COALESCE(NULLIF(p_bank_code, ''), 'other'), p_ledger_scope,
    v_period_start, v_period_end, jsonb_array_length(p_lines), p_staff_id
  )
  RETURNING id INTO v_batch_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_dedup := trim(COALESCE(v_line->>'dedup_key', ''));
    IF v_dedup = '' THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.finance_bank_statement_lines
      WHERE organization_id = p_organization_id AND dedup_key = v_dedup
    ) THEN
      v_dup_count := v_dup_count + 1;
      CONTINUE;
    END IF;

    IF COALESCE((v_line->>'skip')::boolean, false) THEN
      v_skipped_count := v_skipped_count + 1;
      INSERT INTO public.finance_bank_statement_lines (
        batch_id, organization_id, dedup_key, value_date, direction, amount, currency,
        description, counterparty_name_raw, counterparty_iban, counterparty_tax_id,
        bank_reference, match_method, skip_import
      ) VALUES (
        v_batch_id, p_organization_id, v_dedup,
        (v_line->>'value_date')::date,
        v_line->>'direction',
        (v_line->>'amount')::numeric,
        COALESCE(NULLIF(v_line->>'currency', ''), 'TRY'),
        COALESCE(v_line->>'description', ''),
        NULLIF(v_line->>'counterparty_name_raw', ''),
        NULLIF(v_line->>'counterparty_iban', ''),
        NULLIF(v_line->>'counterparty_tax_id', ''),
        NULLIF(v_line->>'bank_reference', ''),
        NULLIF(v_line->>'match_method', ''),
        true
      );
      CONTINUE;
    END IF;

    v_cp_id := NULLIF(v_line->>'resolved_counterparty_id', '')::uuid;
    v_new_cp := v_line->'create_counterparty';

    IF v_cp_id IS NOT NULL THEN
      SELECT c.id INTO v_cp_id
      FROM public.finance_counterparties c
      WHERE c.id = v_cp_id
        AND c.organization_id = p_organization_id
        AND c.is_active = true;
    END IF;

    IF v_cp_id IS NULL AND v_new_cp IS NOT NULL AND v_new_cp->>'name' IS NOT NULL THEN
      IF NULLIF(v_new_cp->>'iban', '') IS NOT NULL THEN
        SELECT a.counterparty_id INTO v_cp_id
        FROM public.finance_counterparty_bank_aliases a
        INNER JOIN public.finance_counterparties c
          ON c.id = a.counterparty_id AND c.is_active = true
        WHERE a.organization_id = p_organization_id
          AND a.alias_type = 'iban'
          AND a.alias_value = upper(replace(v_new_cp->>'iban', ' ', ''));
      END IF;

      IF v_cp_id IS NULL AND NULLIF(v_new_cp->>'tax_id', '') IS NOT NULL THEN
        SELECT a.counterparty_id INTO v_cp_id
        FROM public.finance_counterparty_bank_aliases a
        INNER JOIN public.finance_counterparties c
          ON c.id = a.counterparty_id AND c.is_active = true
        WHERE a.organization_id = p_organization_id
          AND a.alias_type = 'tax_id'
          AND a.alias_value = v_new_cp->>'tax_id';
      END IF;

      IF v_cp_id IS NULL AND NULLIF(v_line->>'counterparty_name_normalized', '') IS NOT NULL THEN
        SELECT a.counterparty_id INTO v_cp_id
        FROM public.finance_counterparty_bank_aliases a
        INNER JOIN public.finance_counterparties c
          ON c.id = a.counterparty_id AND c.is_active = true
        WHERE a.organization_id = p_organization_id
          AND a.alias_type = 'name_normalized'
          AND a.alias_value = v_line->>'counterparty_name_normalized';
      END IF;

      IF v_cp_id IS NULL THEN
        INSERT INTO public.finance_counterparties (
          organization_id, name, party_type, tax_id, extra_info, created_by_staff_id
        ) VALUES (
          p_organization_id,
          trim(v_new_cp->>'name'),
          COALESCE(NULLIF(v_new_cp->>'party_type', ''), 'private_person'),
          NULLIF(v_new_cp->>'tax_id', ''),
          NULLIF(v_new_cp->>'iban', ''),
          p_staff_id
        )
        RETURNING id INTO v_cp_id;
        v_new_cp_count := v_new_cp_count + 1;
      END IF;
    END IF;

    INSERT INTO public.finance_bank_statement_lines (
      batch_id, organization_id, dedup_key, value_date, direction, amount, currency,
      description, counterparty_name_raw, counterparty_iban, counterparty_tax_id,
      bank_reference, match_method, skip_import, counterparty_id
    ) VALUES (
      v_batch_id, p_organization_id, v_dedup,
      (v_line->>'value_date')::date,
      v_line->>'direction',
      (v_line->>'amount')::numeric,
      COALESCE(NULLIF(v_line->>'currency', ''), 'TRY'),
      COALESCE(v_line->>'description', ''),
      NULLIF(v_line->>'counterparty_name_raw', ''),
      NULLIF(v_line->>'counterparty_iban', ''),
      NULLIF(v_line->>'counterparty_tax_id', ''),
      NULLIF(v_line->>'bank_reference', ''),
      NULLIF(v_line->>'match_method', ''),
      false,
      v_cp_id
    )
    RETURNING id INTO v_line_id;

    IF v_cp_id IS NOT NULL THEN
      v_kind := CASE WHEN v_line->>'direction' = 'credit' THEN 'income' ELSE 'expense' END;

      INSERT INTO public.finance_movements (
        organization_id, kind, amount, currency, movement_date, payment_method,
        category, counterparty_id, description, ledger_scope,
        created_by_staff_id, bank_statement_line_id
      ) VALUES (
        p_organization_id, v_kind,
        (v_line->>'amount')::numeric,
        COALESCE(NULLIF(v_line->>'currency', ''), 'TRY'),
        (v_line->>'value_date')::date,
        'transfer',
        'bank_import',
        v_cp_id,
        COALESCE(v_line->>'description', 'Banka ekstresi'),
        p_ledger_scope,
        p_staff_id,
        v_line_id
      )
      RETURNING id INTO v_mov_id;

      UPDATE public.finance_bank_statement_lines
      SET finance_movement_id = v_mov_id
      WHERE id = v_line_id;

      v_movement_count := v_movement_count + 1;

      IF NULLIF(v_line->>'counterparty_iban', '') IS NOT NULL THEN
        INSERT INTO public.finance_counterparty_bank_aliases (
          organization_id, counterparty_id, alias_type, alias_value
        ) VALUES (
          p_organization_id, v_cp_id, 'iban',
          upper(replace(v_line->>'counterparty_iban', ' ', ''))
        )
        ON CONFLICT (organization_id, alias_type, alias_value) DO UPDATE
          SET counterparty_id = EXCLUDED.counterparty_id;
      END IF;

      IF NULLIF(v_line->>'counterparty_tax_id', '') IS NOT NULL THEN
        INSERT INTO public.finance_counterparty_bank_aliases (
          organization_id, counterparty_id, alias_type, alias_value
        ) VALUES (
          p_organization_id, v_cp_id, 'tax_id', v_line->>'counterparty_tax_id'
        )
        ON CONFLICT (organization_id, alias_type, alias_value) DO UPDATE
          SET counterparty_id = EXCLUDED.counterparty_id;
      END IF;

      IF NULLIF(v_line->>'counterparty_name_normalized', '') IS NOT NULL THEN
        INSERT INTO public.finance_counterparty_bank_aliases (
          organization_id, counterparty_id, alias_type, alias_value
        ) VALUES (
          p_organization_id, v_cp_id, 'name_normalized', v_line->>'counterparty_name_normalized'
        )
        ON CONFLICT (organization_id, alias_type, alias_value) DO UPDATE
          SET counterparty_id = EXCLUDED.counterparty_id;
      END IF;
    ELSE
      v_skipped_count := v_skipped_count + 1;
      UPDATE public.finance_bank_statement_lines SET skip_import = true WHERE id = v_line_id;
    END IF;
  END LOOP;

  UPDATE public.finance_bank_import_batches
  SET
    movement_count = v_movement_count,
    skipped_count = v_skipped_count,
    new_counterparty_count = v_new_cp_count,
    line_count = jsonb_array_length(p_lines) - v_dup_count
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'movement_count', v_movement_count,
    'skipped_count', v_skipped_count,
    'new_counterparty_count', v_new_cp_count,
    'duplicate_count', v_dup_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_import_bank_statement(uuid, uuid, text, text, text, text, jsonb) TO authenticated;

COMMIT;
