-- Otel sorumlusu + resepsiyon personel seçimi (profil kartı)
ALTER TABLE public.hotel_pulse_config
  ADD COLUMN IF NOT EXISTS manager_source text NOT NULL DEFAULT 'manual'
    CHECK (manager_source IN ('live', 'manual', 'both')),
  ADD COLUMN IF NOT EXISTS manual_manager_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_manager_title text,
  ADD COLUMN IF NOT EXISTS manual_manager_note text,
  ADD COLUMN IF NOT EXISTS manual_reception_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.hotel_pulse_staff_contact_json(
  p_staff_id uuid,
  p_role_label text,
  p_shift_label text DEFAULT '',
  p_note text DEFAULT '',
  p_name_override text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff%ROWTYPE;
BEGIN
  IF p_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'staffId', NULL,
      'staffName', COALESCE(NULLIF(trim(p_name_override), ''), '—'),
      'roleLabel', COALESCE(NULLIF(trim(p_role_label), ''), ''),
      'profileImage', NULL,
      'department', NULL,
      'shiftLabel', COALESCE(p_shift_label, ''),
      'note', COALESCE(p_note, ''),
      'isOnline', false
    );
  END IF;

  SELECT * INTO v_row FROM public.staff s WHERE s.id = p_staff_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'staffId', p_staff_id,
      'staffName', COALESCE(NULLIF(trim(p_name_override), ''), '—'),
      'roleLabel', COALESCE(NULLIF(trim(p_role_label), ''), ''),
      'profileImage', NULL,
      'department', NULL,
      'shiftLabel', COALESCE(p_shift_label, ''),
      'note', COALESCE(p_note, ''),
      'isOnline', false
    );
  END IF;

  RETURN jsonb_build_object(
    'staffId', v_row.id,
    'staffName', COALESCE(NULLIF(trim(p_name_override), ''), NULLIF(trim(v_row.full_name), ''), '—'),
    'roleLabel', COALESCE(NULLIF(trim(p_role_label), ''), ''),
    'profileImage', v_row.profile_image,
    'department', v_row.department,
    'shiftLabel', COALESCE(p_shift_label, ''),
    'note', COALESCE(p_note, ''),
    'isOnline', COALESCE(v_row.is_online, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_pulse_live_manager_staff_id(p_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND (p_org IS NULL OR s.organization_id = p_org)
    AND s.role IN ('admin', 'manager')
  ORDER BY s.is_online DESC, s.full_name ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hotel_pulse_live_reception_staff_id(p_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND s.is_online = true
    AND (p_org IS NULL OR s.organization_id = p_org)
    AND (
      s.role IN ('receptionist', 'reception_chief')
      OR lower(trim(coalesce(s.department, ''))) IN ('reception', 'resepsiyon')
    )
  ORDER BY s.full_name ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_hotel_pulse_guest_extras(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_cfg public.hotel_pulse_config%ROWTYPE;
  v_has_cfg boolean := false;
  v_live_manager_id uuid;
  v_live_reception_id uuid;
  v_manager_id uuid;
  v_reception_id uuid;
  v_manager jsonb;
  v_reception jsonb;
  v_facilities jsonb;
  v_manager_title text;
  v_manager_note text;
  v_reception_shift text;
  v_reception_note text;
  v_reception_name_override text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(
    p_organization_id,
    (SELECT g.organization_id FROM public.guests g WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL ORDER BY g.created_at DESC LIMIT 1),
    (SELECT r.organization_id FROM public.rooms r WHERE r.organization_id IS NOT NULL LIMIT 1)
  ) INTO v_org;

  IF v_org IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.hotel_pulse_config c WHERE c.organization_id = v_org;
    v_has_cfg := FOUND;
  END IF;

  v_live_manager_id := public.hotel_pulse_live_manager_staff_id(v_org);
  v_live_reception_id := public.hotel_pulse_live_reception_staff_id(v_org);

  v_manager_title := CASE
    WHEN v_has_cfg AND NULLIF(trim(v_cfg.manual_manager_title), '') IS NOT NULL THEN trim(v_cfg.manual_manager_title)
    ELSE 'Otel Sorumlusu'
  END;
  v_manager_note := CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_manager_note, '') ELSE '' END;

  IF v_has_cfg AND v_cfg.manager_source = 'manual' THEN
    v_manager_id := v_cfg.manual_manager_staff_id;
  ELSIF v_has_cfg AND v_cfg.manager_source = 'both' THEN
    v_manager_id := COALESCE(v_cfg.manual_manager_staff_id, v_live_manager_id);
  ELSE
    v_manager_id := v_live_manager_id;
  END IF;

  v_reception_shift := CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_reception_shift_label, '') ELSE '' END;
  v_reception_note := CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_reception_note, '') ELSE '' END;
  v_reception_name_override := CASE
    WHEN v_has_cfg AND NULLIF(trim(v_cfg.manual_reception_staff_name), '') IS NOT NULL THEN trim(v_cfg.manual_reception_staff_name)
    ELSE NULL
  END;

  IF v_has_cfg AND v_cfg.reception_source = 'manual' THEN
    v_reception_id := COALESCE(v_cfg.manual_reception_staff_id, NULL);
  ELSIF v_has_cfg AND v_cfg.reception_source = 'both' THEN
    v_reception_id := COALESCE(v_cfg.manual_reception_staff_id, v_live_reception_id);
  ELSE
    v_reception_id := v_live_reception_id;
  END IF;

  v_manager := public.hotel_pulse_staff_contact_json(
    v_manager_id,
    v_manager_title,
    '',
    v_manager_note,
    NULL
  );

  v_reception := public.hotel_pulse_staff_contact_json(
    v_reception_id,
    'Resepsiyon',
    v_reception_shift,
    v_reception_note,
    v_reception_name_override
  );

  IF NOT v_has_cfg OR v_cfg.facilities_source = 'manual' THEN
    v_facilities := jsonb_build_object(
      'boilerLabel', CASE
        WHEN v_has_cfg AND NULLIF(trim(v_cfg.manual_boiler_label), '') IS NOT NULL THEN trim(v_cfg.manual_boiler_label)
        ELSE 'Sıcak su hazır'
      END,
      'boilerActive', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_boiler_active, true) ELSE true END,
      'breakfastHours', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_breakfast_hours, '') ELSE '' END,
      'spaLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_spa_label, '') ELSE '' END,
      'wifiStatus', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_wifi_status, '') ELSE '' END,
      'weatherLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_weather_label, '') ELSE '' END
    );
  ELSE
    v_facilities := jsonb_build_object(
      'boilerLabel', 'Sıcak su hazır',
      'boilerActive', true,
      'breakfastHours', '',
      'spaLabel', '',
      'wifiStatus', '',
      'weatherLabel', ''
    );
  END IF;

  RETURN jsonb_build_object('manager', v_manager, 'reception', v_reception, 'facilities', v_facilities);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hotel_pulse_staff_contact_json(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_pulse_live_manager_staff_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_pulse_live_reception_staff_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) IS
  'Misafir nabzı: otel sorumlusu + resepsiyon profil kartları + tesis durumu.';
