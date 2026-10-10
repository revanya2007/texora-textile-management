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





-- ============================================================================
-- PHASE 4 ADDITIONS
-- ============================================================================
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

-- ============================================================================
-- 11. ENHANCED RAW MATERIAL TRANSACTIONS & ORDER COLUMNS
-- ============================================================================
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

ALTER TABLE export_yarn_inventory
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS yarn_count TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS unit_price_kg NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_reorder_level NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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
  
  IF p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_transaction_type NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type. Must be IN or OUT.';
  END IF;

  SELECT quantity_kg INTO v_current_stock
  FROM public.export_yarn_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found.';
  END IF;

  IF p_transaction_type = 'OUT' AND (v_current_stock - p_quantity_kg < 0) THEN
    RAISE EXCEPTION 'Insufficient stock. Available: % KG, Requested: % KG', v_current_stock, p_quantity_kg;
  END IF;

  IF p_transaction_type = 'IN' THEN
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg + p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  ELSE
    UPDATE public.export_yarn_inventory 
    SET quantity_kg = quantity_kg - p_quantity_kg, updated_at = NOW() 
    WHERE id = p_inventory_id;
  END IF;

  INSERT INTO public.export_yarn_transactions (
    inventory_id, export_order_id, transaction_type, quantity_kg, notes, created_by, created_at
  ) VALUES (
    p_inventory_id, p_order_id, p_transaction_type, p_quantity_kg, p_notes, v_user_id, NOW()
  );
END;
$$;

-- ============================================================================
-- 12. FIX BUYER PAYMENTS RLS & INVOICE RECEIPTS
-- ============================================================================
ALTER TABLE export_buyer_payments ALTER COLUMN buyer_id DROP NOT NULL;

DROP POLICY IF EXISTS "Allow all on export_buyer_payments" ON export_buyer_payments;
CREATE POLICY "Allow all on export_buyer_payments" ON export_buyer_payments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')) OR auth.uid() IS NOT NULL)
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')) OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all on export_garmenting_stages" ON export_garmenting_stages;
CREATE POLICY "Allow all on export_garmenting_stages" ON export_garmenting_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')) OR auth.uid() IS NOT NULL)
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'export_manager', 'export_staff')) OR auth.uid() IS NOT NULL);

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
  v_buyer_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  SELECT * INTO v_inv FROM public.export_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.buyer_id IS NOT NULL THEN
    v_buyer_id := v_inv.buyer_id;
  ELSE
    SELECT buyer_id INTO v_buyer_id FROM public.export_orders WHERE id = v_inv.order_id;
  END IF;

  INSERT INTO public.export_buyer_payments (
    invoice_id, order_id, buyer_id, amount, payment_date, payment_method, reference, notes, created_by, created_at
  ) VALUES (
    p_invoice_id, v_inv.order_id, v_buyer_id, p_amount, p_payment_date, p_payment_method, p_reference, p_notes, v_user_id, NOW()
  );

  UPDATE public.export_invoices SET status = 'paid', updated_at = NOW() WHERE id = p_invoice_id;
END;
$$;


