-- Kalıcı kimlik OCR kuyruğu: attempt/lease/manual_review + atomik apply RPC.

BEGIN;

-- Belge üzerinde hızlı filtre kolonları (warnings JSON yanında kaynak gerçek).
ALTER TABLE ops.guest_documents
  ADD COLUMN IF NOT EXISTS ocr_status text
    CHECK (ocr_status IS NULL OR ocr_status IN (
      'queued', 'processing', 'retry_wait', 'succeeded', 'partial',
      'manual_review', 'failed_terminal', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS ocr_attempt int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_revision int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_last_error text,
  ADD COLUMN IF NOT EXISTS ocr_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_fields text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_guest_documents_ocr_status
  ON ops.guest_documents (hotel_id, ocr_status)
  WHERE ocr_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_documents_ocr_retry
  ON ops.guest_documents (ocr_next_retry_at)
  WHERE ocr_status IN ('queued', 'retry_wait', 'partial', 'processing');

CREATE TABLE IF NOT EXISTS ops.document_ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE CASCADE,
  guest_document_id uuid NOT NULL REFERENCES ops.guest_documents(id) ON DELETE CASCADE,
  guest_id uuid,
  image_url text,
  image_sha256 text,
  pipeline_version text NOT NULL DEFAULT 'v1',
  requested_side text NOT NULL DEFAULT 'front'
    CHECK (requested_side IN ('front', 'mrz_back')),
  strategy text NOT NULL DEFAULT 'device_fast'
    CHECK (strategy IN ('device_fast', 'device_deep', 'server_fallback')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'processing', 'retry_wait', 'succeeded', 'partial',
      'manual_review', 'failed_terminal', 'cancelled'
    )),
  attempt int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  missing_fields text[] NOT NULL DEFAULT '{}',
  result_payload jsonb,
  field_confidence jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_claim
  ON ops.document_ocr_jobs (status, run_at ASC, created_at ASC)
  WHERE status IN ('queued', 'retry_wait');

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_doc
  ON ops.document_ocr_jobs (guest_document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_hotel_status
  ON ops.document_ocr_jobs (hotel_id, status);

-- Aynı belge + pipeline + side için tek aktif iş.
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_ocr_jobs_active
  ON ops.document_ocr_jobs (guest_document_id, pipeline_version, requested_side)
  WHERE status IN ('queued', 'processing', 'retry_wait', 'partial');

DROP TRIGGER IF EXISTS trg_document_ocr_jobs_updated ON ops.document_ocr_jobs;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ops' AND p.proname = 'touch_updated_at'
  ) THEN
    CREATE TRIGGER trg_document_ocr_jobs_updated
      BEFORE UPDATE ON ops.document_ocr_jobs
      FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();
  END IF;
END $$;

ALTER TABLE ops.document_ocr_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_ocr_jobs_select ON ops.document_ocr_jobs;
CREATE POLICY document_ocr_jobs_select ON ops.document_ocr_jobs
  FOR SELECT TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    OR EXISTS (
      SELECT 1 FROM ops.app_users au
      WHERE au.id = auth.uid() AND au.hotel_id = document_ocr_jobs.hotel_id AND au.is_active
    )
  );

DROP POLICY IF EXISTS document_ocr_jobs_insert ON ops.document_ocr_jobs;
CREATE POLICY document_ocr_jobs_insert ON ops.document_ocr_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    OR EXISTS (
      SELECT 1 FROM ops.app_users au
      WHERE au.id = auth.uid() AND au.hotel_id = document_ocr_jobs.hotel_id AND au.is_active
    )
  );

DROP POLICY IF EXISTS document_ocr_jobs_update ON ops.document_ocr_jobs;
CREATE POLICY document_ocr_jobs_update ON ops.document_ocr_jobs
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    OR EXISTS (
      SELECT 1 FROM ops.app_users au
      WHERE au.id = auth.uid() AND au.hotel_id = document_ocr_jobs.hotel_id AND au.is_active
    )
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    OR EXISTS (
      SELECT 1 FROM ops.app_users au
      WHERE au.id = auth.uid() AND au.hotel_id = document_ocr_jobs.hotel_id AND au.is_active
    )
  );

