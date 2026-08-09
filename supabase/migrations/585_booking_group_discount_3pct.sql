-- Grup rezervasyonu varsayılan indirim: %3 (öğrenci yoksa)

CREATE OR REPLACE FUNCTION public.compute_booking_quote(
  p_list_total NUMERIC,
  p_nights INTEGER,
  p_member_count INTEGER,
  p_student_count INTEGER,
  p_is_student_party BOOLEAN,
  p_audience TEXT DEFAULT NULL,
  p_discount_type TEXT DEFAULT NULL,
  p_discount_value NUMERIC DEFAULT NULL,
  p_min_nights INTEGER DEFAULT 1,
  p_min_members INTEGER DEFAULT 1,
  p_student_extra_percent NUMERIC DEFAULT 0
)
RETURNS TABLE (discount_amount NUMERIC, payable NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_disc NUMERIC := 0;
  v_extra NUMERIC := 0;
  v_ok BOOLEAN := true;
BEGIN
  IF p_list_total IS NULL OR p_list_total <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, coalesce(p_list_total, 0);
    RETURN;
  END IF;

  IF p_discount_type IS NOT NULL AND p_discount_value IS NOT NULL THEN
    IF coalesce(p_nights, 0) < coalesce(p_min_nights, 1) THEN
      v_ok := false;
    END IF;
    IF coalesce(p_member_count, 1) < coalesce(p_min_members, 1) THEN
      v_ok := false;
    END IF;
    IF p_audience = 'student' AND NOT p_is_student_party AND coalesce(p_student_count, 0) < 1 THEN
      v_ok := false;
    END IF;
    IF p_audience = 'group' AND coalesce(p_member_count, 1) < 2 THEN
      v_ok := false;
    END IF;

    IF v_ok THEN
      IF p_discount_type = 'percent' THEN
        v_disc := round(p_list_total * (coalesce(p_discount_value, 0) / 100.0), 2);
      ELSE
        v_disc := least(p_list_total, coalesce(p_discount_value, 0));
      END IF;
      IF coalesce(p_student_extra_percent, 0) > 0
         AND (p_is_student_party OR coalesce(p_student_count, 0) > 0) THEN
        v_extra := round(p_list_total * (p_student_extra_percent / 100.0), 2);
        v_disc := v_disc + v_extra;
      END IF;
    END IF;
  ELSIF p_is_student_party OR coalesce(p_student_count, 0) > 0 THEN
    -- Varsayılan öğrenci indirimi %10
    v_disc := round(p_list_total * 0.10, 2);
  ELSIF coalesce(p_member_count, 1) >= 2 THEN
    -- Varsayılan grup indirimi %3
    v_disc := round(p_list_total * 0.03, 2);
  END IF;

  v_disc := least(p_list_total, greatest(0, v_disc));
  RETURN QUERY SELECT v_disc, greatest(0, p_list_total - v_disc);
END;
$$;

-- Eski GRUP15 seed'ini %3 ile hizala (varsa)
UPDATE public.booking_campaigns
SET
  name = 'Grup %3',
  discount_value = 3,
  min_members = 2,
  updated_at = now()
WHERE code = 'GRUP15';
