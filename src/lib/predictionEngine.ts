/**
 * Production Time Prediction Engine — Texora
 *
 * Implements Stage 1 (Baseline) and Stage 2 (Historical Data) predictions
 * for Spinning, Weaving, and Dyeing production stages.
 *
 * This module contains ONLY pure calculation logic — no database calls.
 * It is designed to be honest about confidence levels and data availability.
 *
 * IMPORTANT: This does NOT call a trained ML model. When historical data
 * is insufficient (< minHistoricalRuns), it falls back to baseline estimates
 * and clearly labels them as such.
 */

export type ProductionStage = 'Spinning' | 'Weaving' | 'Dyeing';

export interface StageRateConfig {
  stage: ProductionStage;
  material_type: string;
  baseline_rate_per_machine_per_hour: number; // kg/hr or meters/hr per machine
  rate_unit: 'kg' | 'meters';
  default_yield_rate: number; // 0 < yield <= 1.0
  min_historical_runs_required: number;
}

export interface HistoricalRecord {
  input_quantity_kg: number;
  actual_output_quantity: number;
  duration_hours: number;
  machine_count: number;
  start_datetime: string;
  actual_end_datetime: string;
}

export interface PredictionInput {
  stage: ProductionStage;
  materialType: string;
  inputQuantityKg: number;
  machineCount: number;
  startDatetime: Date;
  shiftHoursPerDay: number; // e.g. 8 for a single 8-hour shift
  actualProgressPct?: number | null;      // 0-100, null if not recorded
  actualCompletedQuantity?: number | null; // real measured output, null if not recorded
  plannedTotalQuantity?: number | null;   // null if not yet planned
}

export interface PredictionOutput {
  predictionMethod: 'baseline' | 'historical';
  isBaseline: boolean;
  estimatedDurationHours: number;
  estimatedDurationHoursMin: number; // lower bound (±15%)
  estimatedDurationHoursMax: number; // upper bound (±15%)
  estimatedCompletionDatetime: Date;
  estimatedCompletionDatetimeMin: Date;
  estimatedCompletionDatetimeMax: Date;
  estimatedOutputQuantity: number | null;
  estimatedOutputUnit: string;
  yieldRateUsed: number | null;
  ratePerMachinePerHour: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  dataQualityNote: string;
  insufficientData: boolean;
  historicalRunsUsed?: number;
  baselineNote: string;
}

export interface ProgressState {
  progressType: 'actual' | 'time_based' | 'not_started';
  progressPct: number;
  label: string;
  milestone: string;
  isActual: boolean;
  timeBasedPct: number | null;
  elapsedHours: number;
  remainingHours: number | null;
  estimatedCompletionDatetime: Date | null;
}

// ─── Milestone Labels ──────────────────────────────────────────────────────────
export const PROGRESS_MILESTONES: { threshold: number; label: string }[] = [
  { threshold: 0, label: 'Not Started' },
  { threshold: 10, label: 'Started' },
  { threshold: 20, label: 'In Progress' },
  { threshold: 30, label: 'In Progress' },
  { threshold: 40, label: 'In Progress' },
  { threshold: 50, label: 'Halfway' },
  { threshold: 60, label: 'In Progress' },
  { threshold: 70, label: 'In Progress' },
  { threshold: 80, label: 'Near Completion' },
  { threshold: 90, label: 'Almost Complete' },
  { threshold: 100, label: 'Completed' },
];

export function getMilestoneLabel(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  let label = 'Not Started';
  for (const m of PROGRESS_MILESTONES) {
    if (clamped >= m.threshold) label = m.label;
  }
  return label;
}

// ─── Operating Hours Calculator ────────────────────────────────────────────────
/**
 * Adds operating hours to a start date, accounting for shift duration per day.
 * For simplicity, assumes the shift starts at the provided start time each day.
 * Does NOT assume machines run continuously through breaks or nights.
 *
 * If shiftHoursPerDay = 8, then 1 calendar day = 8 operating hours.
 * A 16-hour job = 2 working days from the start datetime.
 */
