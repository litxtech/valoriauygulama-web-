-- Mutfak hasılat/gider girildiğinde mutfak ekibine bildirim + admin ses kataloğu

BEGIN;

-- Mutfak operasyon bildirim alıcıları (eksik listesi ile aynı hedef)
CREATE OR REPLACE FUNCTION public.staff_ids_kitchen_ops_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = s.auth_id)
      OR s.role = 'admin'
      OR (s.app_permissions->>'gorev_ata')::boolean IS TRUE
      OR (s.app_permissions->>'mutfak_operasyon')::boolean IS TRUE
      OR lower(coalesce(s.department, '')) IN (
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.notify_kitchen_finance_entry(
  p_kind text,
  p_record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_created_by uuid;
  v_amount numeric;
  v_description text;
  v_category text;
  v_entry_date date;
  v_creator_name text;
  v_staff_ids uuid[];
  v_title text;
  v_body text;
  v_notification_type text;
  v_url text;
  v_payload jsonb;
BEGIN
  IF p_kind = 'revenue' THEN
    SELECT r.organization_id, r.created_by, r.amount, r.description, r.entry_date
    INTO v_org_id, v_created_by, v_amount, v_description, v_entry_date
    FROM public.kitchen_revenues r
    WHERE r.id = p_record_id;
    v_notification_type := 'kitchen_revenue_entry';
    v_url := '/staff/kitchen-ops/revenue';
    v_title := 'Yeni hasılat kaydı';
    v_body := coalesce(v_description, 'Hasılat') || ' · ' ||
      trim(to_char(coalesce(v_amount, 0), 'FM999G999G990D00')) || ' ₺';
  ELSIF p_kind = 'expense' THEN
    SELECT e.organization_id, e.created_by, e.amount, e.description, e.category, e.entry_date
    INTO v_org_id, v_created_by, v_amount, v_description, v_category, v_entry_date
    FROM public.kitchen_expenses e
    WHERE e.id = p_record_id;
    v_notification_type := 'kitchen_expense_entry';
    v_url := '/staff/kitchen-ops/expenses';
    v_title := 'Yeni gider kaydı';
    v_body := coalesce(nullif(trim(v_category), ''), nullif(trim(v_description), ''), 'Gider') || ' · ' ||
      trim(to_char(coalesce(v_amount, 0), 'FM999G999G990D00')) || ' ₺';
  ELSE
    RETURN;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(s.full_name, s.email, 'Personel')
  INTO v_creator_name
  FROM public.staff s
  WHERE s.id = v_created_by;

  v_staff_ids := public.staff_ids_kitchen_ops_notify(v_org_id);
  IF v_created_by IS NOT NULL THEN
    v_staff_ids := array_remove(v_staff_ids, v_created_by);
  END IF;

  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_creator_name IS NOT NULL AND length(trim(v_creator_name)) > 0 THEN
    v_body := v_body || E'\n' || 'Giren: ' || v_creator_name;
  END IF;

  v_payload := jsonb_build_object(
    'kind', v_notification_type,
    'notificationType', v_notification_type,
    'notification_type', v_notification_type,
    'feature_key', 'kitchen_finance',
    'url', v_url,
    'entryDate', v_entry_date::text,
    'recordId', p_record_id::text
  );

  INSERT INTO public.notifications (
    staff_id, guest_id, title, body, category, notification_type, data, created_by, sent_via, sent_at
  )
  SELECT sid, NULL, v_title, v_body, 'staff', v_notification_type, v_payload, v_created_by, 'both', now()
  FROM unnest(v_staff_ids) sid;

  PERFORM net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'staffIds', to_jsonb(v_staff_ids),
      'title', v_title,
      'body', left(v_body, 240),
      'data', v_payload
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_kitchen_revenue_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_kitchen_finance_entry('revenue', NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_kitchen_expense_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_kitchen_finance_entry('expense', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_revenue_notify ON public.kitchen_revenues;
CREATE TRIGGER trg_kitchen_revenue_notify
  AFTER INSERT ON public.kitchen_revenues
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_kitchen_revenue_entry();

DROP TRIGGER IF EXISTS trg_kitchen_expense_notify ON public.kitchen_expenses;
CREATE TRIGGER trg_kitchen_expense_notify
  AFTER INSERT ON public.kitchen_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_kitchen_expense_entry();

-- Admin ses kataloğu: mutfak hasılat/gider
CREATE OR REPLACE FUNCTION public.ensure_notification_sound_settings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid := public.current_staff_id();
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Admin yetkisi gerekli';
  END IF;

  INSERT INTO public.notification_sound_settings (
    organization_id, feature_key, title, description,
    ios_push_sound, android_push_sound, android_channel_id, created_by
  )
  VALUES
    (p_organization_id, 'emergency_alert', 'Acil durum', 'Acil durum alarmları', 'emergency_alert.wav', 'emergency_alert.wav', 'valoria_emergency_alert', v_staff),
    (p_organization_id, 'new_task', 'Yeni görev', 'Görev atamaları', 'default', 'default', 'valoria_ns_new_task', v_staff),
    (p_organization_id, 'new_message', 'Mesaj', 'Sohbet bildirimleri', 'default', 'default', 'valoria_ns_new_message', v_staff),
    (p_organization_id, 'announcement', 'Duyuru', 'Duyuru ve kampanya', 'default', 'default', 'valoria_ns_announcement', v_staff),
    (p_organization_id, 'stock_warning', 'Stok uyarısı', 'Stok ve envanter', 'default', 'default', 'valoria_ns_stock_warning', v_staff),
    (p_organization_id, 'kitchen_request', 'Mutfak talebi', 'Mutfak operasyon', 'default', 'default', 'valoria_ns_kitchen_request', v_staff),
    (p_organization_id, 'kitchen_finance', 'Mutfak hasılat / gider', 'Hasılat ve gider kayıtları', 'default', 'default', 'valoria_ns_kitchen_finance', v_staff),
    (p_organization_id, 'reception_request', 'Resepsiyon', 'Misafir talepleri', 'default', 'default', 'valoria_ns_reception_request', v_staff),
    (p_organization_id, 'accounting_document', 'Muhasebe evrakı', 'Muhasebe bildirimleri', 'default', 'default', 'valoria_ns_accounting_document', v_staff),
    (p_organization_id, 'guest_form', 'Misafir formu', 'Sözleşme ve kayıt', 'default', 'default', 'valoria_ns_guest_form', v_staff),
    (p_organization_id, 'kbs_notification', 'KBS / kimlik', 'KBS bildirimleri', 'default', 'default', 'valoria_ns_kbs_notification', v_staff),
    (p_organization_id, 'staff_call', 'Personel çağrısı', 'Uyarı ve çağrılar', 'default', 'default', 'valoria_ns_staff_call', v_staff),
    (p_organization_id, 'social_feed', 'Akış', 'Beğeni ve yorum', 'default', 'default', 'valoria_ns_social_feed', v_staff),
    (p_organization_id, 'smart_ops', 'Operasyon merkezi', 'Smart Ops', 'default', 'default', 'valoria_ns_smart_ops', v_staff),
    (p_organization_id, 'complaint', 'Şikayet / geri bildirim', 'Misafir şikayeti ve personel iç not', 'default', 'default', 'valoria_ns_complaint', v_staff),
    (p_organization_id, 'missing_item', 'Eksik var', 'Eksik eşya bildirimleri', 'default', 'default', 'valoria_ns_missing_item', v_staff),
    (p_organization_id, 'attendance', 'Mesai / devam', 'Devamsızlık ve giriş-çıkış', 'default', 'default', 'valoria_ns_attendance', v_staff),
    (p_organization_id, 'salary', 'Maaş', 'Maaş yatırıldı ve hatırlatma', 'default', 'default', 'valoria_ns_salary', v_staff),
    (p_organization_id, 'expense', 'Gider onayı', 'Gider talebi bildirimleri', 'default', 'default', 'valoria_ns_expense', v_staff),
    (p_organization_id, 'report_status', 'Tutanak / rapor', 'Rapor durum güncellemeleri', 'default', 'default', 'valoria_ns_report_status', v_staff),
    (p_organization_id, 'shift_leave', 'Vardiya / izin', 'Vardiya ve izin bildirimleri', 'default', 'default', 'valoria_ns_shift_leave', v_staff),
    (p_organization_id, 'permission_update', 'Yetki güncelleme', 'Uygulama izin değişiklikleri', 'default', 'default', 'valoria_ns_permission_update', v_staff),
    (p_organization_id, 'room_cleaning', 'Oda temizlik planı', 'Temizlik planı bildirimleri', 'default', 'default', 'valoria_ns_room_cleaning', v_staff),
    (p_organization_id, 'managed_contract', 'Sözleşme yönetimi', 'İş sözleşmesi imza ve onay', 'default', 'default', 'valoria_ns_managed_contract', v_staff),
    (p_organization_id, 'group_added', 'Gruba eklenme', 'Yeni sohbet grubuna eklendiğinde', 'default', 'default', 'valoria_ns_group_added', v_staff)
  ON CONFLICT (organization_id, feature_key) DO NOTHING;
END;
$$;

COMMIT;
