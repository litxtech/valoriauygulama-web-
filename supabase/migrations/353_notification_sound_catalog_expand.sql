-- Admin bildirim sesleri: yeni özellik kategorileri (ensure seed genişletmesi)

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

COMMENT ON FUNCTION public.ensure_notification_sound_settings(uuid) IS
  'Organizasyon için tüm bildirim sesi feature_key kayıtlarını oluşturur (25 kategori).';
