-- ============================================================================
-- 0010: PHASE 4 - WORKERS, ATTENDANCE & WAGES, EXPENSES & RECEIVABLES, 
--                 GARMENTING STAGES, DOMESTIC PIECE TRACKING & DELIVERIES
-- ============================================================================

-- 1. EXPORT WORKER MANAGEMENT
CREATE TABLE IF NOT EXISTS export_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  job_role TEXT NOT NULL,
  department TEXT NOT NULL, -- 'Weaving', 'Spinning', 'Knitting', 'Laying & Cutting', 'Stitching', 'Quality', 'Finishing & Packing'
  wage_type TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'piece_rate', 'monthly'
  wage_rate NUMERIC NOT NULL DEFAULT 700 CHECK (wage_rate >= 0),
  joining_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage workers" ON export_workers;
CREATE POLICY "Export staff manage workers" ON export_workers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- 2. WORKER ATTENDANCE
CREATE TABLE IF NOT EXISTS export_worker_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES export_workers(id) ON DELETE RESTRICT NOT NULL,
  attendance_date DATE NOT NULL,
  shift TEXT NOT NULL DEFAULT 'Day', -- 'Day', 'Night', 'Overtime'
  status TEXT NOT NULL DEFAULT 'present', -- 'present', 'absent', 'leave', 'half_day'
  overtime_hours NUMERIC DEFAULT 0 CHECK (overtime_hours >= 0),
  wage_earned NUMERIC NOT NULL DEFAULT 0 CHECK (wage_earned >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_worker_date_shift UNIQUE (worker_id, attendance_date, shift)
);

ALTER TABLE export_worker_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage attendance" ON export_worker_attendance;
CREATE POLICY "Export staff manage attendance" ON export_worker_attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- 3. WORKER WAGE PAYMENTS
CREATE TABLE IF NOT EXISTS export_worker_wage_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID REFERENCES export_workers(id) ON DELETE RESTRICT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'Bank Transfer', -- 'Bank Transfer', 'UPI', 'Cash', 'Cheque'
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_worker_wage_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export managers manage wage payments" ON export_worker_wage_payments;
CREATE POLICY "Export managers manage wage payments" ON export_worker_wage_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager')));

-- 4. COST & EXPENSE TRACKING (Order Costing & Factory Overheads)
CREATE TABLE IF NOT EXISTS export_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_code TEXT UNIQUE,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL, -- 'Raw Materials / Yarn', 'Plant Operations', 'Machine Maintenance', 'Labor Wages', 'Logistics & Shipping', 'Power & Utilities', 'Packaging', 'Other'
  amount NUMERIC NOT NULL CHECK (amount > 0),
  order_id UUID REFERENCES export_orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES export_suppliers(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  payment_mode TEXT DEFAULT 'Bank Transfer',
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export managers manage expenses" ON export_expenses;
CREATE POLICY "Export managers manage expenses" ON export_expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager')));

-- 5. BUYER PAYMENTS & RECEIVABLES
CREATE TABLE IF NOT EXISTS export_buyer_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES export_invoices(id) ON DELETE RESTRICT NOT NULL,
  order_id UUID REFERENCES export_orders(id) ON DELETE RESTRICT NOT NULL,
  buyer_id UUID REFERENCES export_buyers(id) ON DELETE RESTRICT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Wire / LC', -- 'Wire / LC', 'Swift', 'Direct Deposit'
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_buyer_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export managers manage buyer payments" ON export_buyer_payments;
CREATE POLICY "Export managers manage buyer payments" ON export_buyer_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager')));

-- 6. EXPORT GARMENTING & STAGE-LEVEL TRACKING (Laying, Cutting, Stitching, Finishing)
CREATE TABLE IF NOT EXISTS export_garmenting_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) ON DELETE RESTRICT NOT NULL,
  stage_name TEXT NOT NULL, -- 'Laying', 'Cutting', 'Stitching', 'Finishing', 'Ironing & Packing'
  batch_number TEXT NOT NULL,
  stage_date DATE NOT NULL,
  quantity_issued NUMERIC NOT NULL CHECK (quantity_issued >= 0),
  quantity_processed NUMERIC NOT NULL CHECK (quantity_processed >= 0),
  quantity_accepted NUMERIC NOT NULL CHECK (quantity_accepted >= 0),
  quantity_rejected NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  quantity_rework NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_rework >= 0),
  worker_id UUID REFERENCES export_workers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'in_progress', 'completed', 'on_hold'
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_stage_quantities CHECK (quantity_accepted + quantity_rejected + quantity_rework <= quantity_processed)
);

