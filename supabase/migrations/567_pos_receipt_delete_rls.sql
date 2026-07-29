-- POS fişleri: org personeli kendi org kayıtlarını silebilsin (iptal yerine kalıcı silme admin+org)

BEGIN;

DROP POLICY IF EXISTS pos_receipt_invoices_delete ON public.pos_receipt_invoices;
CREATE POLICY pos_receipt_invoices_delete ON public.pos_receipt_invoices
  FOR DELETE TO authenticated
  USING (
    public.staff_is_admin_active()
    OR organization_id = ANY (public.staff_org_ids_for_auth())
  );

COMMIT;
