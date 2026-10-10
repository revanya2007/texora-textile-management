-- ============================================================================
-- 0013: AI PRODUCTION TIME PREDICTION & LIVE PROGRESS TRACKING
-- Adds production prediction tables for Spinning, Weaving, Dyeing stages.
-- Extends export_machines with stage eligibility and production rate info.
-- ============================================================================

-- 1. Extend export_machines with stage eligibility and capacity info
ALTER TABLE export_machines
  ADD COLUMN IF NOT EXISTS eligible_stages TEXT[] DEFAULT ARRAY['Weaving'],
  ADD COLUMN IF NOT EXISTS capacity_per_hour NUMERIC,
  ADD COLUMN IF NOT EXISTS capacity_unit TEXT DEFAULT 'meters',
  ADD COLUMN IF NOT EXISTS yield_rate NUMERIC DEFAULT 0.95
    CHECK (yield_rate IS NULL OR (yield_rate > 0 AND yield_rate <= 1.0));

-- 2. Core Production Runs table
-- Tracks each active or historical production run for prediction purposes.
-- Reuses export_orders and export_machines — no duplicate tables.
CREATE TABLE IF NOT EXISTS export_production_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES export_orders(id) ON DELETE SET NULL,
  machine_id UUID REFERENCES export_machines(id) ON DELETE SET NULL,

  -- Stage info
  stage TEXT NOT NULL CHECK (stage IN ('Spinning', 'Weaving', 'Dyeing')),
  material_type TEXT NOT NULL DEFAULT 'Cotton',  -- e.g. 'Cotton', 'Polyester Yarn', 'Blended Fabric'

  -- Quantities
  input_quantity_kg NUMERIC NOT NULL CHECK (input_quantity_kg > 0),
  machine_count INTEGER NOT NULL DEFAULT 1 CHECK (machine_count > 0),
  planned_output_quantity NUMERIC,
  actual_output_quantity NUMERIC DEFAULT 0 CHECK (actual_output_quantity >= 0),
  output_unit TEXT NOT NULL DEFAULT 'kg',  -- 'kg', 'meters', 'pieces'

  -- Time tracking
  start_datetime TIMESTAMPTZ NOT NULL,
  planned_end_datetime TIMESTAMPTZ,
  actual_end_datetime TIMESTAMPTZ,
  shift_hours_per_day NUMERIC NOT NULL DEFAULT 8.0
    CHECK (shift_hours_per_day > 0 AND shift_hours_per_day <= 24),

  -- Status and progress
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'delayed', 'cancelled')),
  actual_progress_pct NUMERIC DEFAULT NULL
    CHECK (actual_progress_pct IS NULL OR (actual_progress_pct >= 0 AND actual_progress_pct <= 100)),

  -- Process-specific (Dyeing)
  dyeing_color TEXT,
  dyeing_recipe_id TEXT,

  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_runs_order ON export_production_runs(order_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_machine ON export_production_runs(machine_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_stage ON export_production_runs(stage);
CREATE INDEX IF NOT EXISTS idx_production_runs_status ON export_production_runs(status);

ALTER TABLE export_production_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage production runs" ON export_production_runs;
CREATE POLICY "Export staff manage production runs" ON export_production_runs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- 3. Production Run Events (Pause / Resume / Breakdown / Restart)
-- These events allow accurate remaining-time calculation even after interruptions.
CREATE TABLE IF NOT EXISTS export_production_run_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES export_production_runs(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('pause', 'resume', 'breakdown', 'restart', 'output_log', 'completed')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity_at_event NUMERIC,     -- actual output at time of event (for output_log)
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON export_production_run_events(run_id);

ALTER TABLE export_production_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage run events" ON export_production_run_events;
CREATE POLICY "Export staff manage run events" ON export_production_run_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- 4. Prediction Records (audit trail for each prediction generated)
CREATE TABLE IF NOT EXISTS export_production_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES export_production_runs(id) ON DELETE CASCADE,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Inputs used
  stage TEXT NOT NULL,
  input_quantity_kg NUMERIC NOT NULL,
  machine_count INTEGER NOT NULL,
  historical_rate_kg_per_hour NUMERIC,   -- from historical data, nullable if unavailable
  historical_yield_rate NUMERIC,         -- nullable if unavailable
  shift_hours_per_day NUMERIC NOT NULL,
  prediction_method TEXT NOT NULL DEFAULT 'baseline',  -- 'baseline' | 'historical'

  -- Outputs predicted
  estimated_duration_hours NUMERIC NOT NULL,
  estimated_completion_datetime TIMESTAMPTZ NOT NULL,
  estimated_output_quantity NUMERIC,
  confidence_level TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence_level IN ('low', 'medium', 'high')),
  data_quality_note TEXT,

  -- Evaluation (filled after completion)
  actual_duration_hours NUMERIC,
  prediction_error_hours NUMERIC,

  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_predictions_run_id ON export_production_predictions(run_id);

ALTER TABLE export_production_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export staff manage predictions" ON export_production_predictions;
CREATE POLICY "Export staff manage predictions" ON export_production_predictions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'export_manager', 'export_staff')
    )
  );

