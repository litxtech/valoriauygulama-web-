-- Tesis durumu: Wi-Fi ağ/şifre, otopark, asansör, restoran, duyuru
ALTER TABLE public.hotel_pulse_config
  ADD COLUMN IF NOT EXISTS manual_wifi_network text DEFAULT 'Valoria',
  ADD COLUMN IF NOT EXISTS manual_wifi_password text DEFAULT 'valoria!',
  ADD COLUMN IF NOT EXISTS manual_parking_label text,
  ADD COLUMN IF NOT EXISTS manual_elevator_label text,
  ADD COLUMN IF NOT EXISTS manual_restaurant_label text,
  ADD COLUMN IF NOT EXISTS manual_announcement_label text;

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
      'wifiNetwork', CASE
        WHEN v_has_cfg AND NULLIF(trim(v_cfg.manual_wifi_network), '') IS NOT NULL THEN trim(v_cfg.manual_wifi_network)
        ELSE 'Valoria'
      END,
      'wifiPassword', CASE
        WHEN v_has_cfg AND NULLIF(trim(v_cfg.manual_wifi_password), '') IS NOT NULL THEN trim(v_cfg.manual_wifi_password)
        ELSE 'valoria!'
      END,
      'parkingLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_parking_label, '') ELSE '' END,
      'elevatorLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_elevator_label, '') ELSE '' END,
      'restaurantLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_restaurant_label, '') ELSE '' END,
      'announcementLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_announcement_label, '') ELSE '' END,
      'weatherLabel', CASE WHEN v_has_cfg THEN COALESCE(v_cfg.manual_weather_label, '') ELSE '' END
    );
  ELSE
    v_facilities := jsonb_build_object(
      'boilerLabel', 'Sıcak su hazır',
      'boilerActive', true,
      'breakfastHours', '',
      'spaLabel', '',
      'wifiStatus', '',
      'wifiNetwork', 'Valoria',
      'wifiPassword', 'valoria!',
      'parkingLabel', '',
      'elevatorLabel', '',
      'restaurantLabel', '',
      'announcementLabel', '',
      'weatherLabel', ''
    );
  END IF;

  RETURN jsonb_build_object('manager', v_manager, 'reception', v_reception, 'facilities', v_facilities);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_hotel_pulse_guest_extras(uuid) IS
  'Misafir nabzı: otel sorumlusu + resepsiyon + tesis durumu (Wi-Fi şifre, otopark, restoran vb.).';
