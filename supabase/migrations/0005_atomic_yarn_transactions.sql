-- ============================================================================
-- EXPORT PORTAL ATOMIC INVENTORY FUNCTIONS
-- ============================================================================

-- Function to safely process a yarn transaction and update inventory atomically
CREATE OR REPLACE FUNCTION process_yarn_transaction(
  p_inventory_id UUID,
  p_order_id UUID,
  p_transaction_type TEXT,
  p_quantity_kg NUMERIC,
  p_notes TEXT,
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock NUMERIC;
BEGIN
  -- Validate transaction type
  IF p_transaction_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type. Must be IN or OUT.';
  END IF;

  -- Lock the row to prevent concurrent modifications
  SELECT quantity_kg INTO v_current_stock
  FROM export_yarn_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  -- Check negative stock
  IF p_transaction_type = 'OUT' AND (v_current_stock - p_quantity_kg < 0) THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_current_stock, p_quantity_kg;
  END IF;

  -- Update inventory table
  IF p_transaction_type = 'IN' THEN
    UPDATE export_yarn_inventory 
    SET quantity_kg = quantity_kg + p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  ELSE
    UPDATE export_yarn_inventory 
    SET quantity_kg = quantity_kg - p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  END IF;

  -- Record transaction ledger
  INSERT INTO export_yarn_transactions (
    inventory_id, export_order_id, transaction_type, quantity_kg, notes, created_by
  ) VALUES (
    p_inventory_id, p_order_id, p_transaction_type, p_quantity_kg, p_notes, p_user_id
  );
END;
$$;