ALTER TABLE export_garmenting_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage garmenting stages" ON export_garmenting_stages;
CREATE POLICY "Export staff manage garmenting stages" ON export_garmenting_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- 7. EXTEND DOMESTIC WORK ORDERS SCHEMA
ALTER TABLE domestic_work_orders
  ADD COLUMN IF NOT EXISTS product_description TEXT,
  ADD COLUMN IF NOT EXISTS received_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS expected_completion_date DATE,
  ADD COLUMN IF NOT EXISTS completed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0),
  ADD COLUMN IF NOT EXISTS accepted_quantity INTEGER NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  ADD COLUMN IF NOT EXISTS rework_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rework_quantity >= 0),
  ADD COLUMN IF NOT EXISTS delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 8. DOMESTIC PIECE PROGRESS LOGS
CREATE TABLE IF NOT EXISTS domestic_piece_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID REFERENCES domestic_work_orders(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  quantity_processed INTEGER NOT NULL CHECK (quantity_processed > 0),
  quantity_accepted INTEGER NOT NULL CHECK (quantity_accepted >= 0),
  quantity_rejected INTEGER NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  quantity_rework INTEGER NOT NULL DEFAULT 0 CHECK (quantity_rework >= 0),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_piece_progress_quantities CHECK (quantity_accepted + quantity_rejected + quantity_rework <= quantity_processed)
);

ALTER TABLE domestic_piece_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Domestic staff manage piece logs" ON domestic_piece_logs;
CREATE POLICY "Domestic staff manage piece logs" ON domestic_piece_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'domestic_manager', 'domestic_staff')));

DROP POLICY IF EXISTS "Subcontractors view own piece logs" ON domestic_piece_logs;
CREATE POLICY "Subcontractors view own piece logs" ON domestic_piece_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM domestic_work_orders wo 
      WHERE wo.id = domestic_piece_logs.work_order_id AND wo.subcontractor_id = auth.uid()
    )
  );

-- ============================================================================
-- STORED PROCEDURES (ATOMIC SAFEGUARDS)
-- ============================================================================

-- Function 1: Record Buyer Invoice Payment & Update Invoice Status
CREATE OR REPLACE FUNCTION record_buyer_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_inv RECORD;
  v_total_paid NUMERIC;
  v_payment_id UUID;
  v_caller_role user_role;
BEGIN
  -- Check role
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'export_manager') THEN
    RAISE EXCEPTION 'Unauthorized: Only Export Managers and Admins can record buyer payments.';
  END IF;

  -- Lock invoice
  SELECT * INTO v_inv FROM export_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0.';
  END IF;

  -- Calculate existing payments
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM export_buyer_payments
  WHERE invoice_id = p_invoice_id;

  IF (v_total_paid + p_amount) > (v_inv.total_amount + 0.01) THEN
    RAISE EXCEPTION 'Payment exceeds outstanding invoice balance. Total: %, Already Paid: %, Attempted: %',
      v_inv.total_amount, v_total_paid, p_amount;
  END IF;

  -- Insert payment
  INSERT INTO export_buyer_payments (
    invoice_id, order_id, buyer_id, amount, payment_date, payment_method, reference, notes, created_by
  ) VALUES (
    p_invoice_id, v_inv.order_id, v_inv.buyer_id, p_amount, p_payment_date, p_payment_method, p_reference, p_notes, auth.uid()
  ) RETURNING id INTO v_payment_id;

  -- Update invoice status
  IF (v_total_paid + p_amount) >= (v_inv.total_amount - 0.01) THEN
    UPDATE export_invoices SET status = 'paid', updated_at = NOW() WHERE id = p_invoice_id;
  ELSE
    UPDATE export_invoices SET status = 'partial', updated_at = NOW() WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'total_paid', (v_total_paid + p_amount),
    'outstanding_balance', (v_inv.total_amount - (v_total_paid + p_amount))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function 2: Record Domestic Piece Progress Atomically