GRANT SELECT, INSERT, UPDATE ON ops.document_ocr_jobs TO authenticated;
GRANT ALL ON ops.document_ocr_jobs TO service_role;

-- ---------------------------------------------------------------------------
-- Enqueue OCR job (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.enqueue_document_ocr_job(
  p_guest_document_id uuid,
  p_strategy text DEFAULT 'device_fast',
  p_requested_side text DEFAULT 'front',
  p_pipeline_version text DEFAULT 'v1',
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_doc ops.guest_documents%ROWTYPE;
  v_job ops.document_ocr_jobs%ROWTYPE;
  v_strategy text := COALESCE(NULLIF(trim(p_strategy), ''), 'device_fast');
  v_side text := COALESCE(NULLIF(trim(p_requested_side), ''), 'front');
  v_pipe text := COALESCE(NULLIF(trim(p_pipeline_version), ''), 'v1');
BEGIN
  IF auth.uid() IS NULL AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    -- service_role JWT yok; Edge service_role ile çağırabilir
    NULL;
  END IF;

  SELECT * INTO v_doc
  FROM ops.guest_documents
  WHERE id = p_guest_document_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Belge bulunamadı'));
  END IF;

  IF v_strategy NOT IN ('device_fast', 'device_deep', 'server_fallback') THEN
    v_strategy := 'device_fast';
  END IF;
  IF v_side NOT IN ('front', 'mrz_back') THEN
    v_side := 'front';
  END IF;

  IF p_force THEN
    UPDATE ops.document_ocr_jobs
    SET status = 'cancelled', updated_at = now(), completed_at = now()
    WHERE guest_document_id = p_guest_document_id
      AND pipeline_version = v_pipe
      AND requested_side = v_side
      AND status IN ('queued', 'processing', 'retry_wait', 'partial');
  END IF;

  SELECT * INTO v_job
  FROM ops.document_ocr_jobs
  WHERE guest_document_id = p_guest_document_id
    AND pipeline_version = v_pipe
    AND requested_side = v_side
    AND status IN ('queued', 'processing', 'retry_wait', 'partial')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE ops.document_ocr_jobs
    SET strategy = v_strategy,
        image_url = COALESCE(v_doc.front_image_url, image_url),
        guest_id = COALESCE(v_doc.guest_id, guest_id),
        run_at = LEAST(run_at, now()),
        updated_at = now()
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSE
    INSERT INTO ops.document_ocr_jobs (
      hotel_id, guest_document_id, guest_id, image_url,
      pipeline_version, requested_side, strategy, status,
      attempt, max_attempts, run_at, created_by
    ) VALUES (
      v_doc.hotel_id, v_doc.id, v_doc.guest_id, v_doc.front_image_url,
      v_pipe, v_side, v_strategy, 'queued',
      0, 3, now(), auth.uid()
    )
    RETURNING * INTO v_job;
  END IF;

  UPDATE ops.guest_documents
  SET ocr_status = CASE
        WHEN ocr_status IN ('processing') THEN ocr_status
        ELSE 'queued'
      END,
      ocr_next_retry_at = now(),
      ocr_last_error = NULL,
      parsed_payload = COALESCE(parsed_payload, '{}'::jsonb)
        || jsonb_build_object(
          'warnings',
          (
            SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
            FROM (
              SELECT DISTINCT w
              FROM unnest(
                array_remove(
                  array_remove(
                    array_remove(
                      array_remove(
                        COALESCE(
                          ARRAY(SELECT jsonb_array_elements_text(COALESCE(parsed_payload->'warnings', '[]'::jsonb))),
                          ARRAY[]::text[]
                        ),
                        'ocr_failed'
                      ),
                      'ocr_processing'
                    ),
                    'ocr_manual_review'
                  ),
                  'ocr_partial'
                ) || ARRAY['ocr_pending']
              ) AS w
            ) s
          )
        )
  WHERE id = v_doc.id;

  RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_job));
END;
$$;

