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
