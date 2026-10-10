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