REVOKE ALL ON FUNCTION ops.enqueue_document_ocr_job(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.enqueue_document_ocr_job(uuid, text, text, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Claim next OCR job (device or server worker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.claim_document_ocr_job(
  p_locked_by text,
  p_strategies text[] DEFAULT ARRAY['device_fast', 'device_deep', 'server_fallback'],
  p_lease_seconds int DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_id uuid;
  v_job ops.document_ocr_jobs%ROWTYPE;
  v_lease interval := make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 120), 30));
BEGIN
  -- Süresi dolmuş processing → retry_wait
  UPDATE ops.document_ocr_jobs
  SET status = 'retry_wait',
      run_at = now(),
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = COALESCE(last_error_code, 'LEASE_EXPIRED'),
      last_error_message = COALESCE(last_error_message, 'Lease süresi doldu'),
      updated_at = now()
  WHERE status = 'processing'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < now();

  SELECT j.id INTO v_id
  FROM ops.document_ocr_jobs j
  WHERE j.status IN ('queued', 'retry_wait', 'partial')
    AND j.run_at <= now()
    AND j.attempt < j.max_attempts
    AND j.strategy = ANY (COALESCE(p_strategies, ARRAY['device_fast', 'device_deep', 'server_fallback']))
  ORDER BY j.run_at ASC, j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'data', NULL);
  END IF;

  UPDATE ops.document_ocr_jobs
  SET status = 'processing',
      attempt = attempt + 1,
      lease_owner = p_locked_by,
      lease_expires_at = now() + v_lease,
      updated_at = now()
  WHERE id = v_id
  RETURNING * INTO v_job;

  UPDATE ops.guest_documents
  SET ocr_status = 'processing',
      ocr_attempt = v_job.attempt,
      parsed_payload = COALESCE(parsed_payload, '{}'::jsonb)
        || jsonb_build_object(
          'warnings',
          (
            SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
            FROM (
              SELECT DISTINCT w
              FROM unnest(
                array_remove(
                  array_remove(
                    array_remove(
                      COALESCE(
                        ARRAY(SELECT jsonb_array_elements_text(COALESCE(parsed_payload->'warnings', '[]'::jsonb))),
                        ARRAY[]::text[]
                      ),
                      'ocr_pending'
                    ),
                    'ocr_failed'
                  ),
                  'ocr_manual_review'
                ) || ARRAY['ocr_processing']
              ) AS w
            ) s
          )
        )
  WHERE id = v_job.guest_document_id;

  RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_job));
END;
$$;

