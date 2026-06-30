-- Banka ekstresi içe aktarma: MT940 / CSV → kişi ödemeleri (finance_movements)

BEGIN;

-- ---------- Banka hesapları ----------
CREATE TABLE IF NOT EXISTS public.finance_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bank_code text NOT NULL DEFAULT 'other',
  label text NOT NULL,
  iban text,
  currency text NOT NULL DEFAULT 'TRY',
  ledger_scope text NOT NULL DEFAULT 'personal'
    CHECK (ledger_scope IN ('hotel', 'personal')),
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_bank_accounts_label_not_blank CHECK (length(trim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_bank_accounts_org
  ON public.finance_bank_accounts (organization_id, is_active);

-- ---------- İçe aktarma partileri ----------
CREATE TABLE IF NOT EXISTS public.finance_bank_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_format text NOT NULL DEFAULT 'unknown'
    CHECK (file_format IN ('mt940', 'csv', 'unknown')),
  bank_code text NOT NULL DEFAULT 'other',
  ledger_scope text NOT NULL DEFAULT 'personal'
    CHECK (ledger_scope IN ('hotel', 'personal')),
  status text NOT NULL DEFAULT 'committed'
    CHECK (status IN ('committed', 'failed')),
  period_start date,
  period_end date,
  line_count int NOT NULL DEFAULT 0,
  movement_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  new_counterparty_count int NOT NULL DEFAULT 0,
  error_message text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_bank_import_batches_org
  ON public.finance_bank_import_batches (organization_id, committed_at DESC);

-- ---------- Parse edilmiş ekstre satırları ----------
CREATE TABLE IF NOT EXISTS public.finance_bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.finance_bank_import_batches(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  dedup_key text NOT NULL,
  value_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY',
  description text NOT NULL DEFAULT '',
  counterparty_name_raw text,
  counterparty_iban text,
  counterparty_tax_id text,
  bank_reference text,
  match_method text,
  skip_import boolean NOT NULL DEFAULT false,
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  finance_movement_id uuid REFERENCES public.finance_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_bank_statement_lines_dedup UNIQUE (organization_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_bank_statement_lines_batch
  ON public.finance_bank_statement_lines (batch_id);
CREATE INDEX IF NOT EXISTS idx_finance_bank_statement_lines_cp
  ON public.finance_bank_statement_lines (counterparty_id)
  WHERE counterparty_id IS NOT NULL;

-- ---------- IBAN / TCKN / isim eşleşme hafızası ----------
CREATE TABLE IF NOT EXISTS public.finance_counterparty_bank_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL REFERENCES public.finance_counterparties(id) ON DELETE CASCADE,
  alias_type text NOT NULL CHECK (alias_type IN ('iban', 'tax_id', 'name_normalized')),
  alias_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_counterparty_bank_aliases_unique UNIQUE (organization_id, alias_type, alias_value)
);

CREATE INDEX IF NOT EXISTS idx_finance_counterparty_bank_aliases_cp
  ON public.finance_counterparty_bank_aliases (counterparty_id);

-- ---------- Hareket → ekstre satırı ----------
ALTER TABLE public.finance_movements
  ADD COLUMN IF NOT EXISTS bank_statement_line_id uuid
    REFERENCES public.finance_bank_statement_lines(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_movements_bank_statement_line
  ON public.finance_movements (bank_statement_line_id)
  WHERE bank_statement_line_id IS NOT NULL;

-- ---------- updated_at ----------
DROP TRIGGER IF EXISTS trg_finance_bank_accounts_updated ON public.finance_bank_accounts;
CREATE TRIGGER trg_finance_bank_accounts_updated
  BEFORE UPDATE ON public.finance_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.finance_ledger_touch_updated_at();

-- ---------- RLS ----------
ALTER TABLE public.finance_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counterparty_bank_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_bank_accounts_select" ON public.finance_bank_accounts;
CREATE POLICY "finance_bank_accounts_select" ON public.finance_bank_accounts
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_accounts_insert" ON public.finance_bank_accounts;
CREATE POLICY "finance_bank_accounts_insert" ON public.finance_bank_accounts
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_accounts_update" ON public.finance_bank_accounts;
CREATE POLICY "finance_bank_accounts_update" ON public.finance_bank_accounts
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_accounts_delete" ON public.finance_bank_accounts;
CREATE POLICY "finance_bank_accounts_delete" ON public.finance_bank_accounts
  FOR DELETE TO authenticated USING (public.staff_is_admin_active());

DROP POLICY IF EXISTS "finance_bank_import_batches_select" ON public.finance_bank_import_batches;
CREATE POLICY "finance_bank_import_batches_select" ON public.finance_bank_import_batches
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_import_batches_insert" ON public.finance_bank_import_batches;
CREATE POLICY "finance_bank_import_batches_insert" ON public.finance_bank_import_batches
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_statement_lines_select" ON public.finance_bank_statement_lines;
CREATE POLICY "finance_bank_statement_lines_select" ON public.finance_bank_statement_lines
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_bank_statement_lines_insert" ON public.finance_bank_statement_lines;
CREATE POLICY "finance_bank_statement_lines_insert" ON public.finance_bank_statement_lines
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparty_bank_aliases_select" ON public.finance_counterparty_bank_aliases;
CREATE POLICY "finance_counterparty_bank_aliases_select" ON public.finance_counterparty_bank_aliases
  FOR SELECT TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparty_bank_aliases_insert" ON public.finance_counterparty_bank_aliases;
CREATE POLICY "finance_counterparty_bank_aliases_insert" ON public.finance_counterparty_bank_aliases
  FOR INSERT TO authenticated WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

DROP POLICY IF EXISTS "finance_counterparty_bank_aliases_update" ON public.finance_counterparty_bank_aliases;
CREATE POLICY "finance_counterparty_bank_aliases_update" ON public.finance_counterparty_bank_aliases
  FOR UPDATE TO authenticated USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  )
  WITH CHECK (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

-- ---------- Atomik içe aktarma RPC ----------
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

    IF v_cp_id IS NULL AND v_new_cp IS NOT NULL AND v_new_cp->>'name' IS NOT NULL THEN
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

COMMENT ON TABLE public.finance_bank_import_batches IS 'Banka ekstresi dosya içe aktarma geçmişi';
COMMENT ON TABLE public.finance_bank_statement_lines IS 'Parse edilmiş banka hareket satırları';
COMMENT ON TABLE public.finance_counterparty_bank_aliases IS 'IBAN/TCKN/isim → cari eşleşme hafızası';

COMMIT;