export function addOperatingHours(start: Date, operatingHours: number, shiftHoursPerDay: number): Date {
  if (shiftHoursPerDay <= 0) throw new Error('shiftHoursPerDay must be > 0');
  if (shiftHoursPerDay > 24) throw new Error('shiftHoursPerDay cannot exceed 24');

  let remainingHours = operatingHours;
  const result = new Date(start);

  while (remainingHours > 0) {
    const canDoToday = Math.min(shiftHoursPerDay, remainingHours);
    result.setHours(result.getHours() + canDoToday);
    remainingHours -= canDoToday;

    // If there are more hours remaining, skip to next day's shift start
    if (remainingHours > 0) {
      const hoursUntilNextShift = 24 - shiftHoursPerDay;
      result.setHours(result.getHours() + hoursUntilNextShift);
    }
  }

  return result;
}

/**
 * Calculates elapsed operating hours between two datetimes,
 * accounting for shift schedule.
 */
export function calcElapsedOperatingHours(start: Date, now: Date, shiftHoursPerDay: number): number {
  const totalMs = now.getTime() - start.getTime();
  if (totalMs <= 0) return 0;

  const totalHoursRaw = totalMs / (1000 * 60 * 60);
  // Scale down for shift hours
  const hoursPerCalendarDay = shiftHoursPerDay;
  const operatingHours = (totalHoursRaw / 24) * hoursPerCalendarDay;
  return Math.max(0, operatingHours);
}

// ─── Stage 1: Baseline Prediction ─────────────────────────────────────────────
/**
 * Produces a transparent, clearly labelled baseline estimate
 * when historical data is insufficient or unavailable.
 *
 * Formula:
 *   Effective Rate = baseline_rate × machine_count
 *   (Note: does NOT blindly multiply if machines share bottlenecks —
 *    it uses a conservative 0.85 scaling factor beyond 1 machine to model
 *    shared-resource constraints, unless historical evidence is available.)
 *
 *   Duration = input_quantity / effective_rate
 *   Estimated Output = input_quantity × yield_rate
 */
export function computeBaselinePrediction(
  input: PredictionInput,
  config: StageRateConfig
): PredictionOutput {
  const { inputQuantityKg, machineCount, startDatetime, shiftHoursPerDay } = input;

  // Conservative multi-machine scaling (0.85 per additional machine)
  // This is a documented assumption to avoid over-optimism.
  const scalingFactor = machineCount === 1 ? 1.0 : (1 + (machineCount - 1) * 0.85);
  const effectiveRate = config.baseline_rate_per_machine_per_hour * scalingFactor;

  const estimatedDurationHours = inputQuantityKg / effectiveRate;
  // ±15% uncertainty range for baseline estimates
  const uncertaintyFactor = 0.15;
  const estimatedDurationMin = estimatedDurationHours * (1 - uncertaintyFactor);
  const estimatedDurationMax = estimatedDurationHours * (1 + uncertaintyFactor);

  const estimatedCompletion = addOperatingHours(startDatetime, estimatedDurationHours, shiftHoursPerDay);
  const estimatedCompletionMin = addOperatingHours(startDatetime, estimatedDurationMin, shiftHoursPerDay);
  const estimatedCompletionMax = addOperatingHours(startDatetime, estimatedDurationMax, shiftHoursPerDay);

  const estimatedOutput = inputQuantityKg * config.default_yield_rate;

  return {
    predictionMethod: 'baseline',
    isBaseline: true,
    estimatedDurationHours,
    estimatedDurationHoursMin: estimatedDurationMin,
    estimatedDurationHoursMax: estimatedDurationMax,
    estimatedCompletionDatetime: estimatedCompletion,
    estimatedCompletionDatetimeMin: estimatedCompletionMin,
    estimatedCompletionDatetimeMax: estimatedCompletionMax,
    estimatedOutputQuantity: estimatedOutput,
    estimatedOutputUnit: config.rate_unit,
    yieldRateUsed: config.default_yield_rate,
    ratePerMachinePerHour: config.baseline_rate_per_machine_per_hour,
    confidenceLevel: 'low',
    dataQualityNote:
      `Insufficient production history for a reliable prediction. Showing a baseline estimate.\n` +
      `Baseline rate: ${config.baseline_rate_per_machine_per_hour} ${config.rate_unit}/hr per machine. ` +
      `Yield rate: ${(config.default_yield_rate * 100).toFixed(0)}%. ` +
      `Multi-machine scaling: ${scalingFactor.toFixed(2)}x. ` +
      `Uncertainty: ±15%.`,
    insufficientData: true,
    baselineNote:
      `This is a BASELINE ESTIMATE — not a trained AI prediction. ` +
      `It will improve when at least ${config.min_historical_runs_required} ` +
      `completed historical runs are available for this stage and material type.`,
  };
}