REVOKE ALL ON FUNCTION ops.claim_document_ocr_job(text, text[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.claim_document_ocr_job(text, text[], int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomik OCR apply: guest_documents + guests + job status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.apply_document_ocr_result(
  p_job_id uuid,
  p_guest_document_id uuid,
  p_parsed jsonb,
  p_scan_confidence numeric DEFAULT NULL,
  p_ocr_engine text DEFAULT NULL,
  p_expected_revision int DEFAULT NULL,
  p_outcome text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_doc ops.guest_documents%ROWTYPE;
  v_job ops.document_ocr_jobs%ROWTYPE;
  v_payload jsonb;
  v_warnings text[];
  v_manual text[];
  v_first text;
  v_last text;
  v_full text;
  v_doc_no text;
  v_birth text;
  v_expiry text;
  v_nat text;
  v_iss text;
  v_gender text;
  v_middle text;
  v_father text;
  v_mother text;
  v_series text;
  v_core_ready boolean;
  v_missing text[] := ARRAY[]::text[];
  v_outcome text := COALESCE(NULLIF(trim(p_outcome), ''), 'auto');
  v_job_status text;
  v_ocr_status text;
  v_scan_status text;
  v_next_strategy text;
  v_revision int;
BEGIN
  SELECT * INTO v_doc FROM ops.guest_documents WHERE id = p_guest_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Belge bulunamadı'));
  END IF;

  IF p_expected_revision IS NOT NULL AND COALESCE(v_doc.ocr_revision, 0) <> p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'STALE', 'message', 'OCR revision uyuşmuyor'));
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM ops.document_ocr_jobs WHERE id = p_job_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'JOB_NOT_FOUND', 'message', 'OCR işi bulunamadı'));
    END IF;
    IF v_job.guest_document_id <> p_guest_document_id THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'MISMATCH', 'message', 'İş belge ile eşleşmiyor'));
    END IF;
  END IF;

  v_manual := COALESCE(v_doc.manual_fields, ARRAY[]::text[]);
  v_payload := COALESCE(v_doc.parsed_payload, '{}'::jsonb) || COALESCE(p_parsed, '{}'::jsonb);

  -- Manuel kilitli alanları OCR ezmesin
  IF 'firstName' = ANY (v_manual) AND v_doc.parsed_payload ? 'firstName' THEN
    v_payload := jsonb_set(v_payload, '{firstName}', v_doc.parsed_payload->'firstName', true);
  END IF;
  IF 'lastName' = ANY (v_manual) AND v_doc.parsed_payload ? 'lastName' THEN
    v_payload := jsonb_set(v_payload, '{lastName}', v_doc.parsed_payload->'lastName', true);
  END IF;
  IF 'documentNumber' = ANY (v_manual) AND v_doc.parsed_payload ? 'documentNumber' THEN
    v_payload := jsonb_set(v_payload, '{documentNumber}', v_doc.parsed_payload->'documentNumber', true);
  END IF;
  IF 'birthDate' = ANY (v_manual) AND v_doc.parsed_payload ? 'birthDate' THEN
    v_payload := jsonb_set(v_payload, '{birthDate}', v_doc.parsed_payload->'birthDate', true);
  END IF;
  IF 'nationalityCode' = ANY (v_manual) AND v_doc.parsed_payload ? 'nationalityCode' THEN
    v_payload := jsonb_set(v_payload, '{nationalityCode}', v_doc.parsed_payload->'nationalityCode', true);
  END IF;
  IF 'expiryDate' = ANY (v_manual) AND v_doc.parsed_payload ? 'expiryDate' THEN
    v_payload := jsonb_set(v_payload, '{expiryDate}', v_doc.parsed_payload->'expiryDate', true);
  END IF;

  v_first := NULLIF(trim(COALESCE(v_payload->>'firstName', '')), '');
  v_last := NULLIF(trim(COALESCE(v_payload->>'lastName', '')), '');
  v_middle := NULLIF(trim(COALESCE(v_payload->>'middleName', '')), '');
  v_full := NULLIF(trim(COALESCE(v_payload->>'fullName', '')), '');
  IF v_full IS NULL THEN
    v_full := NULLIF(trim(concat_ws(' ', v_first, v_last)), '');
  END IF;
  v_doc_no := upper(regexp_replace(COALESCE(v_payload->>'documentNumber', ''), '[\s\-]', '', 'g'));
  IF v_doc_no = '' THEN v_doc_no := NULL; END IF;
  v_birth := NULLIF(left(COALESCE(v_payload->>'birthDate', ''), 10), '');
  v_expiry := NULLIF(left(COALESCE(v_payload->>'expiryDate', ''), 10), '');
  v_nat := NULLIF(upper(trim(COALESCE(v_payload->>'nationalityCode', ''))), '');
  v_iss := NULLIF(upper(trim(COALESCE(v_payload->>'issuingCountryCode', ''))), '');
  v_gender := CASE WHEN v_payload->>'gender' IN ('M', 'F', 'X') THEN v_payload->>'gender' ELSE NULL END;
  v_father := NULLIF(trim(COALESCE(v_payload->>'fatherName', '')), '');
  v_mother := NULLIF(trim(COALESCE(v_payload->>'motherName', '')), '');
  v_series := NULLIF(upper(regexp_replace(COALESCE(v_payload->>'documentSeries', ''), '[\s\-]', '', 'g')), '');

  IF v_first IS NULL THEN v_missing := array_append(v_missing, 'Ad'); END IF;
  IF v_last IS NULL THEN v_missing := array_append(v_missing, 'Soyad'); END IF;
  IF v_doc_no IS NULL OR length(v_doc_no) < 5 THEN v_missing := array_append(v_missing, 'Kimlik / pasaport no'); END IF;
  IF v_birth IS NULL THEN v_missing := array_append(v_missing, 'Doğum tarihi'); END IF;
  IF v_nat IS NULL THEN v_missing := array_append(v_missing, 'Uyruk'); END IF;
  IF v_expiry IS NULL THEN v_missing := array_append(v_missing, 'Son kullanım tarihi'); END IF;

  v_core_ready := (cardinality(v_missing) = 0);

  -- Warnings temizliği
  SELECT COALESCE(array_agg(DISTINCT w), ARRAY[]::text[])
  INTO v_warnings
  FROM unnest(
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'warnings', '[]'::jsonb))),
      ARRAY[]::text[]
    )
  ) AS w
  WHERE w NOT IN (
    'ocr_pending', 'ocr_processing', 'ocr_failed',
    'ocr_partial', 'ocr_manual_review', 'manual_capture'
  );

  IF v_outcome = 'manual' OR (v_core_ready = false AND COALESCE(v_job.attempt, v_doc.ocr_attempt, 0) >= COALESCE(v_job.max_attempts, 3)) THEN
    IF v_core_ready THEN
      v_job_status := 'succeeded';
      v_ocr_status := 'succeeded';
    ELSE
      v_job_status := 'manual_review';
      v_ocr_status := 'manual_review';
      v_warnings := array_append(v_warnings, 'ocr_manual_review');
    END IF;
  ELSIF v_core_ready THEN
    v_job_status := 'succeeded';
    v_ocr_status := 'succeeded';
  ELSE
    -- Kısmi: sonraki stratejiye geç
    v_job_status := 'partial';
    v_ocr_status := 'partial';
    v_warnings := array_append(v_warnings, 'ocr_partial');
    IF COALESCE(v_job.attempt, v_doc.ocr_attempt, 0) >= COALESCE(v_job.max_attempts, 3) THEN
      v_job_status := 'manual_review';
      v_ocr_status := 'manual_review';
      v_warnings := array_remove(v_warnings, 'ocr_partial');
      v_warnings := array_append(v_warnings, 'ocr_manual_review');
    END IF;
  END IF;

  v_scan_status := CASE
    WHEN v_core_ready THEN 'ready_to_submit'
    WHEN NULLIF(v_payload->>'rawMrz', '') IS NOT NULL THEN 'scanned'
    WHEN cardinality(v_missing) <= 3 AND (v_doc_no IS NOT NULL OR v_full IS NOT NULL) THEN 'incomplete'
    ELSE COALESCE(v_doc.scan_status, 'draft')
  END;
  -- Submitted belgeler OCR ile geri alınmasın
  IF v_doc.scan_status IN ('submitted', 'checkout_pending', 'checked_out') THEN
    v_scan_status := v_doc.scan_status;
  END IF;

  v_payload := v_payload
    || jsonb_build_object(
      'firstName', to_jsonb(v_first),
      'lastName', to_jsonb(v_last),
      'fullName', to_jsonb(v_full),
      'documentNumber', to_jsonb(v_doc_no),
      'birthDate', to_jsonb(v_birth),
      'expiryDate', to_jsonb(v_expiry),
      'nationalityCode', to_jsonb(v_nat),
      'issuingCountryCode', to_jsonb(v_iss),
      'gender', to_jsonb(v_gender),
      'documentSeries', to_jsonb(v_series),
      'warnings', to_jsonb(v_warnings)
    );

  v_revision := COALESCE(v_doc.ocr_revision, 0) + 1;

  UPDATE ops.guest_documents
  SET parsed_payload = v_payload,
      scan_confidence = COALESCE(p_scan_confidence, scan_confidence),
      ocr_engine = COALESCE(p_ocr_engine, ocr_engine),
      document_number = COALESCE(v_doc_no, document_number),
      document_series = COALESCE(v_series, document_series),
      nationality_code = COALESCE(v_nat, nationality_code),
      issuing_country_code = COALESCE(v_iss, issuing_country_code),
      expiry_date = COALESCE(v_expiry::date, expiry_date),
      raw_mrz = COALESCE(NULLIF(v_payload->>'rawMrz', ''), raw_mrz),
      scan_status = v_scan_status,
      ocr_status = v_ocr_status,
      ocr_attempt = COALESCE(v_job.attempt, ocr_attempt),
      ocr_revision = v_revision,
      ocr_last_error = CASE WHEN v_ocr_status IN ('manual_review', 'failed_terminal') THEN array_to_string(v_missing, ', ') ELSE NULL END,
      ocr_next_retry_at = CASE
        WHEN v_ocr_status = 'partial' THEN now() + interval '2 seconds'
        ELSE NULL
      END
  WHERE id = v_doc.id;

  IF v_doc.guest_id IS NOT NULL THEN
    UPDATE ops.guests
    SET
      full_name = COALESCE(v_full, full_name),
      first_name = COALESCE(v_first, first_name),
      last_name = COALESCE(v_last, last_name),
      middle_name = COALESCE(v_middle, middle_name),
      birth_date = COALESCE(v_birth::date, birth_date),
      nationality_code = COALESCE(v_nat, nationality_code),
      gender = COALESCE(v_gender, gender),
      father_name = COALESCE(v_father, father_name),
      mother_name = COALESCE(v_mother, mother_name)
    WHERE id = v_doc.guest_id;
  END IF;

  IF p_job_id IS NOT NULL THEN
    v_next_strategy := CASE
      WHEN v_job_status = 'partial' AND v_job.strategy = 'device_fast' THEN 'device_deep'
      WHEN v_job_status = 'partial' AND v_job.strategy = 'device_deep' THEN 'server_fallback'
      ELSE v_job.strategy
    END;

    UPDATE ops.document_ocr_jobs
    SET status = CASE
          WHEN v_job_status = 'partial' AND v_job.attempt < v_job.max_attempts THEN 'retry_wait'
          ELSE v_job_status
        END,
        strategy = CASE
          WHEN v_job_status = 'partial' AND v_job.attempt < v_job.max_attempts THEN v_next_strategy
          ELSE strategy
        END,
        missing_fields = v_missing,
        result_payload = v_payload,
        lease_owner = NULL,
        lease_expires_at = NULL,
        run_at = CASE
          WHEN v_job_status = 'partial' AND v_job.attempt < v_job.max_attempts THEN now() + interval '2 seconds'
          ELSE run_at
        END,
        completed_at = CASE
          WHEN v_job_status IN ('succeeded', 'manual_review', 'failed_terminal') THEN now()
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = p_job_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'ocrStatus', v_ocr_status,
      'coreReady', v_core_ready,
      'missingFields', to_jsonb(v_missing),
      'ocrRevision', v_revision,
      'scanStatus', v_scan_status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION ops.apply_document_ocr_result(uuid, uuid, jsonb, numeric, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.apply_document_ocr_result(uuid, uuid, jsonb, numeric, text, int, text) TO authenticated, service_role;

-- Manuel alan kilidi + review kapatma
CREATE OR REPLACE FUNCTION ops.save_document_manual_fields(
  p_guest_document_id uuid,
  p_fields jsonb,
  p_locked_fields text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_doc ops.guest_documents%ROWTYPE;
  v_merged jsonb;
  v_warnings jsonb;
  v_payload jsonb;
  v_locked text[];
  v_core_ready boolean;
  v_missing text[] := ARRAY[]::text[];
  v_first text;
  v_last text;
  v_full text;
  v_doc_no text;
  v_birth text;
  v_expiry text;
  v_nat text;
BEGIN
  SELECT * INTO v_doc FROM ops.guest_documents WHERE id = p_guest_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Belge bulunamadı'));
  END IF;

  v_merged := COALESCE(v_doc.parsed_payload, '{}'::jsonb) || COALESCE(p_fields, '{}'::jsonb);
  v_locked := COALESCE(p_locked_fields, v_doc.manual_fields, ARRAY[]::text[]);
  IF p_fields ? 'firstName' AND NOT ('firstName' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'firstName');
  END IF;
  IF p_fields ? 'lastName' AND NOT ('lastName' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'lastName');
  END IF;
  IF p_fields ? 'documentNumber' AND NOT ('documentNumber' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'documentNumber');
  END IF;
  IF p_fields ? 'birthDate' AND NOT ('birthDate' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'birthDate');
  END IF;
  IF p_fields ? 'nationalityCode' AND NOT ('nationalityCode' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'nationalityCode');
  END IF;
  IF p_fields ? 'expiryDate' AND NOT ('expiryDate' = ANY (v_locked)) THEN
    v_locked := array_append(v_locked, 'expiryDate');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
  INTO v_warnings
  FROM (
    SELECT DISTINCT w
    FROM unnest(
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_merged->'warnings', '[]'::jsonb))),
        ARRAY[]::text[]
      ) || CASE WHEN cardinality(v_locked) > 0 THEN ARRAY['manual_name'] ELSE ARRAY[]::text[] END
    ) AS w
    WHERE w NOT IN (
      'ocr_pending', 'ocr_processing', 'ocr_failed', 'ocr_partial', 'ocr_manual_review'
    )
  ) x;

  v_payload := v_merged || jsonb_build_object('warnings', v_warnings);

  v_first := NULLIF(trim(COALESCE(v_payload->>'firstName', '')), '');
  v_last := NULLIF(trim(COALESCE(v_payload->>'lastName', '')), '');
  v_full := NULLIF(trim(COALESCE(v_payload->>'fullName', concat_ws(' ', v_first, v_last))), '');
  v_doc_no := upper(regexp_replace(COALESCE(v_payload->>'documentNumber', ''), '[\s\-]', '', 'g'));
  IF v_doc_no = '' THEN v_doc_no := NULL; END IF;
  v_birth := NULLIF(left(COALESCE(v_payload->>'birthDate', ''), 10), '');
  v_expiry := NULLIF(left(COALESCE(v_payload->>'expiryDate', ''), 10), '');
  v_nat := NULLIF(upper(trim(COALESCE(v_payload->>'nationalityCode', ''))), '');

  IF v_first IS NULL THEN v_missing := array_append(v_missing, 'Ad'); END IF;
  IF v_last IS NULL THEN v_missing := array_append(v_missing, 'Soyad'); END IF;
  IF v_doc_no IS NULL OR length(v_doc_no) < 5 THEN v_missing := array_append(v_missing, 'Kimlik / pasaport no'); END IF;
  IF v_birth IS NULL THEN v_missing := array_append(v_missing, 'Doğum tarihi'); END IF;
  IF v_nat IS NULL THEN v_missing := array_append(v_missing, 'Uyruk'); END IF;
  IF v_expiry IS NULL THEN v_missing := array_append(v_missing, 'Son kullanım tarihi'); END IF;
  v_core_ready := cardinality(v_missing) = 0;

  UPDATE ops.guest_documents
  SET parsed_payload = v_payload,
      manual_fields = (SELECT ARRAY(SELECT DISTINCT unnest(v_locked))),
      document_number = COALESCE(v_doc_no, document_number),
      nationality_code = COALESCE(v_nat, nationality_code),
      expiry_date = COALESCE(v_expiry::date, expiry_date),
      scan_status = CASE
        WHEN scan_status IN ('submitted', 'checkout_pending', 'checked_out') THEN scan_status
        WHEN v_core_ready THEN 'ready_to_submit'
        ELSE 'incomplete'
      END,
      ocr_status = CASE WHEN v_core_ready THEN 'succeeded' ELSE 'manual_review' END,
      ocr_revision = COALESCE(ocr_revision, 0) + 1,
      ocr_last_error = CASE WHEN v_core_ready THEN NULL ELSE array_to_string(v_missing, ', ') END,
      ocr_next_retry_at = NULL
  WHERE id = v_doc.id;

  IF v_doc.guest_id IS NOT NULL THEN
    UPDATE ops.guests
    SET
      first_name = COALESCE(v_first, first_name),
      last_name = COALESCE(v_last, last_name),
      full_name = COALESCE(v_full, full_name),
      birth_date = COALESCE(v_birth::date, birth_date),
      nationality_code = COALESCE(v_nat, nationality_code),
      gender = COALESCE(NULLIF(v_payload->>'gender', ''), gender),
      father_name = COALESCE(NULLIF(v_payload->>'fatherName', ''), father_name),
      mother_name = COALESCE(NULLIF(v_payload->>'motherName', ''), mother_name),
      middle_name = COALESCE(NULLIF(v_payload->>'middleName', ''), middle_name)
    WHERE id = v_doc.guest_id;
  END IF;

  UPDATE ops.document_ocr_jobs
  SET status = CASE WHEN v_core_ready THEN 'succeeded' ELSE 'manual_review' END,
      completed_at = now(),
      updated_at = now(),
      missing_fields = v_missing
  WHERE guest_document_id = v_doc.id
    AND status IN ('queued', 'processing', 'retry_wait', 'partial', 'manual_review');

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('coreReady', v_core_ready, 'missingFields', to_jsonb(v_missing))
  );
