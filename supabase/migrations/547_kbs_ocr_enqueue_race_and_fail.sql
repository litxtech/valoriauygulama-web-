-- Enqueue, succeeded/manual kayıtları ezmesin; OCR job fail RPC.
BEGIN;

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
  v_terminal boolean := false;
BEGIN
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

  v_terminal := COALESCE(v_doc.ocr_status, '') IN ('succeeded', 'manual_review', 'failed_terminal');

  -- Geç enqueue, tamamlanmış kaydı tekrar "Okunuyor" yapmasın
  IF v_terminal AND NOT p_force THEN
    SELECT * INTO v_job
    FROM ops.document_ocr_jobs
    WHERE guest_document_id = p_guest_document_id
      AND pipeline_version = v_pipe
      AND requested_side = v_side
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'data', COALESCE(to_jsonb(v_job), 'null'::jsonb),
      'skipped', true,
      'reason', 'terminal_ocr_status'
    );
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
        WHEN ocr_status IN ('succeeded', 'manual_review', 'failed_terminal') AND NOT p_force THEN ocr_status
        ELSE 'queued'
      END,
      ocr_next_retry_at = CASE
        WHEN ocr_status IN ('succeeded', 'manual_review', 'failed_terminal') AND NOT p_force THEN ocr_next_retry_at
        ELSE now()
      END,
      ocr_last_error = CASE
        WHEN ocr_status IN ('succeeded', 'manual_review', 'failed_terminal') AND NOT p_force THEN ocr_last_error
        ELSE NULL
      END,
      parsed_payload = CASE
        WHEN ocr_status IN ('succeeded', 'manual_review', 'failed_terminal') AND NOT p_force THEN parsed_payload
        ELSE COALESCE(parsed_payload, '{}'::jsonb)
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
      END
  WHERE id = v_doc.id;

  RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_job));
END;
$$;

CREATE OR REPLACE FUNCTION ops.fail_document_ocr_job(
  p_job_id uuid,
  p_guest_document_id uuid,
  p_error_code text DEFAULT 'WORKER_ERROR',
  p_error_message text DEFAULT NULL,
  p_terminal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_job ops.document_ocr_jobs%ROWTYPE;
  v_doc ops.guest_documents%ROWTYPE;
  v_payload jsonb;
  v_warnings text[];
  v_status text;
BEGIN
  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM ops.document_ocr_jobs WHERE id = p_job_id FOR UPDATE;
  END IF;

  SELECT * INTO v_doc
  FROM ops.guest_documents
  WHERE id = COALESCE(p_guest_document_id, v_job.guest_document_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_FOUND'));
  END IF;

  v_status := CASE WHEN p_terminal THEN 'failed_terminal' ELSE 'retry_wait' END;

  IF v_job.id IS NOT NULL THEN
    UPDATE ops.document_ocr_jobs
    SET status = CASE
          WHEN p_terminal OR attempt >= max_attempts THEN 'failed_terminal'
          ELSE 'retry_wait'
        END,
        last_error_code = COALESCE(NULLIF(trim(p_error_code), ''), 'WORKER_ERROR'),
        last_error_message = left(COALESCE(p_error_message, ''), 500),
        lease_owner = NULL,
        lease_expires_at = NULL,
        run_at = CASE
          WHEN p_terminal OR attempt >= max_attempts THEN run_at
          ELSE now() + interval '5 seconds'
        END,
        completed_at = CASE
          WHEN p_terminal OR attempt >= max_attempts THEN now()
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = v_job.id
    RETURNING * INTO v_job;
    v_status := v_job.status;
  END IF;

  -- Terminal değilse ve belge zaten succeeded ise dokunma
  IF COALESCE(v_doc.ocr_status, '') IN ('succeeded', 'manual_review') AND NOT p_terminal THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('jobStatus', v_status, 'skippedDoc', true));
  END IF;

  v_payload := COALESCE(v_doc.parsed_payload, '{}'::jsonb);
  SELECT COALESCE(array_agg(DISTINCT w), ARRAY[]::text[])
  INTO v_warnings
  FROM unnest(
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_payload->'warnings', '[]'::jsonb))),
      ARRAY[]::text[]
    )
  ) AS w
  WHERE w NOT IN ('ocr_pending', 'ocr_processing');

  IF v_status = 'failed_terminal' THEN
    IF NOT ('ocr_failed' = ANY (v_warnings)) THEN
      v_warnings := array_append(v_warnings, 'ocr_failed');
    END IF;
  ELSIF NOT ('ocr_partial' = ANY (v_warnings)) AND NOT ('ocr_manual_review' = ANY (v_warnings)) THEN
    v_warnings := array_append(v_warnings, 'ocr_partial');
  END IF;

  UPDATE ops.guest_documents
  SET parsed_payload = v_payload || jsonb_build_object('warnings', to_jsonb(v_warnings)),
      ocr_status = CASE
        WHEN v_status = 'failed_terminal' THEN 'failed_terminal'
        WHEN ocr_status IN ('succeeded', 'manual_review') THEN ocr_status
        ELSE 'partial'
      END,
      ocr_last_error = left(COALESCE(p_error_message, p_error_code, ocr_last_error), 500),
      ocr_next_retry_at = CASE WHEN v_status = 'retry_wait' THEN now() + interval '5 seconds' ELSE NULL END,
      updated_at = now()
  WHERE id = v_doc.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('jobStatus', v_status));
END;
$$;

REVOKE ALL ON FUNCTION ops.fail_document_ocr_job(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.fail_document_ocr_job(uuid, uuid, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fail_document_ocr_job(
  p_job_id uuid,
  p_guest_document_id uuid,
  p_error_code text DEFAULT 'WORKER_ERROR',
  p_error_message text DEFAULT NULL,
  p_terminal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT ops.fail_document_ocr_job(p_job_id, p_guest_document_id, p_error_code, p_error_message, p_terminal);
$$;

REVOKE ALL ON FUNCTION public.fail_document_ocr_job(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_document_ocr_job(uuid, uuid, text, text, boolean) TO authenticated, service_role;

-- public wrapper zaten 545'te var; tanımı yenile
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

COMMIT;
