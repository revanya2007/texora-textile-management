-- Create an enum for user roles
CREATE TYPE user_role AS ENUM (
  'admin',
  'export_manager',
  'export_staff',
  'domestic_manager',
  'domestic_staff',
  'subcontractor'
);

-- Create profiles table linked to auth.users
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role user_role NOT NULL DEFAULT 'domestic_staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. Helper functions to avoid RLS infinite recursion
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profile RLS Policies
CREATE POLICY "Users can read own profile or admin"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile or admin"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- Function to handle new user creation from auth schema
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role user_role;
  raw_role text;
  raw_portal text;
BEGIN
  raw_role := new.raw_user_meta_data->>'role';
  raw_portal := new.raw_user_meta_data->>'portal';
  
  IF raw_role IS NOT NULL AND raw_role IN ('admin', 'export_manager', 'export_staff', 'domestic_manager', 'domestic_staff', 'subcontractor') THEN
    assigned_role := raw_role::user_role;
  ELSIF raw_portal = 'export' THEN
    assigned_role := 'export_staff'::user_role;
  ELSE
    assigned_role := 'domestic_staff'::user_role;
  END IF;

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (
    new.id, 
    new.email, 
    assigned_role,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile when a new auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
-- ============================================================================
-- DOMESTIC PORTAL SCHEMA
-- ============================================================================

-- Work Orders (Domestic)
CREATE TABLE domestic_work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id UUID REFERENCES profiles(id) NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE domestic_work_orders ENABLE ROW LEVEL SECURITY;

-- Domestic managers/staff can read and write all work orders
CREATE POLICY "Domestic staff can manage all work orders"
  ON domestic_work_orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'domestic_manager', 'domestic_staff')
    )
  );

-- Subcontractors can ONLY read their OWN assigned work orders
CREATE POLICY "Subcontractors can view own work orders"
  ON domestic_work_orders
  FOR SELECT
  USING (
    subcontractor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'subcontractor'
    )
  );

-- Deliveries (Domestic)
CREATE TABLE domestic_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID REFERENCES domestic_work_orders(id) ON DELETE CASCADE,
  subcontractor_id UUID REFERENCES profiles(id) NOT NULL,
  quantity INTEGER NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE domestic_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Domestic staff can manage all deliveries"
  ON domestic_deliveries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'domestic_manager', 'domestic_staff')
    )
  );

CREATE POLICY "Subcontractors can view own deliveries"
  ON domestic_deliveries
  FOR SELECT
  USING (
    subcontractor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'subcontractor'
    )
  );


-- ============================================================================
-- EXPORT PORTAL SCHEMA (Yarn Inventory & Orders)
-- ============================================================================

-- Export Orders
CREATE TABLE export_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_orders ENABLE ROW LEVEL SECURITY;

-- Only Export staff/managers can access export orders
CREATE POLICY "Export staff can manage export orders"
  ON export_orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );


-- Yarn Inventory
CREATE TABLE export_yarn_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  yarn_type TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_yarn_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage yarn inventory"
  ON export_yarn_inventory
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );


-- Stock Transactions (History linked to orders)
CREATE TABLE export_yarn_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID REFERENCES export_yarn_inventory(id) NOT NULL,
  export_order_id UUID REFERENCES export_orders(id), -- Optional link to an order
  transaction_type TEXT NOT NULL, -- 'IN' or 'OUT'
  quantity_kg NUMERIC NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_yarn_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage yarn transactions"
  ON export_yarn_transactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );
-- ============================================================================
-- EXPORT PORTAL EXTENDED SCHEMA (Suppliers, Buyers, Production, Dispatch)
-- ============================================================================

-- Export Suppliers
CREATE TABLE export_suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage suppliers"
  ON export_suppliers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- Export Buyers (Different from Suppliers or Domestic Companies)
CREATE TABLE export_buyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  country TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage buyers"
  ON export_buyers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- Extend export_orders to link to buyers
ALTER TABLE export_orders
  ADD COLUMN buyer_id UUID REFERENCES export_buyers(id),
  ADD COLUMN target_completion_date DATE;

-- Production Machines
CREATE TABLE export_machines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  specifications TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage machines"
  ON export_machines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- Production Records
CREATE TABLE export_production (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  machine_id UUID REFERENCES export_machines(id),
  production_date DATE NOT NULL,
  planned_quantity NUMERIC NOT NULL,
  actual_quantity NUMERIC DEFAULT 0,
  worker_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE export_production ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export staff can manage production"
  ON export_production
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );
-- ============================================================================
-- EXPORT PORTAL SCHEMA (Quality, Dispatch, Workers, Accounts)
-- ============================================================================

-- Quality Control
CREATE TABLE export_quality_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  production_id UUID REFERENCES export_production(id),
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES profiles(id),
  inspected_quantity NUMERIC NOT NULL,
  accepted_quantity NUMERIC NOT NULL,
  rejected_quantity NUMERIC NOT NULL,
  defect_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure accepted + rejected doesn't exceed inspected