END;
$$;

REVOKE ALL ON FUNCTION ops.save_document_manual_fields(uuid, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.save_document_manual_fields(uuid, jsonb, text[]) TO authenticated, service_role;

-- Stuck recovery: lease + eski pending kayıtları kuyruğa al
CREATE OR REPLACE FUNCTION ops.recover_stuck_document_ocr(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_recovered int := 0;
  v_enqueued int := 0;
  r record;
BEGIN
  UPDATE ops.document_ocr_jobs
  SET status = 'retry_wait',
      run_at = now(),
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = now(),
      last_error_code = 'LEASE_EXPIRED'
  WHERE status = 'processing'
    AND lease_expires_at IS NOT NULL
    AND lease_expires_at < now();
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  FOR r IN
    SELECT gd.id
    FROM ops.guest_documents gd
    WHERE gd.front_image_url IS NOT NULL
      AND (
        gd.ocr_status IN ('queued', 'retry_wait', 'partial', 'processing')
        OR (
          gd.ocr_status IS NULL
          AND (
            COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_pending%'
            OR COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_processing%'
            OR COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_failed%'
            OR COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_partial%'
          )
        )
      )
      AND gd.created_at > now() - interval '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM ops.document_ocr_jobs j
        WHERE j.guest_document_id = gd.id
          AND j.status IN ('queued', 'processing', 'retry_wait', 'partial')
      )
    ORDER BY gd.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  LOOP
    PERFORM ops.enqueue_document_ocr_job(r.id, 'device_deep', 'front', 'v1', false);
    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('leaseRecovered', v_recovered, 'enqueued', v_enqueued));
