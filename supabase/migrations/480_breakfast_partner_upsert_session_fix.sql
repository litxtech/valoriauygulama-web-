-- Partner kahvaltı kaydı: oturum / profil eşleşmesi ve anlaşılır hata mesajları

BEGIN;

CREATE OR REPLACE FUNCTION public.breakfast_partner_upsert_daily_entry(
  p_record_date date,
  p_guest_count integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_hotel record;
  v_hotel_status text;
  v_unit_price numeric;
  v_line_total numeric;
  v_entry_id uuid;
  v_agreement_id uuid;
  v_title text;
  v_today date;
  v_local_ts timestamp;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli. Çıkış yapıp Partner otel girişinden tekrar oturum açın.';
  END IF;

  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Partner otel profili bulunamadı. Misafir girişi değil, ana sayfadaki Partner otel girişi ile oturum açın.';
  END IF;

  SELECT * INTO v_hotel FROM public.breakfast_partner_hotels h WHERE h.id = v_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner otel kaydı bulunamadı.';
  END IF;

  v_hotel_status := COALESCE(v_hotel.status, 'pending');
  IF v_hotel_status = 'pending' THEN
    RAISE EXCEPTION 'Hesabınız admin onayı bekliyor. Onaydan sonra kayıt girebilirsiniz.';
  END IF;
  IF v_hotel_status = 'suspended' THEN
    RAISE EXCEPTION 'Partner otel hesabınız askıda.';
  END IF;
  IF v_hotel_status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel hesabı aktif değil.';
  END IF;

  v_local_ts := timezone('Europe/Istanbul', now());
  v_today := v_local_ts::date;

  IF p_record_date > v_today + 1 THEN
    RAISE EXCEPTION 'En fazla yarın için ön bildirim yapılabilir.';
  END IF;

  IF p_record_date > v_today THEN
    IF v_local_ts::time >= time '23:59:00' THEN
      RAISE EXCEPTION 'Yarın için kayıt süresi doldu (23:59). Kahvaltı gününde bugün sekmesinden girebilirsiniz.';
    END IF;
  END IF;

  IF p_record_date < v_today - 30 THEN
    RAISE EXCEPTION 'En fazla son 30 gün için kayıt girilebilir.';
  END IF;
  IF p_guest_count IS NULL OR p_guest_count < 0 THEN
    RAISE EXCEPTION 'Kişi sayısı geçersiz.';
  END IF;

  v_unit_price := public.breakfast_partner_resolve_unit_price(v_hotel_id);
  IF p_guest_count > 0 AND COALESCE(v_unit_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Birim fiyat tanımlı değil. Yöneticinizle iletişime geçin.';
  END IF;

  v_line_total := round(p_guest_count * COALESCE(v_unit_price, 0), 2);
  v_title := 'Kahvaltı ' || to_char(p_record_date, 'DD.MM.YYYY') || ' — ' || p_guest_count::text || ' kişi';

  SELECT e.id, e.agreement_id
  INTO v_entry_id, v_agreement_id
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id AND e.record_date = p_record_date;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.breakfast_partner_daily_entries (
      partner_hotel_id, organization_id, record_date, guest_count,
      unit_price_snapshot, line_total, note, created_by_auth_id, updated_by_auth_id
    )
    VALUES (
      v_hotel_id, v_hotel.organization_id, p_record_date, p_guest_count,
      COALESCE(v_unit_price, 0), v_line_total, NULLIF(trim(COALESCE(p_note, '')), ''),
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_entry_id;
  ELSE
    UPDATE public.breakfast_partner_daily_entries
    SET
      guest_count = p_guest_count,
      unit_price_snapshot = COALESCE(v_unit_price, 0),
      line_total = v_line_total,
      note = NULLIF(trim(COALESCE(p_note, '')), ''),
      updated_by_auth_id = auth.uid()
    WHERE id = v_entry_id;
  END IF;

  IF p_guest_count <= 0 OR v_line_total <= 0 THEN
    IF v_agreement_id IS NOT NULL THEN
      UPDATE public.finance_counterparty_agreements
      SET status = 'cancelled', is_active = false, updated_at = now()
      WHERE id = v_agreement_id;
      UPDATE public.breakfast_partner_daily_entries
      SET agreement_id = NULL WHERE id = v_entry_id;
    END IF;
    RETURN v_entry_id;
  END IF;

  IF v_agreement_id IS NULL THEN
    INSERT INTO public.finance_counterparty_agreements (
      organization_id, counterparty_id, title, target_amount,
      started_on, notes, movement_kind, is_active, status
    )
    VALUES (
      v_hotel.organization_id, v_hotel.counterparty_id, v_title, v_line_total,
      p_record_date, NULLIF(trim(COALESCE(p_note, '')), ''), 'income', true, 'open'
    )
    RETURNING id INTO v_agreement_id;

    UPDATE public.breakfast_partner_daily_entries
    SET agreement_id = v_agreement_id
    WHERE id = v_entry_id;
  ELSE
    UPDATE public.finance_counterparty_agreements
    SET
      title = v_title,
      target_amount = v_line_total,
      started_on = p_record_date,
      notes = NULLIF(trim(COALESCE(p_note, '')), ''),
      status = CASE WHEN status = 'cancelled' THEN 'open' ELSE status END,
      is_active = true,
      updated_at = now()
    WHERE id = v_agreement_id;

    PERFORM public.finance_agreement_recalc(v_agreement_id);
  END IF;

  RETURN v_entry_id;
END;
$$;

-- Aktif partner: günlük kayıtları okuyabilsin (pending profil okur ama kayıt giremez)
DROP POLICY IF EXISTS "breakfast_partner_entries_partner" ON public.breakfast_partner_daily_entries;
CREATE POLICY "breakfast_partner_entries_partner" ON public.breakfast_partner_daily_entries
  FOR SELECT TO authenticated
  USING (
    partner_hotel_id = public.breakfast_partner_user_hotel_id()
    AND EXISTS (
      SELECT 1 FROM public.breakfast_partner_hotels h
      WHERE h.id = partner_hotel_id AND h.status = 'active'
    )
  );

COMMIT;