// ─── Stage 2: Historical-Data-Based Prediction ────────────────────────────────
/**
 * Uses historical production records to compute an average production rate
 * and yield rate, then predicts completion based on those real measurements.
 *
 * Requirements before using:
 * - At least minHistoricalRuns completed runs for the same stage + material type
 * - Each record must have a valid actual_output_quantity and duration
 *
 * If requirements are not met, falls back to baseline.
 */
export function computeHistoricalPrediction(
  input: PredictionInput,
  config: StageRateConfig,
  historicalRecords: HistoricalRecord[]
): PredictionOutput {
  const validRecords = historicalRecords.filter(
    (r) =>
      r.duration_hours > 0 &&
      r.input_quantity_kg > 0 &&
      r.actual_output_quantity > 0 &&
      r.machine_count > 0
  );

  if (validRecords.length < config.min_historical_runs_required) {
    // Fall back to baseline — documented, honest
    const baseline = computeBaselinePrediction(input, config);
    return {
      ...baseline,
      dataQualityNote:
        `Only ${validRecords.length} of ${config.min_historical_runs_required} required historical runs available. ` +
        baseline.dataQualityNote,
    };
  }

  // Calculate rate per machine-hour from each record
  const rates = validRecords.map((r) => {
    return r.input_quantity_kg / (r.duration_hours * r.machine_count);
  });

  // Calculate yield rates (output / input)
  const yieldRates = validRecords.map((r) => r.actual_output_quantity / r.input_quantity_kg);

  // Use mean rate and yield
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const avgYield = yieldRates.reduce((a, b) => a + b, 0) / yieldRates.length;

  // Standard deviation for confidence assessment
  const rateStdDev = Math.sqrt(
    rates.map((r) => Math.pow(r - avgRate, 2)).reduce((a, b) => a + b, 0) / rates.length
  );
  const rateCV = avgRate > 0 ? rateStdDev / avgRate : 1; // Coefficient of Variation

  // Conservative multi-machine scaling
  const scalingFactor = input.machineCount === 1 ? 1.0 : (1 + (input.machineCount - 1) * 0.85);
  const effectiveRate = avgRate * input.machineCount * (scalingFactor / input.machineCount);
  const estimatedDurationHours = input.inputQuantityKg / effectiveRate;

  // Uncertainty range based on historical variance
  const uncertaintyFactor = Math.max(0.05, Math.min(0.30, rateCV));
  const estimatedDurationMin = estimatedDurationHours * (1 - uncertaintyFactor);
  const estimatedDurationMax = estimatedDurationHours * (1 + uncertaintyFactor);

  const estimatedCompletion = addOperatingHours(input.startDatetime, estimatedDurationHours, input.shiftHoursPerDay);
  const estimatedCompletionMin = addOperatingHours(input.startDatetime, estimatedDurationMin, input.shiftHoursPerDay);
  const estimatedCompletionMax = addOperatingHours(input.startDatetime, estimatedDurationMax, input.shiftHoursPerDay);

  const estimatedOutput = input.inputQuantityKg * avgYield;

  // Confidence: high if CV < 10%, medium if < 25%, low otherwise
  const confidenceLevel: 'low' | 'medium' | 'high' =
    rateCV < 0.10 ? 'high' : rateCV < 0.25 ? 'medium' : 'low';

  return {
    predictionMethod: 'historical',
    isBaseline: false,
    estimatedDurationHours,
    estimatedDurationHoursMin: estimatedDurationMin,
    estimatedDurationHoursMax: estimatedDurationMax,
    estimatedCompletionDatetime: estimatedCompletion,
    estimatedCompletionDatetimeMin: estimatedCompletionMin,
    estimatedCompletionDatetimeMax: estimatedCompletionMax,
    estimatedOutputQuantity: estimatedOutput,
    estimatedOutputUnit: config.rate_unit,
    yieldRateUsed: avgYield,
    ratePerMachinePerHour: avgRate,
    confidenceLevel,
    dataQualityNote:
      `Based on ${validRecords.length} historical runs. ` +
      `Average rate: ${avgRate.toFixed(3)} ${config.rate_unit}/hr per machine. ` +
      `Average yield: ${(avgYield * 100).toFixed(1)}%. ` +
      `Rate variation (CV): ${(rateCV * 100).toFixed(1)}% → confidence: ${confidenceLevel}. ` +
      `Uncertainty range: ±${(uncertaintyFactor * 100).toFixed(0)}%.`,
    insufficientData: false,
    historicalRunsUsed: validRecords.length,
    baselineNote: '',
  };
}

