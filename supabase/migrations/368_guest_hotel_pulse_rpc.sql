-- Misafir ana ekranı: canlı otel nabzı (sayılar + oda bazlı aktivite, PII yok)
CREATE OR REPLACE FUNCTION public.get_guest_hotel_pulse(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_now timestamptz := now();
  v_activity_since timestamptz := now() - interval '48 hours';
  v_today date := (timezone('UTC', now()))::date;
  v_total_rooms int := 0;
  v_occupied_rooms int := 0;
  v_guests_in_house int := 0;
  v_check_ins_today int := 0;
  v_check_outs_today int := 0;
  v_total_guests int := 0;
  v_completed_stays int := 0;
  v_contract_approvals int := 0;
  v_active_contracts int := 0;
  v_pending_tasks int := 0;
  v_breakfast_today int := 0;
  v_finance_today int := 0;
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

  v_day_start := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_day_end := v_day_start + interval '1 day' - interval '1 millisecond';

  SELECT COUNT(*)::int INTO v_total_rooms FROM public.rooms r WHERE (v_org IS NULL OR r.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_occupied_rooms FROM public.rooms r WHERE r.status = 'occupied' AND (v_org IS NULL OR r.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_guests_in_house FROM public.guests g WHERE g.status = 'checked_in' AND g.room_id IS NOT NULL AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_check_ins_today FROM public.guests g WHERE g.check_in_at IS NOT NULL AND g.check_in_at >= v_day_start AND g.check_in_at <= v_day_end AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_check_outs_today FROM public.guests g WHERE g.check_out_at IS NOT NULL AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_total_guests FROM public.guests g WHERE (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_completed_stays FROM public.guests g WHERE g.check_out_at IS NOT NULL AND (v_org IS NULL OR g.organization_id = v_org);
  SELECT COUNT(*)::int INTO v_contract_approvals FROM public.contract_acceptances ca WHERE (v_org IS NULL OR ca.organization_id = v_org);

  SELECT COUNT(*)::int INTO v_active_contracts
  FROM public.managed_contracts mc
  WHERE mc.status = 'active' AND (v_org IS NULL OR mc.organization_id = v_org);

  SELECT COUNT(*)::int INTO v_pending_tasks
  FROM public.staff_assignments sa
  JOIN public.staff s ON s.id = sa.assigned_staff_id
  WHERE sa.status IN ('pending', 'in_progress')
    AND (v_org IS NULL OR s.organization_id = v_org);

  SELECT COUNT(*)::int INTO v_breakfast_today
  FROM public.breakfast_confirmations bc
  WHERE bc.record_date = v_today AND (v_org IS NULL OR bc.organization_id = v_org);

  SELECT COUNT(*)::int INTO v_finance_today
  FROM public.maliye_audit_logs ml
  WHERE ml.created_at >= v_day_start AND ml.created_at <= v_day_end AND (v_org IS NULL OR ml.organization_id = v_org);

  v_result := jsonb_build_object(
    'stats', jsonb_build_object(
      'guestsInHouse', v_guests_in_house,
      'occupiedRooms', v_occupied_rooms,
      'vacantRooms', GREATEST(0, v_total_rooms - v_occupied_rooms),
      'totalRooms', v_total_rooms,
      'checkInsToday', v_check_ins_today,
      'checkOutsToday', v_check_outs_today
    ),
    'ops', jsonb_build_object(
      'pendingTasks', v_pending_tasks,
      'breakfastToday', v_breakfast_today,
      'financeDocsToday', v_finance_today,
      'activeContracts', v_active_contracts
    ),
    'lifetime', jsonb_build_object(
      'totalGuestsHosted', v_total_guests,
      'completedStays', v_completed_stays,
      'contractApprovals', v_contract_approvals
    ),
    'todayCheckIns', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_in_at IS NOT NULL
          AND g.check_in_at >= v_day_start AND g.check_in_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_in_at DESC
        LIMIT 12
      ) t
    ), '[]'::jsonb),
    'todayCheckOuts', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_out_at IS NOT NULL
          AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at DESC
        LIMIT 12
      ) t
    ), '[]'::jsonb),
    'upcomingCheckOuts', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.status = 'checked_in'
          AND g.check_out_at IS NOT NULL
          AND g.check_out_at >= v_day_start AND g.check_out_at <= v_day_end
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at ASC
        LIMIT 12
      ) t
    ), '[]'::jsonb),
    'lateCheckoutRooms', COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT g.id, rm.room_number, g.check_in_at, g.check_out_at, g.status
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.status = 'checked_in'
          AND g.check_out_at IS NOT NULL
          AND g.check_out_at < v_now
          AND (v_org IS NULL OR g.organization_id = v_org)
        ORDER BY g.check_out_at ASC
        LIMIT 8
      ) t
    ), '[]'::jsonb),
    'activities', COALESCE((
      WITH acts AS (
        SELECT 'ci-' || g.id::text AS id, 'check_in'::text AS kind,
          ('Oda ' || COALESCE(rm.room_number, '—') || ' giriş yaptı') AS label,
          g.check_in_at AS created_at
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_in_at IS NOT NULL AND g.check_in_at >= v_activity_since
          AND (v_org IS NULL OR g.organization_id = v_org)
        UNION ALL
        SELECT 'co-' || g.id::text, 'check_out',
          ('Oda ' || COALESCE(rm.room_number, '—') || ' çıkış yaptı'),
          g.check_out_at
        FROM public.guests g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
        WHERE g.check_out_at IS NOT NULL AND g.check_out_at >= v_activity_since
          AND (v_org IS NULL OR g.organization_id = v_org)
        UNION ALL
        SELECT 'ca-' || ca.id::text, 'contract',
          ('Oda ' || COALESCE(rm.room_number, '—') || ' sözleşme onayladı'),
          ca.accepted_at
        FROM public.contract_acceptances ca
        LEFT JOIN public.rooms rm ON rm.id = ca.room_id
        WHERE ca.accepted_at IS NOT NULL AND ca.accepted_at >= v_activity_since
          AND (v_org IS NULL OR ca.organization_id = v_org)
        UNION ALL
        SELECT 'cl-' || sa.id::text, 'cleaning',
          ('Oda ' || COALESCE(rm.room_number, '—') || ' temizliği tamamlandı'),
          sa.completed_at
        FROM public.staff_assignments sa
        LEFT JOIN public.rooms rm ON rm.id = sa.room_ids[1]
        JOIN public.staff s ON s.id = sa.assigned_staff_id
        WHERE sa.status = 'completed' AND sa.completed_at IS NOT NULL AND sa.completed_at >= v_activity_since
          AND (v_org IS NULL OR s.organization_id = v_org)
        UNION ALL
        SELECT 'bf-' || bc.id::text, 'breakfast',
          'Mutfak kahvaltı onayı verdi',
          bc.approved_at
        FROM public.breakfast_confirmations bc
        WHERE bc.approved_at IS NOT NULL AND bc.approved_at >= v_activity_since
          AND (v_org IS NULL OR bc.organization_id = v_org)
        UNION ALL
        SELECT 'fn-' || ml.id::text, 'finance',
          'Maliye evrakı oluştu',
          ml.created_at
        FROM public.maliye_audit_logs ml
        WHERE ml.created_at >= v_activity_since
          AND (v_org IS NULL OR ml.organization_id = v_org)
      )
      SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label, 'created_at', created_at))
      FROM (
        SELECT * FROM acts ORDER BY created_at DESC NULLS LAST LIMIT 16
      ) sorted
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_guest_hotel_pulse(uuid) IS
  'Misafir ana ekranı canlı otel nabzı: doluluk, günlük akış, kurumsal sayılar ve oda bazlı aktiviteler (PII yok).';

GRANT EXECUTE ON FUNCTION public.get_guest_hotel_pulse(uuid) TO authenticated;
