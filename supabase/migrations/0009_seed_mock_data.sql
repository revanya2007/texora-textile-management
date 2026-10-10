-- ============================================================================
-- 0009: SEED REALISTIC TEXTILE MANUFACTURING MOCK DATA
-- Compatible with actual Texora Schema (export_* & domestic_* tables)
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
  -- Grab an admin or current user id for audit foreign keys
  SELECT id INTO v_admin_id FROM profiles LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 1. EXPORT BUYERS
  -- --------------------------------------------------------------------------
  INSERT INTO export_buyers (name, country, contact_person, email, phone, address)
  VALUES 
    ('H&M Hennes & Mauritz AB', 'Sweden', 'Lars Lindqvist', 'lars.l@hm-global.com', '+46 8 796 5500', 'Mäster Samuelsgatan 46A, 106 38 Stockholm, Sweden'),
    ('Inditex / Zara Group', 'Spain', 'Elena Rodriguez', 'elena.r@inditex.es', '+34 981 185 400', 'Av. de la Diputación, Edificio Inditex, 15143 Arteixo, Spain'),
    ('Marks & Spencer plc', 'United Kingdom', 'James Thornton', 'james.t@marksandspencer.co.uk', '+44 20 7935 4422', 'Waterside House, 35 North Wharf Road, London W2 1NW, UK'),
    ('Next Retail Ltd', 'United Kingdom', 'Sarah Jenkins', 'sarah.j@next.co.uk', '+44 333 777 4577', 'Desford Road, Enderby, Leicester LE19 4AT, UK')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_buyer_hm FROM export_buyers WHERE name LIKE 'H&M%' LIMIT 1;
  SELECT id INTO v_buyer_zara FROM export_buyers WHERE name LIKE 'Inditex%' LIMIT 1;
  SELECT id INTO v_buyer_ms FROM export_buyers WHERE name LIKE 'Marks%' LIMIT 1;
  SELECT id INTO v_buyer_next FROM export_buyers WHERE name LIKE 'Next%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 2. EXPORT SUPPLIERS
  -- --------------------------------------------------------------------------
  INSERT INTO export_suppliers (name, contact_person, email, phone, address)
  VALUES 
    ('Vardhman Textiles Ltd', 'Rajesh Sharma', 'sales@vardhman.com', '+91 161 222 2501', 'Chandigarh Road, Ludhiana, Punjab 141010'),
    ('Trident Group Ltd', 'Deepak Verma', 'yarn@tridentindia.com', '+91 161 503 9999', 'Trident Complex, Raikot Road, Barnala, Punjab 148101'),
    ('KPR Mill Limited', 'K. Senthil Nathan', 'exports@kprmill.com', '+91 422 220 7777', 'S.F. No. 9/1, Arasur, Avinashi Road, Coimbatore, Tamil Nadu 641407'),
    ('Nahar Spinning Mills', 'Sunil Aggarwal', 'contact@owmnahar.com', '+91 161 267 6000', '373, Industrial Area A, Ludhiana, Punjab 141003')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_supp_vardhman FROM export_suppliers WHERE name LIKE 'Vardhman%' LIMIT 1;
  SELECT id INTO v_supp_trident FROM export_suppliers WHERE name LIKE 'Trident%' LIMIT 1;
  SELECT id INTO v_supp_kpr FROM export_suppliers WHERE name LIKE 'KPR%' LIMIT 1;
  SELECT id INTO v_supp_nahar FROM export_suppliers WHERE name LIKE 'Nahar%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 3. EXPORT YARN INVENTORY
  -- --------------------------------------------------------------------------
  INSERT INTO export_yarn_inventory (yarn_type, lot_number, quantity_kg)
  VALUES 
    ('30s Combed Organic Cotton', 'LOT-VTM-8821', 7200.00),
    ('40s Compact Supima Cotton', 'LOT-KPR-4002', 5100.00),
    ('2/20s Melange Heather Yarn', 'LOT-TRD-9910', 3600.00),
    ('24s Carded Open-End PolyCotton', 'LOT-NHR-1120', 1800.00)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_yarn_cotton FROM export_yarn_inventory WHERE yarn_type LIKE '30s Combed%' LIMIT 1;
  SELECT id INTO v_yarn_supima FROM export_yarn_inventory WHERE yarn_type LIKE '40s Compact%' LIMIT 1;
  SELECT id INTO v_yarn_melange FROM export_yarn_inventory WHERE yarn_type LIKE '2/20s Melange%' LIMIT 1;
  SELECT id INTO v_yarn_black FROM export_yarn_inventory WHERE yarn_type LIKE '24s Carded%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 4. EXPORT ORDERS
  -- --------------------------------------------------------------------------
  INSERT INTO export_orders (order_number, buyer_name, buyer_id, status, target_completion_date)
  VALUES 
    ('EXP-2026-001', 'Inditex / Zara Group', v_buyer_zara, 'in_production', CURRENT_DATE + INTERVAL '25 days'),
    ('EXP-2026-002', 'H&M Hennes & Mauritz AB', v_buyer_hm, 'in_production', CURRENT_DATE + INTERVAL '35 days'),
    ('EXP-2026-003', 'Marks & Spencer plc', v_buyer_ms, 'ready_for_dispatch', CURRENT_DATE + INTERVAL '12 days'),
    ('EXP-2026-004', 'Next Retail Ltd', v_buyer_next, 'open', CURRENT_DATE + INTERVAL '45 days')
  ON CONFLICT (order_number) DO NOTHING;

  SELECT id INTO v_order_1 FROM export_orders WHERE order_number = 'EXP-2026-001' LIMIT 1;
  SELECT id INTO v_order_2 FROM export_orders WHERE order_number = 'EXP-2026-002' LIMIT 1;
  SELECT id INTO v_order_3 FROM export_orders WHERE order_number = 'EXP-2026-003' LIMIT 1;
  SELECT id INTO v_order_4 FROM export_orders WHERE order_number = 'EXP-2026-004' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 5. EXPORT MACHINES & LOOMS
  -- --------------------------------------------------------------------------
  INSERT INTO export_machines (name, machine_type, status, specifications, location, last_maintenance_date)
  VALUES 
    ('Airjet Loom L-101', 'Airjet Loom', 'active', 'Tsudakoma ZAX-9200i, 230cm Reed Width', 'Weaving Unit 1, Bay A', CURRENT_DATE - INTERVAL '8 days'),
    ('Airjet Loom L-102', 'Airjet Loom', 'active', 'Tsudakoma ZAX-9200i, 230cm Reed Width', 'Weaving Unit 1, Bay A', CURRENT_DATE - INTERVAL '15 days'),
    ('Rapier Loom R-201', 'Rapier Loom', 'maintenance', 'Itema R9500-2, 8-Color Electronic Selector', 'Weaving Unit 2, Bay B', CURRENT_DATE - INTERVAL '1 day'),
    ('Circular Knitting K-301', 'Circular Knitting', 'active', 'Mayer & Cie Relanit 3.2 II, 30 inch / 28 Gauge', 'Knitting Hall 1', CURRENT_DATE - INTERVAL '12 days')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_mach_l101 FROM export_machines WHERE name LIKE 'Airjet Loom L-101%' LIMIT 1;
  SELECT id INTO v_mach_l102 FROM export_machines WHERE name LIKE 'Airjet Loom L-102%' LIMIT 1;
  SELECT id INTO v_mach_r201 FROM export_machines WHERE name LIKE 'Rapier Loom R-201%' LIMIT 1;
  SELECT id INTO v_mach_k301 FROM export_machines WHERE name LIKE 'Circular Knitting K-301%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 6. EXPORT PRODUCTION LOGS
  -- --------------------------------------------------------------------------
  IF v_order_1 IS NOT NULL AND v_mach_l101 IS NOT NULL THEN
    INSERT INTO export_production (order_id, machine_id, production_date, planned_quantity, actual_quantity, shift, fabric_details, unit, status, notes)
    VALUES 
      (v_order_1, v_mach_l101, CURRENT_DATE - INTERVAL '2 days', 1500.00, 1540.00, 'Morning', '100% Organic Cotton Poplin', 'meters', 'completed', 'Smooth run, high efficiency'),
      (v_order_1, v_mach_l101, CURRENT_DATE - INTERVAL '2 days', 1500.00, 1480.00, 'Evening', '100% Organic Cotton Poplin', 'meters', 'completed', 'Minor yarn break on pick 440'),
      (v_order_1, v_mach_l102, CURRENT_DATE - INTERVAL '1 day', 1500.00, 1510.00, 'Morning', '100% Organic Cotton Poplin', 'meters', 'completed', 'Normal operation'),
      (v_order_2, v_mach_k301, CURRENT_DATE - INTERVAL '3 days', 2500.00, 2460.00, 'Morning', 'Heavyweight Combed Single Jersey', 'pieces', 'completed', 'Knitting single jersey batch 1'),
      (v_order_2, v_mach_k301, CURRENT_DATE - INTERVAL '3 days', 2500.00, 2520.00, 'Evening', 'Heavyweight Combed Single Jersey', 'pieces', 'completed', 'Batch 2 completed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- --------------------------------------------------------------------------
  -- 7. QUALITY INSPECTIONS
  -- --------------------------------------------------------------------------
  IF v_order_1 IS NOT NULL THEN
    INSERT INTO export_quality_inspections (order_id, inspection_date, inspected_quantity, accepted_quantity, rejected_quantity, defect_category, defect_notes, is_processed_to_finished_goods, status)
    VALUES 
      (v_order_1, CURRENT_DATE - INTERVAL '1 day', 4500.00, 4420.00, 80.00, 'Broken Picks & Oil Stains', 'Fabric quality Grade-A (18.2 pts/100 sq yd). Minor oil stain on roll #4.', true, 'completed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_order_2 IS NOT NULL THEN
    INSERT INTO export_quality_inspections (order_id, inspection_date, inspected_quantity, accepted_quantity, rejected_quantity, defect_category, defect_notes, is_processed_to_finished_goods, status)
    VALUES 
      (v_order_2, CURRENT_DATE - INTERVAL '2 days', 7400.00, 7280.00, 120.00, 'Uneven Tension / Slub', 'Passed batch inspection with minimal needle line variance.', true, 'completed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- --------------------------------------------------------------------------
  -- 8. FINISHED GOODS INVENTORY
  -- --------------------------------------------------------------------------
  IF v_order_1 IS NOT NULL THEN
    INSERT INTO export_finished_goods (order_id, available_quantity, reserved_quantity, dispatched_quantity, unit)
    VALUES (v_order_1, 10000.00, 0.00, 8000.00, 'meters')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_order_2 IS NOT NULL THEN
    INSERT INTO export_finished_goods (order_id, available_quantity, reserved_quantity, dispatched_quantity, unit)
    VALUES (v_order_2, 16000.00, 0.00, 12000.00, 'pieces')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_order_3 IS NOT NULL THEN
    INSERT INTO export_finished_goods (order_id, available_quantity, reserved_quantity, dispatched_quantity, unit)
    VALUES (v_order_3, 15000.00, 0.00, 0.00, 'pieces')
    ON CONFLICT DO NOTHING;
  END IF;

  -- --------------------------------------------------------------------------
  -- 9. EXPORT DISPATCHES
  -- --------------------------------------------------------------------------
  IF v_order_1 IS NOT NULL THEN
    INSERT INTO export_dispatches (order_id, buyer_id, dispatch_date, quantity, destination, tracking_reference, unit, status, notes)
    VALUES 
      (v_order_1, v_buyer_zara, CURRENT_DATE - INTERVAL '1 day', 8000.00, 'Port of Valencia, Spain', 'BL-MAEU-9920194 (Container MSKU-8829104)', 'meters', 'dispatched', 'Consignment 1 shipped via Maersk Line Logistics')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_order_2 IS NOT NULL THEN
    INSERT INTO export_dispatches (order_id, buyer_id, dispatch_date, quantity, destination, tracking_reference, unit, status, notes)
    VALUES 
      (v_order_2, v_buyer_hm, CURRENT_DATE - INTERVAL '4 days', 12000.00, 'Port of Gothenburg, Sweden', 'BL-MEDU-8819203 (Container MSCU-1192840)', 'pieces', 'dispatched', 'Export Consignment delivered to central DC')
    ON CONFLICT DO NOTHING;
  END IF;

  -- --------------------------------------------------------------------------
  -- 10. EXPORT INVOICES
  -- --------------------------------------------------------------------------
  IF v_order_1 IS NOT NULL THEN
    INSERT INTO export_invoices (order_id, buyer_id, invoice_number, issue_date, due_date, subtotal, tax_amount, total_amount, currency, status, notes)
    VALUES 
      (v_order_1, v_buyer_zara, 'INV-2026-001', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '59 days', 28000.00, 0.00, 28000.00, 'USD', 'unpaid', 'Commercial Export Invoice for Lot 1 - Poplin 8000 Mtr')
    ON CONFLICT (invoice_number) DO NOTHING;
  END IF;

  IF v_order_2 IS NOT NULL THEN
    INSERT INTO export_invoices (order_id, buyer_id, invoice_number, issue_date, due_date, subtotal, tax_amount, total_amount, currency, status, notes)
    VALUES 
      (v_order_2, v_buyer_hm, 'INV-2026-002', CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE + INTERVAL '26 days', 42000.00, 0.00, 42000.00, 'USD', 'paid', 'Export Consignment Invoice for 12,000 Pcs Single Jersey')
    ON CONFLICT (invoice_number) DO NOTHING;
  END IF;

  -- --------------------------------------------------------------------------
  -- 11. DOMESTIC COMPANIES
  -- --------------------------------------------------------------------------
  INSERT INTO domestic_companies (name, contact_person, phone, address, notes, is_active)
  VALUES 
    ('Tirupur Knitwear Processing Pvt Ltd', 'R. Balakrishnan', '+91 98430 12345', '12, College Road, Tirupur - 641602', 'GSTIN: 33AAACT1234F1Z5', true),
    ('Coimbatore Modern Weaving Works', 'S. Natarajan', '+91 94430 54321', '88, Pollachi Road, Coimbatore - 641021', 'GSTIN: 33AABCM9876E1Z2', true),
    ('Erode Processing & Dyeing Mills', 'V. Dharmalingam', '+91 98422 99887', '45, Brough Road, Erode - 638001', 'GSTIN: 33AABCE4567D1Z8', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_dom_co1 FROM domestic_companies WHERE name LIKE 'Tirupur Knitwear%' LIMIT 1;
  SELECT id INTO v_dom_co2 FROM domestic_companies WHERE name LIKE 'Coimbatore Modern%' LIMIT 1;
  SELECT id INTO v_dom_co3 FROM domestic_companies WHERE name LIKE 'Erode Processing%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 12. DOMESTIC WORK TYPES
  -- --------------------------------------------------------------------------
  INSERT INTO domestic_work_types (name, default_rate)
  VALUES 
    ('Singer Single-Needle Stitching', 4.50),
    ('4-Thread Overlock Edge Binding', 6.00),
    ('Flatlock Bottom & Sleeve Hemming', 7.50),
    ('Collar Rib Attachment & Patchwork', 12.00)
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_wt_singer FROM domestic_work_types WHERE name LIKE 'Singer%' LIMIT 1;
  SELECT id INTO v_wt_overlock FROM domestic_work_types WHERE name LIKE '4-Thread Overlock%' LIMIT 1;
  SELECT id INTO v_wt_flatlock FROM domestic_work_types WHERE name LIKE 'Flatlock%' LIMIT 1;
  SELECT id INTO v_wt_patch FROM domestic_work_types WHERE name LIKE 'Collar Rib%' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 13. DOMESTIC WORK ORDERS
  -- --------------------------------------------------------------------------
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO domestic_work_orders (subcontractor_id, order_number, company_id, work_type_id, assigned_quantity, rate_per_piece, status)
    VALUES 
      (v_admin_id, 'DWO-2026-101', v_dom_co1, v_wt_overlock, 5000, 6.00, 'in_progress'),
      (v_admin_id, 'DWO-2026-102', v_dom_co2, v_wt_singer, 8000, 4.50, 'completed'),
      (v_admin_id, 'DWO-2026-103', v_dom_co3, v_wt_flatlock, 4200, 7.50, 'in_progress')
    ON CONFLICT (order_number) DO NOTHING;
  END IF;

  SELECT id INTO v_dwo_1 FROM domestic_work_orders WHERE order_number = 'DWO-2026-101' LIMIT 1;
  SELECT id INTO v_dwo_2 FROM domestic_work_orders WHERE order_number = 'DWO-2026-102' LIMIT 1;

  -- --------------------------------------------------------------------------
  -- 14. DOMESTIC DELIVERIES & PAYMENTS
  -- --------------------------------------------------------------------------
  IF v_dwo_1 IS NOT NULL AND v_admin_id IS NOT NULL THEN
    INSERT INTO domestic_deliveries (work_order_id, subcontractor_id, quantity, delivery_date)
    VALUES 
      (v_dwo_1, v_admin_id, 2000, CURRENT_DATE - INTERVAL '2 days')
    ON CONFLICT DO NOTHING;

    INSERT INTO domestic_payments (subcontractor_id, work_order_id, amount, payment_date, reference)
    VALUES 
      (v_admin_id, v_dwo_1, 15000.00, CURRENT_DATE - INTERVAL '3 days', 'UTR-HDFC-9928104882 (Advance 50%)')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_dwo_2 IS NOT NULL AND v_admin_id IS NOT NULL THEN
    INSERT INTO domestic_deliveries (work_order_id, subcontractor_id, quantity, delivery_date)
    VALUES 
      (v_dwo_2, v_admin_id, 8000, CURRENT_DATE - INTERVAL '2 days')
    ON CONFLICT DO NOTHING;

    INSERT INTO domestic_payments (subcontractor_id, work_order_id, amount, payment_date, reference)
    VALUES 
      (v_admin_id, v_dwo_2, 36000.00, CURRENT_DATE - INTERVAL '1 day', 'UTR-SBI-7719204910 (Final Settlement)')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;