END;
$$;

REVOKE ALL ON FUNCTION ops.recover_stuck_document_ocr(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.recover_stuck_document_ocr(int) TO authenticated, service_role;

-- PostgREST (public) wrappers
CREATE OR REPLACE FUNCTION public.enqueue_document_ocr_job(
  p_guest_document_id uuid,
  p_strategy text DEFAULT 'device_fast',
  p_requested_side text DEFAULT 'front',
  p_pipeline_version text DEFAULT 'v1',
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.enqueue_document_ocr_job(p_guest_document_id, p_strategy, p_requested_side, p_pipeline_version, p_force);
$$;

CREATE OR REPLACE FUNCTION public.claim_document_ocr_job(
  p_locked_by text,
  p_strategies text[] DEFAULT ARRAY['device_fast', 'device_deep', 'server_fallback'],
  p_lease_seconds int DEFAULT 120
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.claim_document_ocr_job(p_locked_by, p_strategies, p_lease_seconds);
$$;

CREATE OR REPLACE FUNCTION public.apply_document_ocr_result(
  p_job_id uuid,
  p_guest_document_id uuid,
  p_parsed jsonb,
  p_scan_confidence numeric DEFAULT NULL,
  p_ocr_engine text DEFAULT NULL,
  p_expected_revision int DEFAULT NULL,
  p_outcome text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.apply_document_ocr_result(
    p_job_id, p_guest_document_id, p_parsed, p_scan_confidence,
    p_ocr_engine, p_expected_revision, p_outcome
  );
$$;

CREATE OR REPLACE FUNCTION public.save_document_manual_fields(
  p_guest_document_id uuid,
  p_fields jsonb,
  p_locked_fields text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.save_document_manual_fields(p_guest_document_id, p_fields, p_locked_fields);
$$;

CREATE OR REPLACE FUNCTION public.recover_stuck_document_ocr(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.recover_stuck_document_ocr(p_limit);
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_document_ocr_job(uuid, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_document_ocr_job(text, text[], int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_document_ocr_result(uuid, uuid, jsonb, numeric, text, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_document_manual_fields(uuid, jsonb, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_stuck_document_ocr(int) TO authenticated, service_role;

-- pg_cron: her dakika stuck OCR kurtar (varsa)
DO $$
BEGIN
  PERFORM cron.schedule(
    'kbs_document_ocr_recover',
    '* * * * *',
    $cron$SELECT ops.recover_stuck_document_ocr(40);$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron kbs_document_ocr_recover skipped: %', SQLERRM;
END $$;

COMMIT;