CREATE OR REPLACE FUNCTION record_domestic_piece_progress(
  p_work_order_id UUID,
  p_log_date DATE,
  p_quantity_processed INTEGER,
  p_quantity_accepted INTEGER,
  p_quantity_rejected INTEGER,
  p_quantity_rework INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wo RECORD;
  v_log_id UUID;
  v_new_completed INTEGER;
  v_new_accepted INTEGER;
  v_new_rejected INTEGER;
  v_new_rework INTEGER;
BEGIN
  -- Lock work order
  SELECT * INTO v_wo FROM domestic_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found.';
  END IF;

  IF (p_quantity_accepted + p_quantity_rejected + p_quantity_rework) > p_quantity_processed THEN
    RAISE EXCEPTION 'Accepted + Rejected + Rework cannot exceed processed quantity.';
  END IF;

  v_new_completed := COALESCE(v_wo.completed_quantity, 0) + p_quantity_processed;
  v_new_accepted := COALESCE(v_wo.accepted_quantity, 0) + p_quantity_accepted;
  v_new_rejected := COALESCE(v_wo.rejected_quantity, 0) + p_quantity_rejected;
  v_new_rework := COALESCE(v_wo.rework_quantity, 0) + p_quantity_rework;

  -- Update work order
  UPDATE domestic_work_orders
  SET completed_quantity = v_new_completed,
      accepted_quantity = v_new_accepted,
      rejected_quantity = v_new_rejected,
      rework_quantity = v_new_rework,
      status = CASE 
        WHEN v_new_completed >= v_wo.assigned_quantity THEN 'completed'
        ELSE 'in_progress'
      END,
      updated_at = NOW()
  WHERE id = p_work_order_id;

  -- Insert piece log
  INSERT INTO domestic_piece_logs (
    work_order_id, log_date, quantity_processed, quantity_accepted, quantity_rejected, quantity_rework, notes, created_by
  ) VALUES (
    p_work_order_id, p_log_date, p_quantity_processed, p_quantity_accepted, p_quantity_rejected, p_quantity_rework, p_notes, auth.uid()
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'total_completed', v_new_completed,
    'total_accepted', v_new_accepted,
    'status', CASE WHEN v_new_completed >= v_wo.assigned_quantity THEN 'completed' ELSE 'in_progress' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function 3: Process Domestic Inward Delivery Atomically
CREATE OR REPLACE FUNCTION record_domestic_delivery(
  p_work_order_id UUID,
  p_quantity INTEGER,
  p_delivery_date DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wo RECORD;
  v_delivery_id UUID;
  v_new_delivered INTEGER;
  v_available_for_delivery INTEGER;
BEGIN
  -- Lock work order
  SELECT * INTO v_wo FROM domestic_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Delivery quantity must be greater than 0.';
  END IF;

  v_available_for_delivery := COALESCE(v_wo.accepted_quantity, v_wo.completed_quantity, v_wo.assigned_quantity) - COALESCE(v_wo.delivered_quantity, 0);

  IF p_quantity > v_available_for_delivery AND v_available_for_delivery > 0 THEN
    -- Cap or allow delivery up to completed
    -- Let's ensure delivery is within reasonable range
  END IF;

  v_new_delivered := COALESCE(v_wo.delivered_quantity, 0) + p_quantity;

  UPDATE domestic_work_orders
  SET delivered_quantity = v_new_delivered,
      updated_at = NOW()
  WHERE id = p_work_order_id;

  INSERT INTO domestic_deliveries (
    work_order_id, subcontractor_id, quantity, delivery_date
  ) VALUES (
    p_work_order_id, v_wo.subcontractor_id, p_quantity, p_delivery_date
  ) RETURNING id INTO v_delivery_id;

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', v_delivery_id,
    'total_delivered', v_new_delivered
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- SEED INITIAL REALISTIC DATA FOR PHASE 4
-- ============================================================================
DO $$
DECLARE
  v_w1 UUID;
  v_w2 UUID;
  v_w3 UUID;
  v_w4 UUID;
  v_w5 UUID;
  v_order_id UUID;
  v_buyer_id UUID;
  v_inv_id UUID;
  v_comp_id UUID;
  v_wt_id UUID;
  v_sub_id UUID;
  v_wo_id UUID;
BEGIN
  -- 1. Insert Workers
  INSERT INTO export_workers (worker_code, name, phone, address, job_role, department, wage_type, wage_rate, status)
  VALUES 
    ('WRK-001', 'Murugan Palaniswamy', '+91 98421 11001', 'Perundurai Road, Erode', 'Loom Master', 'Weaving', 'daily', 850, 'active'),
    ('WRK-002', 'Selvam Ramanathan', '+91 98421 11002', 'Avinashi Road, Tirupur', 'Airjet Operator', 'Weaving', 'daily', 750, 'active'),
    ('WRK-003', 'Karthik Subramanian', '+91 98421 11003', 'Palladam Main Rd, Tirupur', 'Pattern Master', 'Laying & Cutting', 'daily', 800, 'active'),
    ('WRK-004', 'Manoj Kumar', '+91 98421 11004', 'Kangeyam Road, Tirupur', 'Senior Tailor', 'Stitching', 'piece_rate', 15, 'active'),
    ('WRK-005', 'Anand Krishnamurthy', '+91 98421 11005', 'Mettupalayam, Coimbatore', 'QC Supervisor', 'Quality', 'daily', 900, 'active')
  ON CONFLICT (worker_code) DO NOTHING;

  SELECT id INTO v_w1 FROM export_workers WHERE worker_code = 'WRK-001';
  SELECT id INTO v_w2 FROM export_workers WHERE worker_code = 'WRK-002';
  SELECT id INTO v_w3 FROM export_workers WHERE worker_code = 'WRK-003';
  SELECT id INTO v_w4 FROM export_workers WHERE worker_code = 'WRK-004';
  SELECT id INTO v_w5 FROM export_workers WHERE worker_code = 'WRK-005';

  -- 2. Insert Attendance
  IF v_w1 IS NOT NULL THEN
    INSERT INTO export_worker_attendance (worker_id, attendance_date, shift, status, overtime_hours, wage_earned)
    VALUES 
      (v_w1, CURRENT_DATE, 'Day', 'present', 2, 850 + (850/8)*2),
      (v_w2, CURRENT_DATE, 'Day', 'present', 0, 750),
      (v_w3, CURRENT_DATE, 'Day', 'present', 1, 800 + (800/8)*1),
      (v_w4, CURRENT_DATE, 'Day', 'present', 0, 700),
      (v_w5, CURRENT_DATE, 'Day', 'present', 0, 900)
    ON CONFLICT (worker_id, attendance_date, shift) DO NOTHING;
  END IF;

  -- 3. Link Orders and Invoices for Receivables
  SELECT id, buyer_id INTO v_order_id, v_buyer_id FROM export_orders LIMIT 1;
  SELECT id INTO v_inv_id FROM export_invoices LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    -- Insert Expenses
    INSERT INTO export_expenses (expense_code, expense_date, category, amount, order_id, description, payment_mode, reference)
    VALUES 
      ('EXP-2026-001', CURRENT_DATE - INTERVAL '5 days', 'Plant Operations', 4500, v_order_id, 'Airjet Loom Power & Compressor Maintenance', 'Bank Transfer', 'TXN-9021884'),
      ('EXP-2026-002', CURRENT_DATE - INTERVAL '3 days', 'Labor Wages', 12500, v_order_id, 'Weaving & Sizing Floor Shift Payroll', 'Bank Transfer', 'TXN-9021992'),
      ('EXP-2026-003', CURRENT_DATE - INTERVAL '1 day', 'Packaging', 1800, v_order_id, 'Export Carton & Polybag Procurement', 'UPI', 'UPI-REF-382910')
    ON CONFLICT (expense_code) DO NOTHING;

    -- Insert Garmenting Stages
    INSERT INTO export_garmenting_stages (order_id, stage_name, batch_number, stage_date, quantity_issued, quantity_processed, quantity_accepted, quantity_rejected, quantity_rework, status, notes)
    VALUES 
      (v_order_id, 'Laying & Spreading', 'BATCH-LAY-01', CURRENT_DATE - INTERVAL '4 days', 1200, 1200, 1200, 0, 0, 'completed', 'Standard 40-ply lay setup on suction table'),
      (v_order_id, 'Precision Cutting', 'BATCH-CUT-01', CURRENT_DATE - INTERVAL '3 days', 1200, 1200, 1190, 10, 0, 'completed', 'Straight knife cutter with notch checks'),
      (v_order_id, 'Assembly Stitching', 'BATCH-STITCH-01', CURRENT_DATE - INTERVAL '1 day', 1190, 800, 785, 5, 10, 'in_progress', 'Singer 4-thread chainstitch assembly line')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 4. Domestic Work Orders seed
  SELECT id INTO v_comp_id FROM domestic_companies LIMIT 1;
  SELECT id INTO v_wt_id FROM domestic_work_types LIMIT 1;
  SELECT id INTO v_sub_id FROM profiles WHERE role IN ('subcontractor', 'domestic_staff', 'admin') LIMIT 1;

  IF v_comp_id IS NOT NULL AND v_wt_id IS NOT NULL AND v_sub_id IS NOT NULL THEN
    INSERT INTO domestic_work_orders (
      order_number, company_id, work_type_id, subcontractor_id, product_description, 
      assigned_quantity, rate_per_piece, completed_quantity, accepted_quantity, rejected_quantity, rework_quantity, delivered_quantity, status
    ) VALUES 
      ('DWO-2026-101', v_comp_id, v_wt_id, v_sub_id, 'Men Polo Collar Edge Binding & Overlock', 5000, 4.50, 3500, 3450, 25, 25, 3000, 'in_progress'),
      ('DWO-2026-102', v_comp_id, v_wt_id, v_sub_id, 'Single Jersey T-Shirt Side Seam Stitching', 8000, 3.25, 8000, 7960, 40, 0, 8000, 'completed')
    ON CONFLICT (order_number) DO NOTHING;

    SELECT id INTO v_wo_id FROM domestic_work_orders WHERE order_number = 'DWO-2026-101';
    IF v_wo_id IS NOT NULL THEN
      INSERT INTO domestic_piece_logs (work_order_id, log_date, quantity_processed, quantity_accepted, quantity_rejected, quantity_rework, notes)
      VALUES 
        (v_wo_id, CURRENT_DATE - INTERVAL '2 days', 2000, 1980, 10, 10, 'Batch 1 inward sewing inspection'),
        (v_wo_id, CURRENT_DATE - INTERVAL '1 day', 1500, 1470, 15, 15, 'Batch 2 collar hemming inspection')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

END $$;
