-- Otel nabzı: toplam nüfus (misafir + aktif personel) — misafir göstergesi
BEGIN;

ALTER TABLE public.hotel_pulse_config
  ADD COLUMN IF NOT EXISTS manual_staff_active integer;

COMMENT ON COLUMN public.hotel_pulse_config.manual_staff_active IS
  'Manuel mod: oteldeki aktif personel sayısı (çevrimiçi şartı yok).';

-- get_guest_hotel_pulse: misafir + personel toplam nüfus alanları
CREATE OR REPLACE FUNCTION public.get_guest_hotel_pulse(p_organization_id uuid DEFAULT NULL)
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
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_now timestamptz := now();
  v_activity_since timestamptz := now() - interval '48 hours';
  v_today date := (timezone('UTC', now()))::date;
  v_live_total_rooms int := 0;
  v_live_occupied int := 0;
  v_live_guests int := 0;
  v_live_check_in int := 0;
  v_live_check_out int := 0;
  v_live_total_guests int := 0;
  v_live_completed int := 0;
  v_live_contracts int := 0;
  v_live_active_contracts int := 0;
  v_live_staff_online int := 0;
  v_live_staff_active int := 0;
  v_live_breakfast int := 0;
  v_live_rooms_ready int := 0;
  v_out_guests int := 0;
  v_out_occupied int := 0;
  v_out_vacant int := 0;
  v_out_total_rooms int := 0;
  v_out_check_in int := 0;
  v_out_check_out int := 0;
  v_out_total_hosted int := 0;
  v_out_completed int := 0;
  v_out_contract_approvals int := 0;
  v_out_staff_online int := 0;
  v_out_staff_active int := 0;
  v_out_total_on_site int := 0;
  v_out_occ_pct int := 0;
  v_out_rooms_ready int := 0;
  v_out_breakfast int := 0;
  v_out_active_contracts int := 0;
  v_brand text := 'Valoria';
  v_enabled boolean := true;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    p_organization_id,
    (SELECT g.organization_id FROM public.guests g WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL ORDER BY g.created_at DESC LIMIT 1),
    (SELECT r.organization_id FROM public.rooms r WHERE r.organization_id IS NOT NULL LIMIT 1)
  ) INTO v_org;

  IF v_org IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.hotel_pulse_config hpc WHERE hpc.organization_id = v_org;
    v_has_cfg := FOUND;
    IF v_has_cfg THEN
      v_brand := COALESCE(NULLIF(trim(v_cfg.brand_name), ''), 'Valoria');
      v_enabled := v_cfg.is_enabled;
    END IF;
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'brandName', v_brand,
      'stats', jsonb_build_object('guestsInHouse', 0, 'staffActive', 0, 'totalOnSite', 0, 'occupiedRooms', 0, 'vacantRooms', 0, 'totalRooms', 0, 'checkInsToday', 0, 'checkOutsToday', 0),
      'ops', jsonb_build_object('staffOnline', 0, 'occupancyPercent', 0, 'roomsReady', 0, 'breakfastServed', 0, 'activeContracts', 0),
      'lifetime', jsonb_build_object('totalGuestsHosted', 0, 'completedStays', 0, 'contractApprovals', 0),
      'todayCheckIns', '[]'::jsonb,
      'todayCheckOuts', '[]'::jsonb,
      'upcomingCheckOuts', '[]'::jsonb,
      'lateCheckoutRooms', '[]'::jsonb,
      'activities', '[]'::jsonb
    );
  END IF;

  v_day_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day_end := v_day_start + interval '1 day' - interval '1 millisecond';

  SELECT COUNT(*)::int INTO v_live_total_rooms FROM public.rooms r WHERE (v_org IS NULL OR r.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_occupied FROM public.rooms r WHERE r.status = 'occupied' AND (v_org IS NULL OR r.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_rooms_ready FROM public.rooms r WHERE r.status = 'available' AND (v_org IS NULL OR r.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_guests FROM public.guests g WHERE g.status = 'checked_in' AND g.room_id IS NOT NULL AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_check_in FROM public.guests g WHERE g.check_in_at IS NOT NULL AND g.check_in_at >= v_day_start AND g.check_in_at <= v_day_end AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_check_out FROM public.guests g WHERE g.check_out_at IS NOT NULL AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_total_guests FROM public.guests g WHERE (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_completed FROM public.guests g WHERE g.check_out_at IS NOT NULL AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_contracts FROM public.contract_acceptances ca WHERE (v_org IS NULL OR ca.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_active_contracts FROM public.managed_contracts mc WHERE mc.status = 'active' AND (v_org IS NULL OR mc.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_staff_online FROM public.staff s WHERE s.is_active = true AND s.is_online = true AND s.deleted_at IS NULL AND (v_org IS NULL OR s.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_staff_active FROM public.staff s WHERE COALESCE(s.is_active, true) = true AND s.deleted_at IS NULL AND (v_org IS NULL OR s.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_live_breakfast FROM public.breakfast_confirmations bc WHERE bc.record_date = v_today AND bc.approved_at IS NOT NULL AND (v_org IS NULL OR bc.organization_id = v_org);

  IF v_has_cfg AND v_cfg.daily_source = 'manual' THEN
    v_out_guests := COALESCE(v_cfg.manual_guests_in_house, v_live_guests);
    v_out_occupied := COALESCE(v_cfg.manual_occupied_rooms, v_live_occupied);
    v_out_vacant := COALESCE(v_cfg.manual_vacant_rooms, GREATEST(0, v_live_total_rooms - v_live_occupied));
    v_out_total_rooms := COALESCE(v_cfg.manual_total_rooms, v_live_total_rooms);
    v_out_check_in := COALESCE(v_cfg.manual_check_ins_today, v_live_check_in);
    v_out_check_out := COALESCE(v_cfg.manual_check_outs_today, v_live_check_out);
  ELSE
    v_out_guests := v_live_guests;
    v_out_occupied := v_live_occupied;
    v_out_vacant := GREATEST(0, v_live_total_rooms - v_live_occupied);
    v_out_total_rooms := v_live_total_rooms;
    v_out_check_in := v_live_check_in;
    v_out_check_out := v_live_check_out;
  END IF;

  IF v_has_cfg AND v_cfg.lifetime_source = 'manual' THEN
    v_out_total_hosted := COALESCE(v_cfg.manual_total_guests_hosted, v_live_total_guests);
    v_out_completed := COALESCE(v_cfg.manual_completed_stays, v_live_completed);
    v_out_contract_approvals := COALESCE(v_cfg.manual_contract_approvals, v_live_contracts);
  ELSE
    v_out_total_hosted := v_live_total_guests;
    v_out_completed := v_live_completed;
    v_out_contract_approvals := v_live_contracts;
  END IF;

  IF v_has_cfg AND v_cfg.ops_source = 'manual' THEN
    v_out_staff_online := COALESCE(v_cfg.manual_staff_online, v_live_staff_online);
    v_out_staff_active := COALESCE(v_cfg.manual_staff_active, v_live_staff_active);
    v_out_occ_pct := COALESCE(v_cfg.manual_occupancy_percent,
      CASE WHEN v_out_total_rooms > 0 THEN ROUND((v_out_occupied::numeric / v_out_total_rooms) * 100)::int ELSE 0 END);
    v_out_rooms_ready := COALESCE(v_cfg.manual_rooms_ready, v_live_rooms_ready);
    v_out_breakfast := COALESCE(v_cfg.manual_breakfast_served, v_live_breakfast);
    v_out_active_contracts := COALESCE(v_cfg.manual_active_contracts, v_live_active_contracts);
  ELSE
    v_out_staff_online := v_live_staff_online;
    v_out_staff_active := v_live_staff_active;
    v_out_occ_pct := CASE WHEN v_out_total_rooms > 0 THEN ROUND((v_out_occupied::numeric / v_out_total_rooms) * 100)::int ELSE 0 END;
    v_out_rooms_ready := v_live_rooms_ready;
    v_out_breakfast := v_live_breakfast;
    v_out_active_contracts := v_live_active_contracts;
  END IF;

  v_out_total_on_site := GREATEST(0, v_out_guests + v_out_staff_active);

  v_result := jsonb_build_object(
    'enabled', true,
    'brandName', v_brand,
    'stats', jsonb_build_object(
      'guestsInHouse', v_out_guests,
      'staffActive', v_out_staff_active,
      'totalOnSite', v_out_total_on_site,
      'occupiedRooms', v_out_occupied,
      'vacantRooms', v_out_vacant,
      'totalRooms', v_out_total_rooms,
      'checkInsToday', v_out_check_in,
      'checkOutsToday', v_out_check_out
    ),
    'ops', jsonb_build_object(
      'staffOnline', v_out_staff_online,
      'occupancyPercent', v_out_occ_pct,
      'roomsReady', v_out_rooms_ready,
      'breakfastServed', v_out_breakfast,
      'activeContracts', v_out_active_contracts
    ),
    'lifetime', jsonb_build_object(
      'totalGuestsHosted', v_out_total_hosted,
      'completedStays', v_out_completed,
      'contractApprovals', v_out_contract_approvals
    ),
    'todayCheckIns', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_in_at IS NOT NULL AND g.check_in_at >= v_day_start AND g.check_in_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_in_at DESC LIMIT 12
      ) t
    ), '[]'::jsonb),
    'todayCheckOuts', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_out_at IS NOT NULL AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at DESC LIMIT 12
      ) t
    ), '[]'::jsonb),
    'upcomingCheckOuts', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.status = 'checked_in' AND g.check_out_at IS NOT NULL
          AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at ASC LIMIT 12
      ) t
    ), '[]'::jsonb),
    'lateCheckoutRooms', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.status = 'checked_in' AND g.check_out_at IS NOT NULL AND g.check_out_at < v_now
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at ASC LIMIT 8
      ) t
    ), '[]'::jsonb),
    'activities', '[]'::jsonb
  );

  IF v_has_cfg AND v_cfg.flow_source = 'manual' THEN
    v_result := jsonb_set(v_result, '{todayCheckIns}', public.hotel_pulse_csv_to_flow_json(v_cfg.manual_flow_check_in_rooms, 'checked_in'));
    v_result := jsonb_set(v_result, '{todayCheckOuts}', public.hotel_pulse_csv_to_flow_json(v_cfg.manual_flow_check_out_rooms, 'checked_out'));
    v_result := jsonb_set(v_result, '{upcomingCheckOuts}', public.hotel_pulse_csv_to_flow_json(v_cfg.manual_flow_upcoming_rooms, 'checked_in'));
    v_result := jsonb_set(v_result, '{lateCheckoutRooms}', public.hotel_pulse_csv_to_flow_json(v_cfg.manual_flow_late_checkout_rooms, 'checked_in'));
  END IF;

  IF NOT v_has_cfg OR v_cfg.activities_source IN ('live', 'both') THEN
    v_result := jsonb_set(
      v_result,
      '{activities}',
      COALESCE((
        WITH acts AS (
          SELECT 'ci-' || g.id::text AS id, 'check_in'::text AS kind,
            ('Oda ' || COALESCE(rm.room_number, '—') || ' giriş yaptı') AS label, g.check_in_at AS created_at
          FROM public.guests g LEFT JOIN public.rooms rm ON rm.id = g.room_id
          WHERE g.check_in_at IS NOT NULL AND g.check_in_at >= v_activity_since AND (v_org IS NULL OR g.organization_id = v_org)
          UNION ALL
          SELECT 'co-' || g.id::text, 'check_out',
            ('Oda ' || COALESCE(rm.room_number, '—') || ' çıkış yaptı'), g.check_out_at
          FROM public.guests g LEFT JOIN public.rooms rm ON rm.id = g.room_id
          WHERE g.check_out_at IS NOT NULL AND g.check_out_at >= v_activity_since AND (v_org IS NULL OR g.organization_id = v_org)
          UNION ALL
          SELECT 'ca-' || ca.id::text, 'contract',
            ('Oda ' || COALESCE(rm.room_number, '—') || ' sözleşme onayladı'), ca.accepted_at
          FROM public.contract_acceptances ca LEFT JOIN public.rooms rm ON rm.id = ca.room_id
          WHERE ca.accepted_at IS NOT NULL AND ca.accepted_at >= v_activity_since AND (v_org IS NULL OR ca.organization_id = v_org)
          UNION ALL
          SELECT 'cl-' || sa.id::text, 'cleaning',
            ('Oda ' || COALESCE(rm.room_number, '—') || ' temizliği tamamlandı'), sa.completed_at
          FROM public.staff_assignments sa
          LEFT JOIN public.rooms rm ON rm.id = sa.room_ids[1]
          JOIN public.staff s ON s.id = sa.assigned_staff_id
          WHERE sa.status = 'completed' AND sa.completed_at IS NOT NULL AND sa.completed_at >= v_activity_since
            AND (v_org IS NULL OR s.organization_id = v_org)
          UNION ALL
          SELECT 'bf-' || bc.id::text, 'breakfast', 'Kahvaltı servisi onaylandı', bc.approved_at
          FROM public.breakfast_confirmations bc
          WHERE bc.approved_at IS NOT NULL AND bc.approved_at >= v_activity_since AND (v_org IS NULL OR bc.organization_id = v_org)
        )
        SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label, 'created_at', created_at))
        FROM (SELECT * FROM acts ORDER BY created_at DESC NULLS LAST LIMIT 16) sorted
      ), '[]'::jsonb)
    );
  END IF;

  IF v_has_cfg AND v_cfg.activities_source IN ('manual', 'both') AND v_org IS NOT NULL THEN
    v_result := jsonb_set(
      v_result,
      '{activities}',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', 'ma-' || a.id::text,
          'kind', a.kind,
          'label', a.label,
          'created_at', a.created_at
        ) ORDER BY a.sort_order, a.created_at DESC)
        FROM public.hotel_pulse_manual_activities a
        WHERE a.organization_id = v_org AND a.is_active = true
      ), '[]'::jsonb) || CASE
        WHEN v_cfg.activities_source = 'both' THEN COALESCE(v_result->'activities', '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_guest_hotel_pulse(uuid) IS
  'Misafir otel nabzı: nüfus (misafir+personel), doluluk, tesis ve canlı aktiviteler.';

COMMIT;