-- 5. Stage Production Rate Config (per stage, configurable by admin)
-- Stores baseline production rates for each stage when historical data is insufficient.
CREATE TABLE IF NOT EXISTS export_stage_rate_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('Spinning', 'Weaving', 'Dyeing')),
  material_type TEXT NOT NULL DEFAULT 'Cotton',
  baseline_rate_per_machine_per_hour NUMERIC NOT NULL CHECK (baseline_rate_per_machine_per_hour > 0),
  rate_unit TEXT NOT NULL DEFAULT 'kg',    -- 'kg' or 'meters'
  default_yield_rate NUMERIC NOT NULL DEFAULT 0.95
    CHECK (default_yield_rate > 0 AND default_yield_rate <= 1.0),
  min_historical_runs_required INTEGER NOT NULL DEFAULT 5,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_stage_material UNIQUE (stage, material_type)
);

ALTER TABLE export_stage_rate_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Export managers manage rate config" ON export_stage_rate_config;
CREATE POLICY "Export managers manage rate config" ON export_stage_rate_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'export_manager')
    )
  );

-- 6. Seed default stage rate configs
-- These are conservative illustrative baselines; not hardcoded as universal truth.
-- Admin should update based on actual factory performance.
INSERT INTO export_stage_rate_config
  (stage, material_type, baseline_rate_per_machine_per_hour, rate_unit, default_yield_rate, notes)
VALUES
  ('Spinning', 'Cotton',        1.25, 'kg',     0.93,
   'Baseline: ~10 kg cotton → ~9.3 kg yarn in ~8 hrs on 1 machine. Update with actual rates.'),
  ('Spinning', 'Polyester',     1.50, 'kg',     0.95,
   'Baseline for synthetic fibre. Update with actual rates.'),
  ('Weaving',  'Cotton Yarn',   3.50, 'meters', 0.97,
   'Baseline: air-jet loom at 3.5 m/hr per machine. Update with actual rates.'),
  ('Weaving',  'Blended Yarn',  3.00, 'meters', 0.96,
   'Baseline for blended yarns. Update with actual rates.'),
  ('Dyeing',   'Cotton Fabric', 0.90, 'kg',     0.98,
   'Baseline: batch dyeing ~0.9 kg/hr per machine. Update with actual process durations.'),
  ('Dyeing',   'Polyester Fabric', 1.10, 'kg',  0.97,
   'Baseline for synthetic fabric dyeing. Update with actual rates.')
ON CONFLICT (stage, material_type) DO NOTHING;

-- 7. Useful indexes for prediction queries
CREATE INDEX IF NOT EXISTS idx_production_runs_start ON export_production_runs(start_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_production_predictions_at ON export_production_predictions(predicted_at DESC);
