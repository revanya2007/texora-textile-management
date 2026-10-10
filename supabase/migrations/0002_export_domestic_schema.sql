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
