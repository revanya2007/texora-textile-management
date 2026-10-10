-- ============================================================================
-- EXPORT PORTAL ATOMIC INVENTORY FUNCTIONS (SECURED)
-- ============================================================================

-- Function to safely process a yarn transaction and update inventory atomically
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
  v_user_role TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- 1. Authorization Check
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  
  IF v_user_role NOT IN ('admin', 'export_manager', 'export_staff') THEN
    RAISE EXCEPTION 'Unauthorized: Only export staff can process yarn transactions.';
  END IF;

  -- 2. Validate input
  IF p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_transaction_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type. Must be IN or OUT.';
  END IF;

  -- 3. Lock the row to prevent concurrent modifications
  SELECT quantity_kg INTO v_current_stock
  FROM public.export_yarn_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  -- 4. Check negative stock
  IF p_transaction_type = 'OUT' AND (v_current_stock - p_quantity_kg < 0) THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_current_stock, p_quantity_kg;
  END IF;

  -- 5. Update inventory table
  IF p_transaction_type = 'IN' THEN
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg + p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  ELSE
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg - p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  END IF;

  -- 6. Record transaction ledger
  INSERT INTO public.export_yarn_transactions (
    inventory_id, export_order_id, transaction_type, quantity_kg, notes, created_by
  ) VALUES (
    p_inventory_id, p_order_id, p_transaction_type, p_quantity_kg, p_notes, v_user_id
  );
END;
$$;
