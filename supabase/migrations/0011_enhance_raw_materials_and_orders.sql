-- ============================================================================
-- 0011: ENHANCE RAW MATERIALS & EXPORT ORDER MANAGEMENT
-- ============================================================================

-- 1. Extend export_orders columns
ALTER TABLE export_orders
  ADD COLUMN IF NOT EXISTS fabric_type TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'meters',
  ADD COLUMN IF NOT EXISTS yarn_requirement_kg NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Extend export_yarn_inventory columns
ALTER TABLE export_yarn_inventory
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS yarn_count TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS unit_price_kg NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_reorder_level NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Ensure RLS policies on export_yarn_inventory
ALTER TABLE export_yarn_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow export staff all on export_yarn_inventory" ON export_yarn_inventory;
CREATE POLICY "Allow export staff all on export_yarn_inventory"
  ON export_yarn_inventory
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

-- 4. Ensure RLS policies on export_yarn_transactions
ALTER TABLE export_yarn_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow export staff all on export_yarn_transactions" ON export_yarn_transactions;
CREATE POLICY "Allow export staff all on export_yarn_transactions"
  ON export_yarn_transactions
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

-- 5. Ensure RLS policies on export_orders
ALTER TABLE export_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow export staff all on export_orders" ON export_orders;
CREATE POLICY "Allow export staff all on export_orders"
  ON export_orders
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

-- 6. RPC: Safe Process Yarn Transaction
CREATE OR REPLACE FUNCTION public.process_yarn_transaction(
  p_inventory_id UUID,
  p_order_id UUID,
  p_transaction_type TEXT,
  p_quantity_kg NUMERIC,
  p_notes TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock NUMERIC;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate input
  IF p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_transaction_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type. Must be IN or OUT.';
  END IF;

  -- Lock row
  SELECT quantity_kg INTO v_current_stock
  FROM public.export_yarn_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  -- Check negative stock
  IF p_transaction_type = 'OUT' AND (v_current_stock - p_quantity_kg < 0) THEN
    RAISE EXCEPTION 'Insufficient stock. Available: % KG, Requested: % KG', v_current_stock, p_quantity_kg;
  END IF;

  -- Update inventory
  IF p_transaction_type = 'IN' THEN
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg + p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  ELSE
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg - p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  END IF;

  -- Record transaction ledger
  INSERT INTO public.export_yarn_transactions (
    inventory_id, export_order_id, transaction_type, quantity_kg, notes, created_by, created_at
  ) VALUES (
    p_inventory_id, p_order_id, p_transaction_type, p_quantity_kg, p_notes, v_user_id, NOW()
  );
END;
$$;
