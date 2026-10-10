import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Badge } from '../../components/ui/Badge';
import {
  Factory,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Info,
  Zap,
  BarChart3,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  type ProductionStage,
  type StageRateConfig,
  type HistoricalRecord,
  type PredictionInput,
  type PredictionOutput,
  type ProgressState,
  computeBaselinePrediction,
  computeHistoricalPrediction,
  computeProgressState,
  formatDurationHours,
  formatDatetime,
} from '../../lib/predictionEngine';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductionRun {
  id: string;
  order_id: string | null;
  machine_id: string | null;
  stage: ProductionStage;
  material_type: string;
  input_quantity_kg: number;
  machine_count: number;
  planned_output_quantity: number | null;
  actual_output_quantity: number;
  output_unit: string;
  start_datetime: string;
  planned_end_datetime: string | null;
  actual_end_datetime: string | null;
  shift_hours_per_day: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'delayed' | 'cancelled';
  actual_progress_pct: number | null;
  dyeing_color?: string;
  notes?: string;
  created_at: string;
  // Joined
  export_orders?: { order_number: string; buyer_name?: string } | null;
  export_machines?: { name: string; machine_type: string; status: string } | null;
}

interface Machine {
  id: string;
  name: string;
  machine_type: string;
  status: string;
  eligible_stages?: string[];
}

interface Order {
  id: string;
  order_number: string;
  buyer_name?: string;
}

interface RunWithPrediction {
  run: ProductionRun;
  prediction: PredictionOutput;
  progress: ProgressState;
}

// ─── Default Stage Rate Configs (fallback if DB not seeded) ───────────────────
const DEFAULT_STAGE_CONFIGS: StageRateConfig[] = [
  {
    stage: 'Spinning', material_type: 'Cotton',
    baseline_rate_per_machine_per_hour: 1.25, rate_unit: 'kg',
    default_yield_rate: 0.93, min_historical_runs_required: 5,
  },
  {
    stage: 'Spinning', material_type: 'Polyester',
    baseline_rate_per_machine_per_hour: 1.50, rate_unit: 'kg',
    default_yield_rate: 0.95, min_historical_runs_required: 5,
  },
  {
    stage: 'Weaving', material_type: 'Cotton Yarn',
    baseline_rate_per_machine_per_hour: 3.50, rate_unit: 'meters',
    default_yield_rate: 0.97, min_historical_runs_required: 5,
  },
  {
    stage: 'Weaving', material_type: 'Blended Yarn',
    baseline_rate_per_machine_per_hour: 3.00, rate_unit: 'meters',
    default_yield_rate: 0.96, min_historical_runs_required: 5,
  },
  {
    stage: 'Dyeing', material_type: 'Cotton Fabric',
    baseline_rate_per_machine_per_hour: 0.90, rate_unit: 'kg',
    default_yield_rate: 0.98, min_historical_runs_required: 5,
  },
  {
    stage: 'Dyeing', material_type: 'Polyester Fabric',
    baseline_rate_per_machine_per_hour: 1.10, rate_unit: 'kg',
    default_yield_rate: 0.97, min_historical_runs_required: 5,
  },
];

const STAGE_MATERIALS: Record<ProductionStage, string[]> = {
  Spinning: ['Cotton', 'Polyester', 'Viscose', 'Blended Fibre'],
  Weaving:  ['Cotton Yarn', 'Blended Yarn', 'Polyester Yarn', 'Wool Yarn'],
  Dyeing:   ['Cotton Fabric', 'Polyester Fabric', 'Blended Fabric', 'Denim Fabric'],
};

const STAGE_COLORS: Record<ProductionStage, string> = {
  Spinning: 'bg-blue-50 text-blue-700 border-blue-200',
  Weaving:  'bg-amber-50 text-amber-700 border-amber-200',
  Dyeing:   'bg-purple-50 text-purple-700 border-purple-200',
};

