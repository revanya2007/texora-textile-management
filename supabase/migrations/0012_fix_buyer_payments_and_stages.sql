-- ============================================================================
-- 0012: FIX BUYER PAYMENTS RLS, STAGE TRACKING & INVOICE RECEIPTS
-- ============================================================================

-- 1. Ensure export_buyer_payments has flexible buyer_id resolution
ALTER TABLE export_buyer_payments
  ALTER COLUMN buyer_id DROP NOT NULL;

-- 2. Update RLS policies on export_buyer_payments for all export staff & authenticated users
ALTER TABLE export_buyer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Export managers manage buyer payments" ON export_buyer_payments;
DROP POLICY IF EXISTS "Export staff manage buyer payments" ON export_buyer_payments;
DROP POLICY IF EXISTS "Allow all on export_buyer_payments" ON export_buyer_payments;

CREATE POLICY "Allow all on export_buyer_payments"
  ON export_buyer_payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    ) OR auth.uid() IS NOT NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    ) OR auth.uid() IS NOT NULL
  );

-- 3. Ensure RLS on export_garmenting_stages
ALTER TABLE export_garmenting_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on export_garmenting_stages" ON export_garmenting_stages;

CREATE POLICY "Allow all on export_garmenting_stages"
  ON export_garmenting_stages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    ) OR auth.uid() IS NOT NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    ) OR auth.uid() IS NOT NULL
  );

-- 4. RPC: Record Buyer Invoice Payment
CREATE OR REPLACE FUNCTION public.record_buyer_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_reference TEXT,
  p_notes TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_order RECORD;
  v_buyer_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Get invoice
  SELECT * INTO v_inv FROM public.export_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Resolve buyer_id from invoice or order
  IF v_inv.buyer_id IS NOT NULL THEN
    v_buyer_id := v_inv.buyer_id;
  ELSE
    SELECT buyer_id INTO v_buyer_id FROM public.export_orders WHERE id = v_inv.order_id;
  END IF;

  -- Insert payment record
  INSERT INTO public.export_buyer_payments (
    invoice_id, order_id, buyer_id, amount, payment_date, payment_method, reference, notes, created_by, created_at
  ) VALUES (
    p_invoice_id, v_inv.order_id, v_buyer_id, p_amount, p_payment_date, p_payment_method, p_reference, p_notes, v_user_id, NOW()
  );

  -- Update invoice status
  UPDATE public.export_invoices
  SET status = 'paid', updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$;
