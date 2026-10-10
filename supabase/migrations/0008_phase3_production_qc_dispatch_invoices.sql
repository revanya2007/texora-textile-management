-- ============================================================================
-- 0008: PHASE 3 - PRODUCTION, MACHINES, QC, FINISHED GOODS, DISPATCH & INVOICES
-- ============================================================================

-- 1. Extend Production & Machines Schema
ALTER TABLE export_machines
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS last_maintenance_date DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE export_production
  ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT 'Day',
  ADD COLUMN IF NOT EXISTS fabric_details TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'meters',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Check constraints for production
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_production_quantities_positive'
  ) THEN
    ALTER TABLE export_production
      ADD CONSTRAINT check_production_quantities_positive 
      CHECK (planned_quantity >= 0 AND actual_quantity >= 0);
  END IF;
END $$;

-- 2. Extend Quality Inspections Schema
ALTER TABLE export_quality_inspections
  ADD COLUMN IF NOT EXISTS defect_category TEXT DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS defect_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_processed_to_finished_goods BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Extend Finished Goods Schema & Ledger
ALTER TABLE export_finished_goods
  ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched_quantity NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'meters';

-- Finished Goods Audit Ledger
CREATE TABLE IF NOT EXISTS export_finished_goods_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  finished_goods_id UUID REFERENCES export_finished_goods(id) ON DELETE CASCADE,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  source_type TEXT NOT NULL, -- 'INSPECTION_RECEIPT', 'DISPATCH', 'ADJUSTMENT'
  source_id UUID, -- inspection_id or dispatch_id
  quantity NUMERIC NOT NULL, -- positive for additions, negative for deductions
  balance_after NUMERIC NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_finished_goods_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage finished goods ledger" ON export_finished_goods_ledger;
CREATE POLICY "Export staff manage finished goods ledger" ON export_finished_goods_ledger FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- 4. Extend Dispatches Schema
ALTER TABLE export_dispatches
  ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES export_buyers(id),
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'meters',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'dispatched',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Extend Invoices Schema
ALTER TABLE export_invoices
  ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES export_buyers(id),
  ADD COLUMN IF NOT EXISTS dispatch_id UUID REFERENCES export_dispatches(id),
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- ATOMIC STORED PROCEDURES & SAFEGUARDS
-- ============================================================================

