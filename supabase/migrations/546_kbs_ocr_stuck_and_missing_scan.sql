-- Takılı "Okunuyor" (ocr_pending/processing) kayıtlarını kurtar + eksik alan taraması.
BEGIN;

CREATE OR REPLACE FUNCTION ops.recover_stuck_document_ocr(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_recovered int := 0;
  v_enqueued int := 0;
  v_stale_cleared int := 0;
  r record;
  v_payload jsonb;
  v_warnings text[];
BEGIN
  -- Süresi dolmuş lease
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

  -- 3+ dakikadır processing/queued kalmış, aktif job'ı olmayan belgeler → manuel veya yeniden kuyruk
  FOR r IN
    SELECT gd.id, gd.parsed_payload, gd.ocr_status, gd.updated_at, gd.front_image_url
    FROM ops.guest_documents gd
    WHERE gd.front_image_url IS NOT NULL
      AND gd.created_at > now() - interval '14 days'
      AND (
        gd.ocr_status IN ('queued', 'processing', 'retry_wait', 'partial')
        OR COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_pending%'
        OR COALESCE(gd.parsed_payload::text, '') ILIKE '%ocr_processing%'
      )
      AND gd.updated_at < now() - interval '3 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM ops.document_ocr_jobs j
        WHERE j.guest_document_id = gd.id
          AND j.status IN ('queued', 'processing', 'retry_wait')
          AND (j.lease_expires_at IS NULL OR j.lease_expires_at > now())
      )
    ORDER BY gd.updated_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  LOOP
    -- 1 deneme: server_fallback + device_deep
    IF r.updated_at > now() - interval '15 minutes' THEN
      PERFORM ops.enqueue_document_ocr_job(r.id, 'server_fallback', 'front', 'v1', true);
      PERFORM ops.enqueue_document_ocr_job(r.id, 'device_deep', 'front', 'v1', false);
      v_enqueued := v_enqueued + 1;
    ELSE
      -- Eski takılı kayıt: manuel kontrole düş, sonsuz Okunuyor olmasın
      v_payload := COALESCE(r.parsed_payload, '{}'::jsonb);
      SELECT COALESCE(array_agg(DISTINCT w), ARRAY[]::text[])
      INTO v_warnings
      FROM unnest(
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'warnings', '[]'::jsonb))),
          ARRAY[]::text[]
        )
      ) AS w
      WHERE w NOT IN ('ocr_pending', 'ocr_processing', 'ocr_failed', 'ocr_partial');

      IF NOT ('ocr_manual_review' = ANY (v_warnings)) THEN
        v_warnings := array_append(v_warnings, 'ocr_manual_review');
      END IF;

      UPDATE ops.guest_documents
      SET parsed_payload = v_payload || jsonb_build_object('warnings', to_jsonb(v_warnings)),
          ocr_status = 'manual_review',
          ocr_last_error = COALESCE(ocr_last_error, 'Stuck OCR recovered to manual review'),
          ocr_next_retry_at = NULL,
          updated_at = now()
      WHERE id = r.id;
      v_stale_cleared := v_stale_cleared + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'leaseRecovered', v_recovered,
      'enqueued', v_enqueued,
      'staleCleared', v_stale_cleared
    )
  );
END;
$$;

-- Eksik alan tarama RPC — istemci / worker çağırabilir
CREATE OR REPLACE FUNCTION ops.scan_document_missing_fields(p_guest_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_doc ops.guest_documents%ROWTYPE;
  v_payload jsonb;
  v_missing text[] := ARRAY[]::text[];
  v_first text;
  v_last text;
  v_doc_no text;
  v_birth text;
  v_nat text;
  v_expiry text;
  v_warnings text[];
BEGIN
  SELECT * INTO v_doc FROM ops.guest_documents WHERE id = p_guest_document_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_FOUND'));
  END IF;

  v_payload := COALESCE(v_doc.parsed_payload, '{}'::jsonb);
  v_first := NULLIF(trim(COALESCE(v_payload->>'firstName', '')), '');
  v_last := NULLIF(trim(COALESCE(v_payload->>'lastName', '')), '');
  v_doc_no := upper(regexp_replace(COALESCE(v_payload->>'documentNumber', v_doc.document_number, ''), '[\s\-]', '', 'g'));
  IF v_doc_no = '' THEN v_doc_no := NULL; END IF;
  v_birth := NULLIF(left(COALESCE(v_payload->>'birthDate', ''), 10), '');
  v_nat := NULLIF(upper(trim(COALESCE(v_payload->>'nationalityCode', v_doc.nationality_code, ''))), '');
  v_expiry := NULLIF(left(COALESCE(v_payload->>'expiryDate', COALESCE(v_doc.expiry_date::text, '')), 10), '');

  IF v_first IS NULL THEN v_missing := array_append(v_missing, 'Ad'); END IF;
  IF v_last IS NULL THEN v_missing := array_append(v_missing, 'Soyad'); END IF;
  IF v_doc_no IS NULL OR length(v_doc_no) < 5 THEN v_missing := array_append(v_missing, 'Kimlik / pasaport no'); END IF;
  IF v_birth IS NULL THEN v_missing := array_append(v_missing, 'Doğum tarihi'); END IF;
  IF v_nat IS NULL THEN v_missing := array_append(v_missing, 'Uyruk'); END IF;
  IF v_expiry IS NULL THEN v_missing := array_append(v_missing, 'Son kullanım tarihi'); END IF;

  SELECT COALESCE(array_agg(DISTINCT w), ARRAY[]::text[])
  INTO v_warnings
  FROM unnest(
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'warnings', '[]'::jsonb))),
      ARRAY[]::text[]
    )
  ) AS w
  WHERE w NOT LIKE 'missing_fields:%'
    AND w NOT IN ('ocr_pending', 'ocr_processing');

  IF cardinality(v_missing) > 0 THEN
    v_warnings := array_append(v_warnings, 'missing_fields:' || array_to_string(v_missing, '|'));
    IF NOT ('ocr_partial' = ANY (v_warnings)) AND NOT ('ocr_manual_review' = ANY (v_warnings)) THEN
      v_warnings := array_append(v_warnings, 'ocr_partial');
    END IF;
  END IF;

  UPDATE ops.guest_documents
  SET parsed_payload = v_payload || jsonb_build_object('warnings', to_jsonb(v_warnings)),
      ocr_status = CASE
        WHEN cardinality(v_missing) = 0 THEN 'succeeded'
        WHEN ocr_status IN ('queued', 'processing') THEN 'partial'
        ELSE COALESCE(ocr_status, 'partial')
      END,
      ocr_last_error = CASE WHEN cardinality(v_missing) = 0 THEN NULL ELSE array_to_string(v_missing, ', ') END,
      updated_at = now()
  WHERE id = v_doc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'missingFields', to_jsonb(v_missing),
      'coreReady', cardinality(v_missing) = 0
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION ops.scan_document_missing_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.scan_document_missing_fields(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scan_document_missing_fields(p_guest_document_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.scan_document_missing_fields(p_guest_document_id);
$$;

REVOKE ALL ON FUNCTION public.scan_document_missing_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_document_missing_fields(uuid) TO authenticated, service_role;

COMMIT;
