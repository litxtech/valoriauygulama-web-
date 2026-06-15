-- Resepsiyon + tesis durumu (havuz hariç)
ALTER TABLE public.hotel_pulse_config
  ADD COLUMN IF NOT EXISTS reception_source text NOT NULL DEFAULT 'live'
    CHECK (reception_source IN ('live', 'manual', 'both')),
  ADD COLUMN IF NOT EXISTS facilities_source text NOT NULL DEFAULT 'manual'
    CHECK (facilities_source IN ('live', 'manual')),
  ADD COLUMN IF NOT EXISTS manual_reception_staff_name text,
  ADD COLUMN IF NOT EXISTS manual_reception_shift_label text,
  ADD COLUMN IF NOT EXISTS manual_reception_note text,
  ADD COLUMN IF NOT EXISTS manual_boiler_label text,
  ADD COLUMN IF NOT EXISTS manual_boiler_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_breakfast_hours text,
  ADD COLUMN IF NOT EXISTS manual_spa_label text,
  ADD COLUMN IF NOT EXISTS manual_wifi_status text,
  ADD COLUMN IF NOT EXISTS manual_weather_label text;

CREATE OR REPLACE FUNCTION public.hotel_pulse_live_reception_names(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(string_agg(s.full_name, ', ' ORDER BY s.full_name), '')
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
    AND s.is_online = true
    AND (p_org IS NULL OR s.organization_id = p_org)
    AND (
      s.role IN ('receptionist', 'reception_chief')
      OR lower(trim(coalesce(s.department, ''))) IN ('reception', 'resepsiyon')
    );
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
  v_live_names text;
  v_staff_name text;
  v_reception jsonb;
  v_facilities jsonb;
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

  v_live_names := public.hotel_pulse_live_reception_names(v_org);

  IF v_has_cfg AND v_cfg.reception_source = 'manual' THEN
    v_staff_name := COALESCE(NULLIF(trim(v_cfg.manual_reception_staff_name), ''), 'Resepsiyon');
  ELSIF v_has_cfg AND v_cfg.reception_source = 'both' THEN
    v_staff_name := COALESCE(
      NULLIF(trim(v_cfg.manual_reception_staff_name), ''),
      v_live_names,
      'Resepsiyon'
    );
  ELSE
    v_staff_name := COALESCE(v_live_names, 'Resepsiyon');
  END IF;

  v_reception := jsonb_build_object(
    'staffName', v_staff_name,
    'shiftLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_reception_shift_label, '') ELSE '' END,
    'note', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_reception_note, '') ELSE '' END,
    'isOnline', (v_live_names IS NOT NULL) OR (v_has_cfg AND v_cfg.reception_source = 'manual' AND NULLIF(trim(v_cfg.manual_reception_staff_name), '') IS NOT NULL)
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

  RETURN jsonb_build_object('reception', v_reception, 'facilities', v_facilities);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) IS
  'Misafir nabzı ek kartları: resepsiyon görevlisi/vardiya + tesis durumu (kazan, kahvaltı, spa, wifi, hava). Havuz yok.';