const STAGE_ICONS: Record<ProductionStage, JSX.Element> = {
  Spinning: <Zap size={15} className="text-blue-500" />,
  Weaving:  <BarChart3 size={15} className="text-amber-500" />,
  Dyeing:   <Factory size={15} className="text-purple-500" />,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ pct, isActual }: { pct: number; isActual: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = isActual
    ? clamped >= 100
      ? 'bg-emerald-500'
      : clamped >= 80
      ? 'bg-primary'
      : 'bg-amber-500'
    : 'bg-blue-300';

  return (
    <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function ConfidencePill({ level }: { level: 'low' | 'medium' | 'high' }) {
  const styles = {
    low:    'bg-red-50 text-red-700 border border-red-200',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    high:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };
  const labels = { low: '⚡ Baseline', medium: '📊 Historical', high: '✓ High Confidence' };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function RunCard({
  rwp,
  onLogEvent,
  onUpdateProgress,
}: {
  rwp: RunWithPrediction;
  onLogEvent: (runId: string, type: string) => void;
  onUpdateProgress: (run: ProductionRun) => void;
}) {
  const { run, prediction, progress } = rwp;

  const statusVariant: Record<string, 'active' | 'pending' | 'completed' | 'delayed' | 'cancelled' | 'rejected' | 'default'> = {
    running: 'active',
    pending: 'pending',
    completed: 'completed',
    delayed: 'delayed',
    paused: 'pending',
    cancelled: 'cancelled',
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${STAGE_COLORS[run.stage]}`}>
                {STAGE_ICONS[run.stage]} {run.stage}
              </span>
              <Badge variant={statusVariant[run.status] || 'default'}>
                {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              </Badge>
              <ConfidencePill level={prediction.confidenceLevel} />
            </div>
            <div className="text-xs text-secondary-text">
              Material: <strong className="text-navy">{run.material_type}</strong>
              {run.export_orders && (
                <> · Order: <strong className="text-navy">{run.export_orders.order_number}</strong></>
              )}
              {run.export_machines && (
                <> · Machine: <strong className="text-navy">{run.export_machines.name}</strong></>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {run.status === 'running' && (
              <Button size="sm" variant="outline" onClick={() => onLogEvent(run.id, 'pause')}>
                <Pause size={13} /> Pause
              </Button>
            )}
            {run.status === 'paused' && (
              <Button size="sm" variant="outline" onClick={() => onLogEvent(run.id, 'resume')}>
                <Play size={13} /> Resume
              </Button>
            )}
            {run.status !== 'completed' && run.status !== 'cancelled' && (
              <Button size="sm" variant="outline" onClick={() => onUpdateProgress(run)}>
                <TrendingUp size={13} /> Update
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-secondary-text">
            <span>{progress.isActual ? 'Actual Progress' : 'Time-Based Estimated Progress'}</span>
            <span className={progress.isActual ? 'text-primary' : 'text-blue-500'}>
              {progress.progressPct.toFixed(1)}%
            </span>
          </div>
          <ProgressBar pct={progress.progressPct} isActual={progress.isActual} />
          {!progress.isActual && progress.progressType !== 'not_started' && (
            <p className="text-[10px] text-blue-500 italic">
              ⚠ Time-based estimate only. Elapsed time ÷ predicted total. Not measured output.
            </p>
          )}
          <p className="text-xs text-secondary-text font-medium">{progress.milestone}</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-soft-mint/40 border border-light-mint">
            <div className="text-[10px] uppercase font-semibold text-secondary-text mb-0.5">Input</div>
            <div className="font-bold text-navy">{run.input_quantity_kg.toLocaleString()} kg</div>
          </div>
          <div className="p-2.5 rounded-lg bg-soft-mint/40 border border-light-mint">
            <div className="text-[10px] uppercase font-semibold text-secondary-text mb-0.5">Machines</div>
            <div className="font-bold text-navy">{run.machine_count}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-soft-mint/40 border border-light-mint">
            <div className="text-[10px] uppercase font-semibold text-secondary-text mb-0.5">Elapsed</div>
            <div className="font-bold text-navy">{formatDurationHours(progress.elapsedHours)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-soft-mint/40 border border-light-mint">
            <div className="text-[10px] uppercase font-semibold text-secondary-text mb-0.5">Shift/Day</div>
            <div className="font-bold text-navy">{run.shift_hours_per_day}h</div>
          </div>
        </div>

        {/* Prediction */}
        <div className="p-3 rounded-xl border border-border bg-background space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-navy">
            <Clock size={13} className="text-primary" />
            Predicted Completion
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-secondary-text text-[10px] uppercase font-semibold">Start</div>
              <div className="font-medium text-navy">{formatDatetime(new Date(run.start_datetime))}</div>
            </div>
            <div>
              <div className="text-secondary-text text-[10px] uppercase font-semibold">Est. Duration</div>
              <div className="font-medium text-navy">
                {formatDurationHours(prediction.estimatedDurationHoursMin)} –{' '}
                {formatDurationHours(prediction.estimatedDurationHoursMax)}
              </div>
            </div>
            <div>
              <div className="text-secondary-text text-[10px] uppercase font-semibold">Est. Completion</div>
              <div className="font-semibold text-primary">{formatDatetime(prediction.estimatedCompletionDatetime)}</div>
            </div>
          </div>
          {prediction.estimatedOutputQuantity != null && (
            <div className="text-xs text-secondary-text">
              Est. Output:{' '}
              <strong className="text-navy">
                {prediction.estimatedOutputQuantity.toFixed(1)} {prediction.estimatedOutputUnit}
              </strong>
              {prediction.yieldRateUsed != null && (
                <span className="ml-1 text-[10px]">
                  (yield: {(prediction.yieldRateUsed * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          )}
          {progress.progressType !== 'not_started' && progress.remainingHours != null && progress.remainingHours > 0 && (
            <div className="text-xs text-secondary-text">
              Remaining: <strong className="text-navy">{formatDurationHours(progress.remainingHours)}</strong>
            </div>
          )}
          {run.status === 'delayed' && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 font-semibold mt-1">
              <AlertTriangle size={13} />
              Run has exceeded estimated completion time
            </div>
          )}
        </div>

        {/* Data quality note */}
        {prediction.insufficientData && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>{prediction.baselineNote}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProductionPredictionsPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stageConfigs, setStageConfigs] = useState<StageRateConfig[]>(DEFAULT_STAGE_CONFIGS);
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Modals
  const [isNewRunModalOpen, setIsNewRunModalOpen] = useState(false);
  const [isUpdateProgressOpen, setIsUpdateProgressOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);

  // New Run form state
  const [newRun, setNewRun] = useState({
    order_id: '',
    machine_id: '',
    stage: 'Spinning' as ProductionStage,
    material_type: 'Cotton',
    input_quantity_kg: 10,
    machine_count: 1,
    start_datetime: new Date().toISOString().slice(0, 16),
    shift_hours_per_day: 8,
    dyeing_color: '',
    notes: '',
  });

  // Progress update form state
  const [progressUpdate, setProgressUpdate] = useState({
    actual_output_quantity: 0,
    actual_progress_pct: '',
    status: 'running',
    notes: '',
  });

  // ─── Prediction Form (standalone) ──────────────────────────────────────────
  const [predFormOpen, setPredFormOpen] = useState(false);
  const [predForm, setPredForm] = useState({
    stage: 'Spinning' as ProductionStage,
    material_type: 'Cotton',
    input_quantity_kg: 10,
    machine_count: 1,
    start_datetime: new Date().toISOString().slice(0, 16),
    shift_hours_per_day: 8,
    actual_progress_pct: '',
    actual_completed_qty: '',
    planned_total_qty: '',
  });
  const [predResult, setPredResult] = useState<{ pred: PredictionOutput; progress: ProgressState } | null>(null);
  const [predLoading, setPredLoading] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // Production Runs
      const { data: runData, error: runErr } = await supabase
        .from('export_production_runs')
        .select('*, export_orders(order_number, buyer_name), export_machines(name, machine_type, status)')
        .order('start_datetime', { ascending: false })
        .limit(50);
      if (runErr) throw runErr;
      setRuns((runData as ProductionRun[]) || []);

      // Machines
      const { data: machineData } = await supabase
        .from('export_machines')
        .select('id, name, machine_type, status, eligible_stages')
        .order('name', { ascending: true });
      setMachines(machineData || []);

      // Orders
      const { data: orderData } = await supabase
        .from('export_orders')
        .select('id, order_number, buyer_name')
        .order('created_at', { ascending: false })
        .limit(100);
      setOrders(orderData || []);

      // Stage Rate Configs from DB
      const { data: configData } = await supabase
        .from('export_stage_rate_config')
        .select('*');
      if (configData && configData.length > 0) {
        setStageConfigs(configData as StageRateConfig[]);
      }

      // Historical data for prediction (completed runs)
      const { data: histData } = await supabase
        .from('export_production_runs')
        .select('stage, material_type, input_quantity_kg, actual_output_quantity, machine_count, start_datetime, actual_end_datetime')
        .eq('status', 'completed')
        .not('actual_end_datetime', 'is', null);

      if (histData) {
        const grouped: Record<string, HistoricalRecord[]> = {};
        for (const r of histData) {
          const key = `${r.stage}::${r.material_type}`;
          if (!grouped[key]) grouped[key] = [];
          const start = new Date(r.start_datetime);
          const end = new Date(r.actual_end_datetime);
          const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          if (durationHours > 0) {
            grouped[key].push({
              input_quantity_kg: Number(r.input_quantity_kg),
              actual_output_quantity: Number(r.actual_output_quantity),
              duration_hours: durationHours,
              machine_count: Number(r.machine_count),
              start_datetime: r.start_datetime,
              actual_end_datetime: r.actual_end_datetime,
            });
          }
        }
        setHistoricalData(grouped);
      }
    } catch (err: any) {
      console.error('Error fetching prediction data:', err);
      // Don't block on DB errors — still show offline mode
      setErrorMessage(
        'Could not load from database. Predictions will use default baseline estimates. ' +
        (err.message || '')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Build prediction for each run ─────────────────────────────────────────
  const runsWithPredictions: RunWithPrediction[] = runs
    .filter((r) => stageFilter === 'All' || r.stage === stageFilter)
    .filter((r) => statusFilter === 'All' || r.status === statusFilter)
    .map((run) => {
      const config =
        stageConfigs.find(
          (c) => c.stage === run.stage && c.material_type === run.material_type
        ) ||
        stageConfigs.find((c) => c.stage === run.stage) ||
        DEFAULT_STAGE_CONFIGS.find((c) => c.stage === run.stage) ||
        DEFAULT_STAGE_CONFIGS[0];

      const histKey = `${run.stage}::${run.material_type}`;
      const histRecords = historicalData[histKey] || [];

      const predInput: PredictionInput = {
        stage: run.stage,
        materialType: run.material_type,
        inputQuantityKg: Number(run.input_quantity_kg),
        machineCount: Number(run.machine_count),
        startDatetime: new Date(run.start_datetime),
        shiftHoursPerDay: Number(run.shift_hours_per_day),
        actualProgressPct: run.actual_progress_pct,
        actualCompletedQuantity:
          run.actual_output_quantity > 0 ? run.actual_output_quantity : null,
        plannedTotalQuantity: run.planned_output_quantity,
      };

      const prediction =
        histRecords.length >= config.min_historical_runs_required
          ? computeHistoricalPrediction(predInput, config, histRecords)
          : computeBaselinePrediction(predInput, config);

      const now =
        run.status === 'completed' && run.actual_end_datetime
          ? new Date(run.actual_end_datetime)
          : new Date();

      const progress = computeProgressState(predInput, prediction, now);

      // Auto-detect delayed status
      if (
        run.status === 'running' &&
        new Date() > prediction.estimatedCompletionDatetime
      ) {
        run.status = 'delayed';
      }

      return { run, prediction, progress };
    });

  // ─── KPI Aggregations ───────────────────────────────────────────────────────
  const activeRuns = runsWithPredictions.filter((r) =>
    ['running', 'pending'].includes(r.run.status)
  );
  const delayedRuns = runsWithPredictions.filter((r) => r.run.status === 'delayed');
  const completedRuns = runsWithPredictions.filter((r) => r.run.status === 'completed');
  const avgProgress =
    runsWithPredictions.length > 0
      ? runsWithPredictions.reduce((a, r) => a + r.progress.progressPct, 0) /
        runsWithPredictions.length
      : 0;

  // Chart data for stage pipeline
  const stageChartData = (['Spinning', 'Weaving', 'Dyeing'] as ProductionStage[]).map((stage) => {
    const stageRuns = runs.filter((r) => r.stage === stage);
    return {
      stage,
      Running: stageRuns.filter((r) => r.status === 'running').length,
      Completed: stageRuns.filter((r) => r.status === 'completed').length,
      Delayed: stageRuns.filter((r) => r.status === 'delayed').length,
      Paused: stageRuns.filter((r) => r.status === 'paused').length,
    };
  });

  // ─── Standalone Predictor ───────────────────────────────────────────────────
  const runStandalonePredict = () => {
    setPredLoading(true);
    try {
      const config =
        stageConfigs.find(
          (c) => c.stage === predForm.stage && c.material_type === predForm.material_type
        ) ||
        stageConfigs.find((c) => c.stage === predForm.stage) ||
        DEFAULT_STAGE_CONFIGS.find((c) => c.stage === predForm.stage)!;

      const histKey = `${predForm.stage}::${predForm.material_type}`;
      const histRecords = historicalData[histKey] || [];

      const input: PredictionInput = {
        stage: predForm.stage,
        materialType: predForm.material_type,
        inputQuantityKg: Number(predForm.input_quantity_kg),
        machineCount: Number(predForm.machine_count),
        startDatetime: new Date(predForm.start_datetime),
        shiftHoursPerDay: Number(predForm.shift_hours_per_day),
        actualProgressPct: predForm.actual_progress_pct
          ? Number(predForm.actual_progress_pct)
          : null,
        actualCompletedQuantity: predForm.actual_completed_qty
          ? Number(predForm.actual_completed_qty)
          : null,
        plannedTotalQuantity: predForm.planned_total_qty
          ? Number(predForm.planned_total_qty)
          : null,
      };

      const prediction =
        histRecords.length >= config.min_historical_runs_required
          ? computeHistoricalPrediction(input, config, histRecords)
          : computeBaselinePrediction(input, config);

      const progress = computeProgressState(input, prediction, new Date());
      setPredResult({ pred: prediction, progress });
    } catch (err: any) {
      setErrorMessage('Prediction error: ' + err.message);
    } finally {
      setPredLoading(false);
    }
  };

  // ─── Save New Run ───────────────────────────────────────────────────────────
  const handleSaveNewRun = async () => {
    if (newRun.input_quantity_kg <= 0) {
      setErrorMessage('Input quantity must be greater than 0.');
      return;
    }
    if (newRun.machine_count < 1) {
      setErrorMessage('Machine count must be at least 1.');
      return;
    }

    const config =
      stageConfigs.find(
        (c) => c.stage === newRun.stage && c.material_type === newRun.material_type
      ) ||
      stageConfigs.find((c) => c.stage === newRun.stage) ||
      DEFAULT_STAGE_CONFIGS.find((c) => c.stage === newRun.stage)!;

    const startDt = new Date(newRun.start_datetime);
    const predInput: PredictionInput = {
      stage: newRun.stage,
      materialType: newRun.material_type,
      inputQuantityKg: newRun.input_quantity_kg,
      machineCount: newRun.machine_count,
      startDatetime: startDt,
      shiftHoursPerDay: newRun.shift_hours_per_day,
    };
    const histKey = `${newRun.stage}::${newRun.material_type}`;
    const histRecords = historicalData[histKey] || [];
    const prediction =
      histRecords.length >= config.min_historical_runs_required
        ? computeHistoricalPrediction(predInput, config, histRecords)
        : computeBaselinePrediction(predInput, config);

    try {
      const { data: insertedRun, error: runErr } = await supabase
        .from('export_production_runs')
        .insert([
          {
            order_id: newRun.order_id || null,
            machine_id: newRun.machine_id || null,
            stage: newRun.stage,
            material_type: newRun.material_type,
            input_quantity_kg: newRun.input_quantity_kg,
            machine_count: newRun.machine_count,
            output_unit: config.rate_unit,
            planned_output_quantity: prediction.estimatedOutputQuantity,
            start_datetime: startDt.toISOString(),
            planned_end_datetime: prediction.estimatedCompletionDatetime.toISOString(),
            shift_hours_per_day: newRun.shift_hours_per_day,
            status: 'running',
            dyeing_color: newRun.dyeing_color || null,
            notes: newRun.notes || null,
          },
        ])
        .select()
        .single();

      if (runErr) throw runErr;

      // Save prediction record
      await supabase.from('export_production_predictions').insert([
        {
          run_id: (insertedRun as any).id,
          stage: newRun.stage,
          input_quantity_kg: newRun.input_quantity_kg,
          machine_count: newRun.machine_count,
          historical_rate_kg_per_hour: prediction.isBaseline
            ? null
            : prediction.ratePerMachinePerHour,
          historical_yield_rate: prediction.yieldRateUsed,
          shift_hours_per_day: newRun.shift_hours_per_day,
          prediction_method: prediction.predictionMethod,
          estimated_duration_hours: prediction.estimatedDurationHours,
          estimated_completion_datetime: prediction.estimatedCompletionDatetime.toISOString(),
          estimated_output_quantity: prediction.estimatedOutputQuantity,
          confidence_level: prediction.confidenceLevel,
          data_quality_note: prediction.dataQualityNote,
        },
      ]);

      setSuccessMessage(`Production run created. Estimated completion: ${formatDatetime(prediction.estimatedCompletionDatetime)}`);
      setIsNewRunModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage('Failed to save production run: ' + err.message);
    }
  };

  // ─── Log Event (pause/resume) ───────────────────────────────────────────────
  const handleLogEvent = async (runId: string, eventType: string) => {
    const newStatus =
      eventType === 'pause' ? 'paused' :
      eventType === 'resume' ? 'running' :
      eventType === 'completed' ? 'completed' : 'running';

    try {
      await supabase
        .from('export_production_run_events')
        .insert([{ run_id: runId, event_type: eventType, event_at: new Date().toISOString() }]);
      await supabase
        .from('export_production_runs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', runId);
      setSuccessMessage(`Run ${eventType === 'pause' ? 'paused' : 'resumed'} successfully.`);
      await fetchData();
    } catch (err: any) {
      setErrorMessage('Failed to log event: ' + err.message);
    }
  };

  // ─── Update Progress ────────────────────────────────────────────────────────
  const handleUpdateProgress = async () => {
    if (!selectedRun) return;
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      status: progressUpdate.status,
    };
    if (progressUpdate.actual_output_quantity > 0) {
      payload.actual_output_quantity = progressUpdate.actual_output_quantity;
    }
    if (progressUpdate.actual_progress_pct !== '') {
      const pct = Number(progressUpdate.actual_progress_pct);
      if (pct >= 0 && pct <= 100) payload.actual_progress_pct = pct;
    }
    if (progressUpdate.status === 'completed') {
      payload.actual_end_datetime = new Date().toISOString();
    }

    try {
      const { error } = await supabase
        .from('export_production_runs')
        .update(payload)
        .eq('id', selectedRun.id);
      if (error) throw error;

      // Log output event
      if (progressUpdate.actual_output_quantity > 0) {
        await supabase.from('export_production_run_events').insert([
          {
            run_id: selectedRun.id,
            event_type: 'output_log',
            event_at: new Date().toISOString(),
            quantity_at_event: progressUpdate.actual_output_quantity,
            notes: progressUpdate.notes,
          },
        ]);
      }

      setSuccessMessage('Progress updated successfully.');
      setIsUpdateProgressOpen(false);
      setSelectedRun(null);
      await fetchData();
    } catch (err: any) {
      setErrorMessage('Failed to update progress: ' + err.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={48} />
        <p className="mt-4 text-secondary-text font-medium">Loading production predictions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Zap className="text-primary" /> AI Production Time Prediction
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Spinning → Weaving → Dyeing · Live progress tracking · Estimated completion
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => fetchData()} className="flex items-center gap-2">
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button variant="outline" onClick={() => { setPredResult(null); setPredFormOpen(true); }} className="flex items-center gap-2">
            <BarChart3 size={15} /> Quick Predict
          </Button>
          <Button onClick={() => setIsNewRunModalOpen(true)} className="flex items-center gap-2">
            <Plus size={15} /> New Run
          </Button>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="p-4 bg-red-50 text-error border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-green-50 text-success border border-green-200 rounded-xl flex items-center gap-2 text-sm">
          <CheckCircle2 size={18} />
          <div className="flex-1">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Active Runs</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{activeRuns.length}</h3>
            </div>
            <div className="p-3 bg-soft-mint rounded-xl text-primary"><Play size={20} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Delayed</p>
              <h3 className="text-2xl font-bold text-orange-600 mt-1">{delayedRuns.length}</h3>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl text-orange-500"><AlertTriangle size={20} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Completed</p>
              <h3 className="text-2xl font-bold text-primary mt-1">{completedRuns.length}</h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 size={20} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Avg Progress</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{avgProgress.toFixed(0)}%</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><TrendingUp size={20} /></div>
          </CardContent>
        </Card>
      </div>

      {/* ── Stage Pipeline Chart ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 size={18} className="text-primary" />
            Stage Pipeline Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {runs.length === 0 ? (
            <div className="py-8 text-center text-secondary-text text-sm">
              <Factory size={36} className="mx-auto mb-2 opacity-20 text-primary" />
              No production runs yet. Create a new run to start tracking.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageChartData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Running" fill="#26965D" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Completed" fill="#3976B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Delayed" fill="#EA580C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Paused" fill="#C58A28" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Filters + Runs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-semibold text-navy">Filter:</span>
        {['All', 'Spinning', 'Weaving', 'Dyeing'].map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              stageFilter === s
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-secondary-text border-border hover:border-primary hover:text-primary'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="text-xs text-secondary-text ml-2">Status:</span>
        {['All', 'running', 'paused', 'delayed', 'completed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              statusFilter === s
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-secondary-text border-border hover:border-primary hover:text-primary'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Run Cards ────────────────────────────────────────────────── */}
      {runsWithPredictions.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-border">
          <Zap size={48} className="mx-auto mb-3 opacity-20 text-primary" />
          <p className="font-semibold text-navy">No production runs found</p>
          <p className="text-sm text-secondary-text mt-1 mb-4">
            Create a new run to start prediction and live tracking.
          </p>
          <Button onClick={() => setIsNewRunModalOpen(true)}>
            <Plus size={15} /> New Production Run
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {runsWithPredictions.map((rwp) => (
            <RunCard
              key={rwp.run.id}
              rwp={rwp}
              onLogEvent={handleLogEvent}
              onUpdateProgress={(run) => {
                setSelectedRun(run);
                setProgressUpdate({
                  actual_output_quantity: run.actual_output_quantity || 0,
                  actual_progress_pct: run.actual_progress_pct?.toString() || '',
                  status: run.status,
                  notes: '',
                });
                setIsUpdateProgressOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL: Quick Predict (Standalone Predictor)
      ───────────────────────────────────────────────────────────────────── */}
      <Modal isOpen={predFormOpen} onClose={() => setPredFormOpen(false)} title="Quick Production Time Predictor">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            This tool calculates a prediction but does not save a production run.
            Results are clearly labelled as baseline or historical estimates.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Stage *</label>
              <select
                value={predForm.stage}
                onChange={(e) => setPredForm({ ...predForm, stage: e.target.value as ProductionStage, material_type: STAGE_MATERIALS[e.target.value as ProductionStage][0] })}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Spinning">Spinning (Cotton → Yarn)</option>
                <option value="Weaving">Weaving (Yarn → Fabric)</option>
                <option value="Dyeing">Dyeing (Fabric → Finished)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Material Type *</label>
              <select
                value={predForm.material_type}
                onChange={(e) => setPredForm({ ...predForm, material_type: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {STAGE_MATERIALS[predForm.stage].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Input Quantity (kg) *"
              type="number"
              min="0.1"
              step="0.1"
              value={predForm.input_quantity_kg}
              onChange={(e) => setPredForm({ ...predForm, input_quantity_kg: Number(e.target.value) })}
            />
            <Input
              label="Number of Machines *"
              type="number"
              min="1"
              step="1"
              value={predForm.machine_count}
              onChange={(e) => setPredForm({ ...predForm, machine_count: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date & Time *"
              type="datetime-local"
              value={predForm.start_datetime}
              onChange={(e) => setPredForm({ ...predForm, start_datetime: e.target.value })}
            />
            <Input
              label="Shift Hours / Day *"
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={predForm.shift_hours_per_day}
              onChange={(e) => setPredForm({ ...predForm, shift_hours_per_day: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Actual Progress % (if known)"
              type="number"
              min="0"
              max="100"
              placeholder="Leave blank if unknown"
              value={predForm.actual_progress_pct}
              onChange={(e) => setPredForm({ ...predForm, actual_progress_pct: e.target.value })}
            />
            <Input
              label="Actual Completed Qty"
              type="number"
              min="0"
              placeholder="Leave blank if unknown"
              value={predForm.actual_completed_qty}
              onChange={(e) => setPredForm({ ...predForm, actual_completed_qty: e.target.value })}
            />
          </div>

          {predForm.actual_completed_qty && (
            <Input
              label="Planned Total Quantity (for % calculation)"
              type="number"
              min="0"
              value={predForm.planned_total_qty}
              onChange={(e) => setPredForm({ ...predForm, planned_total_qty: e.target.value })}
            />
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setPredFormOpen(false)}>Cancel</Button>
            <Button isLoading={predLoading} onClick={runStandalonePredict}>
              <Zap size={15} /> Predict
            </Button>
          </div>

          {/* Prediction Result */}
          {predResult && (
            <div className="p-4 rounded-xl border border-primary/30 bg-soft-mint/30 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-navy text-sm">
                <CheckCircle2 size={16} className="text-primary" />
                Prediction Result
                <ConfidencePill level={predResult.pred.confidenceLevel} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-secondary-text text-[10px] uppercase font-semibold">Est. Duration</div>
                  <div className="font-bold text-navy text-sm">
                    {formatDurationHours(predResult.pred.estimatedDurationHoursMin)} – {formatDurationHours(predResult.pred.estimatedDurationHoursMax)}
                  </div>
                </div>
                <div>
                  <div className="text-secondary-text text-[10px] uppercase font-semibold">Est. Completion</div>
                  <div className="font-bold text-primary text-sm">{formatDatetime(predResult.pred.estimatedCompletionDatetime)}</div>
                </div>
                {predResult.pred.estimatedOutputQuantity != null && (
                  <div>
                    <div className="text-secondary-text text-[10px] uppercase font-semibold">Est. Output</div>
                    <div className="font-bold text-navy text-sm">
                      {predResult.pred.estimatedOutputQuantity.toFixed(2)} {predResult.pred.estimatedOutputUnit}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-secondary-text text-[10px] uppercase font-semibold">Progress</div>
                  <div className="font-bold text-navy text-sm">{predResult.progress.label}</div>
                </div>
              </div>
              {/* Progress bar */}
              <ProgressBar pct={predResult.progress.progressPct} isActual={predResult.progress.isActual} />
              {/* Data quality note */}
              <p className="text-[11px] text-secondary-text leading-relaxed">{predResult.pred.dataQualityNote}</p>
              {predResult.pred.insufficientData && (
                <p className="text-[11px] text-amber-700 italic">{predResult.pred.baselineNote}</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL: New Production Run
      ───────────────────────────────────────────────────────────────────── */}
      <Modal isOpen={isNewRunModalOpen} onClose={() => setIsNewRunModalOpen(false)} title="Create New Production Run">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Production Stage *</label>
              <select
                value={newRun.stage}
                onChange={(e) => setNewRun({
                  ...newRun,
                  stage: e.target.value as ProductionStage,
                  material_type: STAGE_MATERIALS[e.target.value as ProductionStage][0],
                })}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Spinning">Spinning (Cotton → Yarn)</option>
                <option value="Weaving">Weaving (Yarn → Fabric)</option>
                <option value="Dyeing">Dyeing (Fabric → Finished)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-navy">Material Type *</label>
              <select
                value={newRun.material_type}
                onChange={(e) => setNewRun({ ...newRun, material_type: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {STAGE_MATERIALS[newRun.stage].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Export Order (Optional)</label>
            <select
              value={newRun.order_id}
              onChange={(e) => setNewRun({ ...newRun, order_id: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">No Order Linked</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.order_number} — {o.buyer_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">
              Machine Assignment
              {newRun.stage === 'Spinning' && <span className="ml-1 text-xs text-secondary-text">(Spinning machines only)</span>}
            </label>
            <select
              value={newRun.machine_id}
              onChange={(e) => setNewRun({ ...newRun, machine_id: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">No Machine Assigned</option>
              {machines
                .filter((m) => m.status !== 'maintenance' && m.status !== 'inactive')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.machine_type}) — {m.status}
                  </option>
                ))}
            </select>
            {machines.some((m) => m.status === 'maintenance') && (
              <p className="text-[11px] text-amber-600">
                ⚠ {machines.filter((m) => m.status === 'maintenance').length} machine(s) under maintenance are excluded.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Input Quantity (kg) *"
              type="number"
              min="0.1"
              step="0.1"
              value={newRun.input_quantity_kg}
              onChange={(e) => setNewRun({ ...newRun, input_quantity_kg: Number(e.target.value) })}
            />
            <Input
              label="Number of Machines *"
              type="number"
              min="1"
              step="1"
              value={newRun.machine_count}
              onChange={(e) => setNewRun({ ...newRun, machine_count: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date & Time *"
              type="datetime-local"
              value={newRun.start_datetime}
              onChange={(e) => setNewRun({ ...newRun, start_datetime: e.target.value })}
            />
            <Input
              label="Shift Duration (hrs/day) *"
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={newRun.shift_hours_per_day}
              onChange={(e) => setNewRun({ ...newRun, shift_hours_per_day: Number(e.target.value) })}
            />
          </div>

          {newRun.stage === 'Dyeing' && (
            <Input
              label="Dyeing Colour / Shade"
              placeholder="e.g. Royal Blue, Pantone 280C"
              value={newRun.dyeing_color}
              onChange={(e) => setNewRun({ ...newRun, dyeing_color: e.target.value })}
            />
          )}

          <Input
            label="Notes"
            placeholder="Operator remarks, lot number, recipe..."
            value={newRun.notes}
            onChange={(e) => setNewRun({ ...newRun, notes: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setIsNewRunModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNewRun}>
              <Play size={15} /> Start Run & Predict
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL: Update Progress
      ───────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isUpdateProgressOpen}
        onClose={() => setIsUpdateProgressOpen(false)}
        title={`Update Progress: ${selectedRun?.stage ?? ''}`}
      >
        <div className="space-y-4">
          <div className="p-3 bg-soft-mint/50 rounded-lg border border-light-mint text-xs text-secondary-text">
            <strong>Actual output quantity</strong> (if measurable) is used for true progress.
            <br />
            <strong>Progress %</strong> is used if actual output is not available.
            <br />
            These two are tracked separately from time-based estimates.
          </div>
          <Input
            label="Actual Output So Far (kg / meters)"
            type="number"
            min="0"
            step="0.1"
            value={progressUpdate.actual_output_quantity}
            onChange={(e) => setProgressUpdate({ ...progressUpdate, actual_output_quantity: Number(e.target.value) })}
          />
          <Input
            label="Actual Progress % (optional override)"
            type="number"
            min="0"
            max="100"
            placeholder="Leave blank to calculate from output"
            value={progressUpdate.actual_progress_pct}
            onChange={(e) => setProgressUpdate({ ...progressUpdate, actual_progress_pct: e.target.value })}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-navy">Run Status</label>
            <select
              value={progressUpdate.status}
              onChange={(e) => setProgressUpdate({ ...progressUpdate, status: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-border bg-white text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed (100%)</option>
              <option value="delayed">Delayed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <Input
            label="Remarks / Notes"
            placeholder="Operator remarks, machine adjustments..."
            value={progressUpdate.notes}
            onChange={(e) => setProgressUpdate({ ...progressUpdate, notes: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setIsUpdateProgressOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProgress}>
              <RotateCcw size={15} /> Save Progress
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