ALTER TABLE export_quality_inspections
  ADD CONSTRAINT check_quality_quantities CHECK (accepted_quantity + rejected_quantity <= inspected_quantity);

ALTER TABLE export_quality_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Export staff manage quality" ON export_quality_inspections FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- Finished Goods Inventory
CREATE TABLE export_finished_goods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  available_quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE export_finished_goods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Export staff manage finished goods" ON export_finished_goods FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- Dispatch
CREATE TABLE export_dispatches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  dispatch_date DATE NOT NULL,
  quantity NUMERIC NOT NULL,
  destination TEXT NOT NULL,
  tracking_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE export_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Export staff manage dispatches" ON export_dispatches FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')));

-- Invoices
CREATE TABLE export_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE export_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Export staff manage invoices" ON export_invoices FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager')));


-- ============================================================================
-- DOMESTIC PORTAL SCHEMA (Companies, Configurable Work Types)
-- ============================================================================

-- Domestic Companies
CREATE TABLE domestic_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE domestic_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Domestic staff manage companies" ON domestic_companies FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'domestic_manager', 'domestic_staff')));

-- Work Types
CREATE TABLE domestic_work_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- Singer, Overlock, Patalock, Patchlock, etc.
  default_rate NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE domestic_work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Domestic staff manage work types" ON domestic_work_types FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'domestic_manager', 'domestic_staff')));

-- Link domestic work orders to companies and work types
ALTER TABLE domestic_work_orders
  ADD COLUMN company_id UUID REFERENCES domestic_companies(id),
  ADD COLUMN work_type_id UUID REFERENCES domestic_work_types(id),
  ADD COLUMN assigned_quantity INTEGER,
  ADD COLUMN rate_per_piece NUMERIC;

-- Wages and Payments (Domestic)
CREATE TABLE domestic_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id UUID REFERENCES profiles(id) NOT NULL,
  work_order_id UUID REFERENCES domestic_work_orders(id),
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE domestic_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Domestic staff manage payments" ON domestic_payments FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'domestic_manager', 'domestic_staff')));
CREATE POLICY "Subcontractors view own payments" ON domestic_payments FOR SELECT 
  USING (subcontractor_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'subcontractor'));
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

-- ============================================================================
-- PHASE 3: PRODUCTION, QC, FINISHED GOODS & DISPATCH ATOMIC PROCEDURES
-- ============================================================================

-- Function: Atomically receive accepted QC inspection into Finished Goods
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


-- Function: Atomically process dispatch with strict stock validation & deduction
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

-- ============================================================================
-- SEED MOCK DATA (Optional demo data for all modules)
-- ============================================================================
DO $$
DECLARE
  v_admin_id UUID;
  v_buyer_hm UUID;
  v_buyer_zara UUID;
  v_buyer_ms UUID;
  v_buyer_next UUID;

  v_supp_vardhman UUID;
  v_supp_trident UUID;
  v_supp_kpr UUID;
  v_supp_nahar UUID;

  v_yarn_cotton UUID;
  v_yarn_supima UUID;
  v_yarn_melange UUID;
  v_yarn_black UUID;

  v_order_1 UUID;
  v_order_2 UUID;
  v_order_3 UUID;
  v_order_4 UUID;

  v_mach_l101 UUID;
  v_mach_l102 UUID;
  v_mach_r201 UUID;
  v_mach_k301 UUID;

  v_qc_1 UUID;
  v_qc_2 UUID;

  v_dom_co1 UUID;
  v_dom_co2 UUID;
  v_dom_co3 UUID;

  v_wt_singer UUID;
  v_wt_overlock UUID;
  v_wt_flatlock UUID;
  v_wt_patch UUID;

  v_dwo_1 UUID;
  v_dwo_2 UUID;

