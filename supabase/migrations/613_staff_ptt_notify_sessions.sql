-- Bas-konuş bildirim oturumu: her konuşmada spam yerine org başına tek push.
-- Kısa toplama penceresinde konuşanlar birleşir → "Soner ve 3 kişi daha konuşuyor".

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_ptt_notify_sessions (
  organization_id UUID PRIMARY KEY,
  lead_speaker_id UUID NOT NULL,
  lead_speaker_name TEXT NOT NULL,
  speaker_ids UUID[] NOT NULL DEFAULT '{}',
  first_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.staff_ptt_notify_sessions IS
  'Org başına aktif telsiz bildirim oturumu; idle sonrası yenilenir, oturumda tek push.';

ALTER TABLE public.staff_ptt_notify_sessions ENABLE ROW LEVEL SECURITY;

-- Satırlar yalnızca SECURITY DEFINER RPC ile yönetilir.
DROP POLICY IF EXISTS staff_ptt_notify_sessions_deny_all ON public.staff_ptt_notify_sessions;
CREATE POLICY staff_ptt_notify_sessions_deny_all
ON public.staff_ptt_notify_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.claim_staff_ptt_talk_notify(
  p_organization_id UUID,
  p_speaker_id UUID,
  p_speaker_name TEXT,
  p_mode TEXT DEFAULT 'touch',
  p_idle_seconds INTEGER DEFAULT 90,
  p_collect_seconds INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
  v_mode TEXT := lower(coalesce(nullif(trim(p_mode), ''), 'touch'));
  v_idle INT := GREATEST(30, LEAST(coalesce(p_idle_seconds, 90), 600));
  v_collect INT := GREATEST(0, LEAST(coalesce(p_collect_seconds, 2), 10));
  v_name TEXT := left(nullif(trim(coalesce(p_speaker_name, '')), ''), 80);
  v_row public.staff_ptt_notify_sessions%ROWTYPE;
  v_expired BOOLEAN;
  v_other INT;
  v_wait_ms INT;
  v_ids UUID[];
BEGIN
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'action', 'skip', 'error', 'not_staff');
  END IF;
  IF p_organization_id IS NULL OR p_speaker_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'action', 'skip', 'error', 'missing_params');
  END IF;
  IF v_name IS NULL THEN
    v_name := 'Personel';
  END IF;
  IF v_mode NOT IN ('touch', 'flush') THEN
    v_mode := 'touch';
  END IF;

  -- Konuşmacı kendi org'unda olmalı
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.id = v_staff
      AND s.id = p_speaker_id
      AND s.organization_id = p_organization_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'action', 'skip', 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.staff_ptt_notify_sessions
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  v_expired := (
    v_row.organization_id IS NULL
    OR v_row.last_activity_at < (NOW() - make_interval(secs => v_idle))
  );

  IF v_expired THEN
    INSERT INTO public.staff_ptt_notify_sessions AS t (
      organization_id,
      lead_speaker_id,
      lead_speaker_name,
      speaker_ids,
      first_touch_at,
      last_activity_at,
      notified_at
    ) VALUES (
      p_organization_id,
      p_speaker_id,
      v_name,
      ARRAY[p_speaker_id]::uuid[],
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (organization_id) DO UPDATE
    SET lead_speaker_id = EXCLUDED.lead_speaker_id,
        lead_speaker_name = EXCLUDED.lead_speaker_name,
        speaker_ids = EXCLUDED.speaker_ids,
        first_touch_at = EXCLUDED.first_touch_at,
        last_activity_at = EXCLUDED.last_activity_at,
        notified_at = NULL
    RETURNING * INTO v_row;
  ELSE
    v_ids := v_row.speaker_ids;
    IF NOT (p_speaker_id = ANY (v_ids)) THEN
      v_ids := array_append(v_ids, p_speaker_id);
    END IF;
    UPDATE public.staff_ptt_notify_sessions
    SET speaker_ids = v_ids,
        last_activity_at = NOW()
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_row;
  END IF;

  v_other := GREATEST(0, coalesce(cardinality(v_row.speaker_ids), 1) - 1);
  v_wait_ms := GREATEST(
    0,
    (v_collect * 1000) - FLOOR(EXTRACT(EPOCH FROM (NOW() - v_row.first_touch_at)) * 1000)::INT
  );

  IF v_row.notified_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'skip',
      'lead_name', v_row.lead_speaker_name,
      'other_count', v_other,
      'speaker_count', coalesce(cardinality(v_row.speaker_ids), 1)
    );
  END IF;

  IF v_mode = 'touch' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'collecting',
      'wait_ms', v_wait_ms,
      'lead_name', v_row.lead_speaker_name,
      'other_count', v_other,
      'speaker_count', coalesce(cardinality(v_row.speaker_ids), 1)
    );
  END IF;

  -- flush: toplama bitti mi?
  IF v_wait_ms > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'collecting',
      'wait_ms', v_wait_ms,
      'lead_name', v_row.lead_speaker_name,
      'other_count', v_other,
      'speaker_count', coalesce(cardinality(v_row.speaker_ids), 1)
    );
  END IF;

  UPDATE public.staff_ptt_notify_sessions
  SET notified_at = NOW(),
      last_activity_at = NOW()
  WHERE organization_id = p_organization_id
    AND notified_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Başka istemci kazandı
    SELECT * INTO v_row
    FROM public.staff_ptt_notify_sessions
    WHERE organization_id = p_organization_id;
    v_other := GREATEST(0, coalesce(cardinality(v_row.speaker_ids), 1) - 1);
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'skip',
      'lead_name', coalesce(v_row.lead_speaker_name, v_name),
      'other_count', v_other,
      'speaker_count', coalesce(cardinality(v_row.speaker_ids), 1)
    );
  END IF;

  v_other := GREATEST(0, coalesce(cardinality(v_row.speaker_ids), 1) - 1);
  RETURN jsonb_build_object(
    'ok', true,
    'action', 'notify',
    'lead_name', v_row.lead_speaker_name,
    'other_count', v_other,
    'speaker_count', coalesce(cardinality(v_row.speaker_ids), 1)
  );
END;
$$;

COMMENT ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) IS
  'Telsiz konuşma bildirimi: touch ile konuşmacı kaydı, flush ile oturumda tek push hakkı.';

REVOKE ALL ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) TO service_role;

COMMIT;