-- Function 1: Atomically receive accepted QC inspection into Finished Goods
CREATE OR REPLACE FUNCTION receive_inspection_to_finished_goods(
  p_inspection_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_inspection RECORD;
  v_fg_id UUID;
  v_current_avail NUMERIC;
  v_new_avail NUMERIC;
  v_caller_role user_role;
BEGIN
  -- 1. Check authorization
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'export_manager', 'export_staff') THEN
    RAISE EXCEPTION 'Unauthorized: User lacks permissions to receive finished goods.';
  END IF;

  -- 2. Lock and retrieve inspection record
  SELECT * INTO v_inspection
  FROM export_quality_inspections
  WHERE id = p_inspection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection record not found.';
  END IF;

  IF v_inspection.is_processed_to_finished_goods THEN
    RAISE EXCEPTION 'Inspection has already been processed to finished goods.';
  END IF;

  IF v_inspection.accepted_quantity <= 0 THEN
    RAISE EXCEPTION 'No accepted quantity to transfer to finished goods.';
  END IF;

  -- 3. Lock or initialize finished goods row for this order
  SELECT id, available_quantity INTO v_fg_id, v_current_avail
  FROM export_finished_goods
  WHERE order_id = v_inspection.order_id
  FOR UPDATE;

  IF v_fg_id IS NULL THEN
    INSERT INTO export_finished_goods (order_id, available_quantity, reserved_quantity, dispatched_quantity, updated_at)
    VALUES (v_inspection.order_id, v_inspection.accepted_quantity, 0, 0, NOW())
    RETURNING id, available_quantity INTO v_fg_id, v_new_avail;
  ELSE
    v_new_avail := v_current_avail + v_inspection.accepted_quantity;
    UPDATE export_finished_goods
    SET available_quantity = v_new_avail,
        updated_at = NOW()
    WHERE id = v_fg_id;
  END IF;

  -- 4. Mark inspection as processed
  UPDATE export_quality_inspections
  SET is_processed_to_finished_goods = true,
      updated_at = NOW()
  WHERE id = p_inspection_id;

  -- 5. Record movement in ledger
  INSERT INTO export_finished_goods_ledger (
    finished_goods_id, order_id, source_type, source_id, quantity, balance_after, notes, created_by
  ) VALUES (
    v_fg_id, v_inspection.order_id, 'INSPECTION_RECEIPT', p_inspection_id, v_inspection.accepted_quantity, v_new_avail, 'Received from QC inspection', auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'finished_goods_id', v_fg_id,
    'order_id', v_inspection.order_id,
    'added_quantity', v_inspection.accepted_quantity,
    'available_quantity', v_new_avail
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function 2: Atomically process dispatch with strict stock validation & deduction
CREATE OR REPLACE FUNCTION process_export_dispatch(
  p_order_id UUID,
  p_quantity NUMERIC,
  p_destination TEXT,
  p_tracking_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_fg RECORD;
  v_order RECORD;
  v_dispatch_id UUID;
  v_new_avail NUMERIC;
  v_new_dispatched NUMERIC;
  v_caller_role user_role;
BEGIN
  -- 1. Check authorization
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'export_manager', 'export_staff') THEN
    RAISE EXCEPTION 'Unauthorized: User lacks permissions to dispatch goods.';
  END IF;

  -- 2. Validate input quantity
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Dispatch quantity must be strictly greater than 0.';
  END IF;

  -- 3. Verify order existence and retrieve buyer
  SELECT * INTO v_order FROM export_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Export order not found.';
  END IF;

  -- 4. Lock finished goods row for update
  SELECT * INTO v_fg
  FROM export_finished_goods
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_fg.available_quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient finished goods inventory. Available: %, Requested: %', 
      COALESCE(v_fg.available_quantity, 0), p_quantity;
  END IF;

  -- 5. Calculate new stock balances
  v_new_avail := v_fg.available_quantity - p_quantity;
  v_new_dispatched := COALESCE(v_fg.dispatched_quantity, 0) + p_quantity;

  -- 6. Update finished goods
  UPDATE export_finished_goods
  SET available_quantity = v_new_avail,
      dispatched_quantity = v_new_dispatched,
      updated_at = NOW()
  WHERE id = v_fg.id;

  -- 7. Insert dispatch record
  INSERT INTO export_dispatches (
    order_id, buyer_id, dispatch_date, quantity, destination, tracking_reference, notes, status
  ) VALUES (
    p_order_id, v_order.buyer_id, CURRENT_DATE, p_quantity, p_destination, p_tracking_reference, p_notes, 'dispatched'
  ) RETURNING id INTO v_dispatch_id;

  -- 8. Record movement in ledger
  INSERT INTO export_finished_goods_ledger (
    finished_goods_id, order_id, source_type, source_id, quantity, balance_after, notes, created_by
  ) VALUES (
    v_fg.id, p_order_id, 'DISPATCH', v_dispatch_id, -p_quantity, v_new_avail, 'Dispatched to ' || p_destination, auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'order_id', p_order_id,
    'dispatched_quantity', p_quantity,
    'remaining_available_stock', v_new_avail
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create useful indexes for high performance
CREATE INDEX IF NOT EXISTS idx_export_production_order ON export_production(order_id);
CREATE INDEX IF NOT EXISTS idx_export_production_machine ON export_production(machine_id);
CREATE INDEX IF NOT EXISTS idx_export_quality_order ON export_quality_inspections(order_id);
CREATE INDEX IF NOT EXISTS idx_export_fg_order ON export_finished_goods(order_id);
CREATE INDEX IF NOT EXISTS idx_export_dispatch_order ON export_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_export_invoices_order ON export_invoices(order_id);