// ─── Progress Tracker ──────────────────────────────────────────────────────────
/**
 * Computes the current progress state for an active production run.
 *
 * Priority:
 * 1. If actualCompletedQuantity and plannedTotalQuantity are available → use actual progress
 * 2. Else if actualProgressPct is provided → use that
 * 3. Else → compute time-based estimate (clearly labelled separately)
 *
 * NEVER presents time-based estimates as actual production output.
 */
export function computeProgressState(
  input: PredictionInput,
  prediction: PredictionOutput,
  now: Date
): ProgressState {
  const elapsedHours = calcElapsedOperatingHours(input.startDatetime, now, input.shiftHoursPerDay);
  const remainingHours = Math.max(0, prediction.estimatedDurationHours - elapsedHours);

  const remainingCompletionDatetime =
    remainingHours > 0
      ? addOperatingHours(now, remainingHours, input.shiftHoursPerDay)
      : null;

  // Time-based estimate (elapsed / total estimated)
  const timeBasedPct =
    prediction.estimatedDurationHours > 0
      ? Math.min(100, (elapsedHours / prediction.estimatedDurationHours) * 100)
      : 0;

  // Case 1: Actual output quantity available
  if (
    input.actualCompletedQuantity != null &&
    input.plannedTotalQuantity != null &&
    input.plannedTotalQuantity > 0
  ) {
    const actualPct = Math.min(
      100,
      (input.actualCompletedQuantity / input.plannedTotalQuantity) * 100
    );
    return {
      progressType: 'actual',
      progressPct: actualPct,
      label: getMilestoneLabel(actualPct),
      milestone: getMilestoneLabel(actualPct),
      isActual: true,
      timeBasedPct,
      elapsedHours,
      remainingHours: remainingHours > 0 ? remainingHours : 0,
      estimatedCompletionDatetime: remainingCompletionDatetime,
    };
  }

  // Case 2: Manual progress percentage provided
  if (input.actualProgressPct != null) {
    const pct = Math.min(100, Math.max(0, input.actualProgressPct));
    return {
      progressType: 'actual',
      progressPct: pct,
      label: getMilestoneLabel(pct),
      milestone: getMilestoneLabel(pct),
      isActual: true,
      timeBasedPct,
      elapsedHours,
      remainingHours: remainingHours > 0 ? remainingHours : 0,
      estimatedCompletionDatetime: remainingCompletionDatetime,
    };
  }

  // Case 3: Time-based estimate only — clearly distinguished from actual
  if (elapsedHours === 0) {
    return {
      progressType: 'not_started',
      progressPct: 0,
      label: 'Not Started',
      milestone: 'Not Started',
      isActual: false,
      timeBasedPct: 0,
      elapsedHours: 0,
      remainingHours: prediction.estimatedDurationHours,
      estimatedCompletionDatetime: prediction.estimatedCompletionDatetime,
    };
  }

  return {
    progressType: 'time_based',
    progressPct: timeBasedPct,
    label: `${getMilestoneLabel(timeBasedPct)} (Time-Based Estimate)`,
    milestone: getMilestoneLabel(timeBasedPct),
    isActual: false,
    timeBasedPct,
    elapsedHours,
    remainingHours: remainingHours > 0 ? remainingHours : 0,
    estimatedCompletionDatetime: remainingCompletionDatetime,
  };
}

// ─── Formatting Helpers ────────────────────────────────────────────────────────
export function formatDurationHours(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDatetime(dt: Date): string {
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDatetimeRange(min: Date, max: Date): string {
  const minTime = min.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const maxTime = max.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const date = min.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${date}, ${minTime} – ${maxTime}`;
}