BEGIN
  SELECT id INTO v_admin_id FROM profiles LIMIT 1;

  -- 1. Export Buyers
  INSERT INTO export_buyers (name, country, contact_person, email, phone, address)
  VALUES 
    ('H&M Hennes & Mauritz AB', 'Sweden', 'Lars Lindqvist', 'lars.l@hm-global.com', '+46 8 796 5500', 'Stockholm, Sweden'),
    ('Inditex / Zara Group', 'Spain', 'Elena Rodriguez', 'elena.r@inditex.es', '+34 981 185 400', 'Arteixo, Spain'),
    ('Marks & Spencer plc', 'United Kingdom', 'James Thornton', 'james.t@marksandspencer.co.uk', '+44 20 7935 4422', 'London, UK'),
    ('Next Retail Ltd', 'United Kingdom', 'Sarah Jenkins', 'sarah.j@next.co.uk', '+44 333 777 4577', 'Leicester, UK')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_buyer_hm FROM export_buyers WHERE name LIKE 'H&M%' LIMIT 1;
  SELECT id INTO v_buyer_zara FROM export_buyers WHERE name LIKE 'Inditex%' LIMIT 1;
  SELECT id INTO v_buyer_ms FROM export_buyers WHERE name LIKE 'Marks%' LIMIT 1;
  SELECT id INTO v_buyer_next FROM export_buyers WHERE name LIKE 'Next%' LIMIT 1;

  -- 2. Export Suppliers
  INSERT INTO export_suppliers (name, contact_person, email, phone, address)
  VALUES 
    ('Vardhman Textiles Ltd', 'Rajesh Sharma', 'sales@vardhman.com', '+91 161 222 2501', 'Ludhiana, Punjab'),
    ('Trident Group Ltd', 'Deepak Verma', 'yarn@tridentindia.com', '+91 161 503 9999', 'Barnala, Punjab'),
    ('KPR Mill Limited', 'K. Senthil Nathan', 'exports@kprmill.com', '+91 422 220 7777', 'Coimbatore, Tamil Nadu'),
    ('Nahar Spinning Mills', 'Sunil Aggarwal', 'contact@owmnahar.com', '+91 161 267 6000', 'Ludhiana, Punjab')
  ON CONFLICT DO NOTHING;

  -- 3. Export Yarn Inventory
  INSERT INTO export_yarn_inventory (yarn_type, lot_number, quantity_kg)
  VALUES 
    ('30s Combed Organic Cotton', 'LOT-VTM-8821', 7200.00),
    ('40s Compact Supima Cotton', 'LOT-KPR-4002', 5100.00),
    ('2/20s Melange Heather Yarn', 'LOT-TRD-9910', 3600.00),
    ('24s Carded Open-End PolyCotton', 'LOT-NHR-1120', 1800.00)
  ON CONFLICT DO NOTHING;

  -- 4. Export Orders
  INSERT INTO export_orders (order_number, buyer_name, buyer_id, status, target_completion_date)
  VALUES 
    ('EXP-2026-001', 'Inditex / Zara Group', v_buyer_zara, 'in_production', CURRENT_DATE + INTERVAL '25 days'),
    ('EXP-2026-002', 'H&M Hennes & Mauritz AB', v_buyer_hm, 'in_production', CURRENT_DATE + INTERVAL '35 days'),
    ('EXP-2026-003', 'Marks & Spencer plc', v_buyer_ms, 'ready_for_dispatch', CURRENT_DATE + INTERVAL '12 days'),
    ('EXP-2026-004', 'Next Retail Ltd', v_buyer_next, 'open', CURRENT_DATE + INTERVAL '45 days')
  ON CONFLICT (order_number) DO NOTHING;

  -- 5. Export Machines
  INSERT INTO export_machines (name, machine_type, status, specifications, location, last_maintenance_date)
  VALUES 
    ('Airjet Loom L-101', 'Airjet Loom', 'active', 'Tsudakoma ZAX-9200i, 230cm Reed Width', 'Weaving Unit 1, Bay A', CURRENT_DATE - INTERVAL '8 days'),
    ('Airjet Loom L-102', 'Airjet Loom', 'active', 'Tsudakoma ZAX-9200i, 230cm Reed Width', 'Weaving Unit 1, Bay A', CURRENT_DATE - INTERVAL '15 days'),
    ('Rapier Loom R-201', 'Rapier Loom', 'maintenance', 'Itema R9500-2, 8-Color Electronic Selector', 'Weaving Unit 2, Bay B', CURRENT_DATE - INTERVAL '1 day'),
    ('Circular Knitting K-301', 'Circular Knitting', 'active', 'Mayer & Cie Relanit 3.2 II, 30 inch', 'Knitting Hall 1', CURRENT_DATE - INTERVAL '12 days')
  ON CONFLICT DO NOTHING;

  -- 6. Domestic Companies
  INSERT INTO domestic_companies (name, contact_person, phone, address, notes, is_active)
  VALUES 
    ('Tirupur Knitwear Processing Pvt Ltd', 'R. Balakrishnan', '+91 98430 12345', 'Tirupur - 641602', 'GSTIN: 33AAACT1234F1Z5', true),
    ('Coimbatore Modern Weaving Works', 'S. Natarajan', '+91 94430 54321', 'Coimbatore - 641021', 'GSTIN: 33AABCM9876E1Z2', true)
  ON CONFLICT DO NOTHING;

  -- 7. Domestic Work Types
  INSERT INTO domestic_work_types (name, default_rate)
  VALUES 
    ('Singer Single-Needle Stitching', 4.50),
    ('4-Thread Overlock Edge Binding', 6.00),
    ('Flatlock Bottom & Sleeve Hemming', 7.50),
    ('Collar Rib Attachment & Patchwork', 12.00)
  ON CONFLICT (name) DO NOTHING;

END $$;



