-- Üyelik tabanlı PTT odaları (otel/org sınırı yok) + oda bazlı bildirim oturumu.

BEGIN;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_ptt_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_ptt_rooms_slug_format CHECK (slug ~ '^[a-z0-9_]{2,64}$'),
  CONSTRAINT staff_ptt_rooms_slug_key UNIQUE (slug),
  CONSTRAINT staff_ptt_rooms_name_len CHECK (char_length(trim(name)) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_ptt_rooms_one_default_idx
  ON public.staff_ptt_rooms ((is_default))
  WHERE is_default = true AND is_active = true;

CREATE INDEX IF NOT EXISTS staff_ptt_rooms_active_created_idx
  ON public.staff_ptt_rooms (is_active, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_staff_ptt_rooms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_ptt_rooms_updated_at ON public.staff_ptt_rooms;
CREATE TRIGGER trg_staff_ptt_rooms_updated_at
BEFORE UPDATE ON public.staff_ptt_rooms
FOR EACH ROW
EXECUTE FUNCTION public.set_staff_ptt_rooms_updated_at();

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_ptt_room_members (
  room_id UUID NOT NULL REFERENCES public.staff_ptt_rooms(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, staff_id)
);

CREATE INDEX IF NOT EXISTS staff_ptt_room_members_staff_idx
  ON public.staff_ptt_room_members (staff_id, joined_at DESC);

ALTER TABLE public.staff_ptt_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_ptt_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_ptt_rooms_select_active ON public.staff_ptt_rooms;
CREATE POLICY staff_ptt_rooms_select_active
ON public.staff_ptt_rooms
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS staff_ptt_rooms_insert_staff ON public.staff_ptt_rooms;
CREATE POLICY staff_ptt_rooms_insert_staff
ON public.staff_ptt_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  is_default = false
  AND created_by = public.current_staff_id()
  AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = public.current_staff_id()
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS staff_ptt_rooms_update_creator ON public.staff_ptt_rooms;
CREATE POLICY staff_ptt_rooms_update_creator
ON public.staff_ptt_rooms
FOR UPDATE
TO authenticated
USING (
  created_by = public.current_staff_id()
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
  )
)
WITH CHECK (
  created_by = public.current_staff_id()
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS staff_ptt_room_members_select ON public.staff_ptt_room_members;
CREATE POLICY staff_ptt_room_members_select
ON public.staff_ptt_room_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS staff_ptt_room_members_insert_self ON public.staff_ptt_room_members;
CREATE POLICY staff_ptt_room_members_insert_self
ON public.staff_ptt_room_members
FOR INSERT
TO authenticated
WITH CHECK (
  staff_id = public.current_staff_id()
);

DROP POLICY IF EXISTS staff_ptt_room_members_delete_self ON public.staff_ptt_room_members;
CREATE POLICY staff_ptt_room_members_delete_self
ON public.staff_ptt_room_members
FOR DELETE
TO authenticated
USING (
  staff_id = public.current_staff_id()
);

-- ---------------------------------------------------------------------------
-- Seed default room + backfill membership
-- ---------------------------------------------------------------------------
INSERT INTO public.staff_ptt_rooms (slug, name, created_by, is_default, is_active)
VALUES ('all_staff', 'Tüm personel', NULL, true, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    is_default = true,
    is_active = true;

INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
SELECT r.id, s.id
FROM public.staff_ptt_rooms r
CROSS JOIN public.staff s
WHERE r.slug = 'all_staff'
  AND r.is_default = true
  AND s.is_active = true
  AND s.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Yeni personel → default odaya otomatik üye
CREATE OR REPLACE FUNCTION public.trg_staff_auto_join_default_ptt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room UUID;
BEGIN
  IF NEW.is_active IS TRUE AND NEW.deleted_at IS NULL THEN
    SELECT id INTO v_room
    FROM public.staff_ptt_rooms
    WHERE is_default = true AND is_active = true
    LIMIT 1;
    IF v_room IS NOT NULL THEN
      INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
      VALUES (v_room, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_auto_join_default_ptt ON public.staff;
CREATE TRIGGER trg_staff_auto_join_default_ptt
AFTER INSERT ON public.staff
FOR EACH ROW
EXECUTE FUNCTION public.trg_staff_auto_join_default_ptt();

CREATE OR REPLACE FUNCTION public.ensure_default_ptt_membership(p_staff_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := coalesce(p_staff_id, public.current_staff_id());
  v_room UUID;
BEGIN
  IF v_staff IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_room
  FROM public.staff_ptt_rooms
  WHERE is_default = true AND is_active = true
  LIMIT 1;
  IF v_room IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
  VALUES (v_room, v_staff)
  ON CONFLICT DO NOTHING;
  RETURN v_room;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_ptt_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_ptt_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_ptt_membership(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Create room helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_staff_ptt_room(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
  v_name TEXT := left(nullif(trim(coalesce(p_name, '')), ''), 80);
  v_base TEXT;
  v_slug TEXT;
  v_id UUID;
  v_i INT := 0;
BEGIN
  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'not_staff';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  v_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '_', 'g'));
  v_base := trim(both '_' from v_base);
  IF v_base IS NULL OR char_length(v_base) < 2 THEN
    v_base := 'room';
  END IF;
  v_base := left(v_base, 48);
  v_slug := v_base;

  LOOP
    BEGIN
      INSERT INTO public.staff_ptt_rooms (slug, name, created_by, is_default, is_active)
      VALUES (v_slug, v_name, v_staff, false, true)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_i := v_i + 1;
      v_slug := left(v_base, 40) || '_' || v_i::text;
      IF v_i > 50 THEN
        RAISE EXCEPTION 'slug_conflict';
      END IF;
    END;
  END LOOP;

  INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
  VALUES (v_id, v_staff)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_ptt_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_ptt_room(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_staff_ptt_room(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
BEGIN
  IF v_staff IS NULL OR p_room_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_ptt_rooms r
    WHERE r.id = p_room_id AND r.is_active = true
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
  VALUES (p_room_id, v_staff)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_staff_ptt_room(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
BEGIN
  IF v_staff IS NULL OR p_room_id IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.staff_ptt_room_members
  WHERE room_id = p_room_id AND staff_id = v_staff;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.join_staff_ptt_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_staff_ptt_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_staff_ptt_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_staff_ptt_room(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Notify sessions: room-scoped (replaces org-scoped)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer);

DROP TABLE IF EXISTS public.staff_ptt_notify_sessions;

CREATE TABLE public.staff_ptt_notify_sessions (
  room_id UUID PRIMARY KEY REFERENCES public.staff_ptt_rooms(id) ON DELETE CASCADE,
  lead_speaker_id UUID NOT NULL,
  lead_speaker_name TEXT NOT NULL,
  speaker_ids UUID[] NOT NULL DEFAULT '{}',
  first_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.staff_ptt_notify_sessions IS
  'Oda başına aktif telsiz bildirim oturumu; idle sonrası yenilenir, oturumda tek push.';

ALTER TABLE public.staff_ptt_notify_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_ptt_notify_sessions_deny_all ON public.staff_ptt_notify_sessions;
CREATE POLICY staff_ptt_notify_sessions_deny_all
ON public.staff_ptt_notify_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.claim_staff_ptt_talk_notify(
  p_room_id UUID,
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
  IF p_room_id IS NULL OR p_speaker_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'action', 'skip', 'error', 'missing_params');
  END IF;
  IF v_name IS NULL THEN
    v_name := 'Personel';
  END IF;
  IF v_mode NOT IN ('touch', 'flush') THEN
    v_mode := 'touch';
  END IF;

  -- Konuşmacı o odanın üyesi olmalı
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_ptt_room_members m
    JOIN public.staff s ON s.id = m.staff_id
    WHERE m.room_id = p_room_id
      AND m.staff_id = v_staff
      AND m.staff_id = p_speaker_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'action', 'skip', 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.staff_ptt_notify_sessions
  WHERE room_id = p_room_id
  FOR UPDATE;

  v_expired := (
    v_row.room_id IS NULL
    OR v_row.last_activity_at < (NOW() - make_interval(secs => v_idle))
  );

  IF v_expired THEN
    INSERT INTO public.staff_ptt_notify_sessions AS t (
      room_id,
      lead_speaker_id,
      lead_speaker_name,
      speaker_ids,
      first_touch_at,
      last_activity_at,
      notified_at
    ) VALUES (
      p_room_id,
      p_speaker_id,
      v_name,
      ARRAY[p_speaker_id]::uuid[],
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (room_id) DO UPDATE
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
    WHERE room_id = p_room_id
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
  WHERE room_id = p_room_id
    AND notified_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.staff_ptt_notify_sessions
    WHERE room_id = p_room_id;
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
  'Telsiz konuşma bildirimi (oda): touch ile konuşmacı kaydı, flush ile oturumda tek push hakkı.';

REVOKE ALL ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_staff_ptt_talk_notify(uuid, uuid, text, text, integer, integer) TO service_role;

COMMIT;
