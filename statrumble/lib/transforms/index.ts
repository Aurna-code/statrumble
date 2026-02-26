import { z } from "zod";

const DEFAULT_IQR_K = 1.5;
const DEFAULT_ZSCORE_Z = 3;
const DEFAULT_SPEC_VERSION = 1 as const;
const MAX_TRANSFORM_OPS = 20;
const WINDOW_TOO_LARGE_WARNING = "window_too_large" as const;

const outputColumnSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine((value) => value !== "ts", {
    message: "outputColumn cannot overwrite ts.",
  });

export const FilterOutliersOpSchema = z
  .object({
    op: z.literal("filter_outliers"),
    method: z.enum(["iqr", "zscore"]),
    k: z.number().finite().positive().max(100).optional(),
    z: z.number().finite().positive().max(100).optional(),
    mode: z.enum(["remove", "clip"]).default("clip"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.method === "iqr" && value.z !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "filter_outliers(method=iqr) does not accept z.",
        path: ["z"],
      });
    }

    if (value.method === "zscore" && value.k !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "filter_outliers(method=zscore) does not accept k.",
        path: ["k"],
      });
    }
  });

export const MovingAverageOpSchema = z
  .object({
    op: z.literal("moving_average"),
    window: z.number().int().min(1).max(10_000),
    center: z.boolean().optional(),
    outputColumn: outputColumnSchema.optional(),
  })
  .strict();

export const TransformOpSchema = z.discriminatedUnion("op", [FilterOutliersOpSchema, MovingAverageOpSchema]);

const TransformSpecObjectSchema = z
  .object({
    version: z.literal(DEFAULT_SPEC_VERSION).default(DEFAULT_SPEC_VERSION),
    ops: z.array(TransformOpSchema).min(1).max(MAX_TRANSFORM_OPS),
  })
  .strict();

export const TransformSpecSchema = z.preprocess((input) => {
  if (Array.isArray(input)) {
    return {
      version: DEFAULT_SPEC_VERSION,
      ops: input,
    };
  }

  return input;
}, TransformSpecObjectSchema);

export type FilterOutliersOp = z.infer<typeof FilterOutliersOpSchema>;
export type MovingAverageOp = z.infer<typeof MovingAverageOpSchema>;
export type TransformOp = z.infer<typeof TransformOpSchema>;
export type TransformSpec = z.infer<typeof TransformSpecSchema>;

export type TransformSeriesPoint = {
  ts: string | number;
  value: number;
  [key: string]: unknown;
};

export type TransformWarning = typeof WINDOW_TOO_LARGE_WARNING;

export type TransformStats = {
  count_before: number;
  count_after: number;
  outliers_removed: number;
  mean: number | null;
  std: number | null;
  slope: number | null;
  warnings?: TransformWarning[];
};

export type TransformStatsDiff = {
  count_before: { before: number; after: number; delta: number };
  count_after: { before: number; after: number; delta: number };
  outliers_removed: { before: number; after: number; delta: number };
  mean: { before: number | null; after: number | null; delta: number | null };
  std: { before: number | null; after: number | null; delta: number | null };
  slope: { before: number | null; after: number | null; delta: number | null };
};

type FilterResult = {
  series: TransformSeriesPoint[];
  outliersRemoved: number;
};

type ValidatedSeriesPoint = {
  point: TransformSeriesPoint;
  sortTs: number;
  dedupeKey: string;
  inputIndex: number;
};

function parseSortableTimestamp(ts: string | number, index: number) {
  if (typeof ts === "number") {
    if (!Number.isFinite(ts)) {
      throw new Error(`series[${index}].ts must be a finite number.`);
    }

    return {
      normalizedTs: ts,
      sortTs: ts,
      dedupeKey: `ts:${ts}`,
    };
  }

  const trimmed = ts.trim();

  if (trimmed.length === 0) {
    throw new Error(`series[${index}].ts must be a non-empty string.`);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);

    if (!Number.isFinite(numeric)) {
      throw new Error(`series[${index}].ts string is not a finite numeric timestamp.`);
    }

    return {
      normalizedTs: trimmed,
      sortTs: numeric,
      dedupeKey: `ts:${numeric}`,
    };
  }

  const parsedDate = Date.parse(trimmed);

  if (!Number.isFinite(parsedDate)) {
    throw new Error(`series[${index}].ts must be an ISO timestamp string or finite number.`);
  }

  return {
    normalizedTs: trimmed,
    sortTs: parsedDate,
    dedupeKey: `ts:${parsedDate}`,
  };
}

function cloneAndValidateSeries(series: TransformSeriesPoint[]): ValidatedSeriesPoint[] {
  if (!Array.isArray(series)) {
    throw new Error("series must be an array.");
  }

  return series.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`series[${index}] must be an object with ts and value.`);
    }

    const record = item as Record<string, unknown>;
    const ts = record.ts;
    const value = record.value;

    if (typeof ts !== "string" && typeof ts !== "number") {
      throw new Error(`series[${index}].ts must be a timestamp string or number.`);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`series[${index}].value must be a finite number.`);
    }

    const timestamp = parseSortableTimestamp(ts, index);

    return {
      point: {
        ...record,
        ts: timestamp.normalizedTs,
        value,
      },
      sortTs: timestamp.sortTs,
      dedupeKey: timestamp.dedupeKey,
      inputIndex: index,
    };
  });
}

function normalizeSeries(series: TransformSeriesPoint[]): TransformSeriesPoint[] {
  const validated = cloneAndValidateSeries(series);
  const dedupedByTimestamp = new Map<string, ValidatedSeriesPoint>();

  // Duplicate timestamp rule: keep the last input row for a given timestamp key.
  for (const entry of validated) {
    dedupedByTimestamp.set(entry.dedupeKey, entry);
  }

  return [...dedupedByTimestamp.values()]
    .sort((left, right) => {
      if (left.sortTs !== right.sortTs) {
        return left.sortTs - right.sortTs;
      }

      return left.inputIndex - right.inputIndex;
    })
    .map((entry) => entry.point);
}

function quantile(sortedValues: number[], q: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  const position = (sortedValues.length - 1) * q;
  const baseIndex = Math.floor(position);
  const rest = position - baseIndex;
  const lower = sortedValues[baseIndex];
  const upper = sortedValues[baseIndex + 1];

  if (upper === undefined) {
    return lower;
  }

  return lower + rest * (upper - lower);
}

function calculateMean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function calculateStd(values: number[], mean: number | null): number | null {
  if (values.length === 0 || mean === null) {
    return null;
  }

  const variance = values.reduce((acc, value) => {
    const diff = value - mean;
    return acc + diff * diff;
  }, 0);

  return Math.sqrt(variance / values.length);
}

function calculateSlope(values: number[]): number | null {
  const n = values.length;

  if (n < 2) {
    return null;
  }

  let sumY = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    sumY += value;
    sumXY += i * value;
  }

  const sumX = ((n - 1) * n) / 2;
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function calculateOutlierBounds(values: number[], operation: FilterOutliersOp) {
  if (values.length === 0) {
    return {
      lower: Number.NEGATIVE_INFINITY,
      upper: Number.POSITIVE_INFINITY,
    };
  }

  if (operation.method === "iqr") {
    const sorted = [...values].sort((left, right) => left - right);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);

    if (q1 === null || q3 === null) {
      return {
        lower: Number.NEGATIVE_INFINITY,
        upper: Number.POSITIVE_INFINITY,
      };
    }

    const iqr = q3 - q1;
    const k = operation.k ?? DEFAULT_IQR_K;

    return {
      lower: q1 - k * iqr,
      upper: q3 + k * iqr,
    };
  }

  const mean = calculateMean(values);
  const std = calculateStd(values, mean);
  const z = operation.z ?? DEFAULT_ZSCORE_Z;

  if (mean === null || std === null || std === 0) {
    return {
      lower: Number.NEGATIVE_INFINITY,
      upper: Number.POSITIVE_INFINITY,
    };
  }

  return {
    lower: mean - z * std,
    upper: mean + z * std,
  };
}

function applyFilterOutliers(series: TransformSeriesPoint[], operation: FilterOutliersOp): FilterResult {
  const values = series.map((point) => point.value);
  const bounds = calculateOutlierBounds(values, operation);
  const lower = bounds.lower;
  const upper = bounds.upper;

  if (operation.mode === "remove") {
    const filtered: TransformSeriesPoint[] = [];
    let removed = 0;

    for (const point of series) {
      if (point.value < lower || point.value > upper) {
        removed += 1;
        continue;
      }

      filtered.push(point);
    }

    return {
      series: filtered,
      outliersRemoved: removed,
    };
  }

  const clipped = series.map((point) => {
    const nextValue = Math.min(upper, Math.max(lower, point.value));
    return {
      ...point,
      value: nextValue,
    };
  });

  return {
    series: clipped,
    outliersRemoved: 0,
  };
}

function resolveMovingAverageWindow(index: number, length: number, window: number, center: boolean) {
  if (!center) {
    const start = Math.max(0, index - window + 1);
    return {
      start,
      end: index,
    };
  }

  const leftWidth = Math.floor((window - 1) / 2);
  const rightWidth = window - leftWidth - 1;
  const start = Math.max(0, index - leftWidth);
  const end = Math.min(length - 1, index + rightWidth);

  return {
    start,
    end,
  };
}

function applyMovingAverage(series: TransformSeriesPoint[], operation: MovingAverageOp): TransformSeriesPoint[] {
  if (series.length === 0) {
    return [];
  }

  const values = series.map((point) => point.value);
  const prefixSums = new Array(values.length + 1).fill(0);

  for (let i = 0; i < values.length; i += 1) {
    prefixSums[i + 1] = prefixSums[i] + values[i];
  }

  const targetColumn = operation.outputColumn ?? "value";
  const center = operation.center ?? false;

  return series.map((point, index) => {
    const windowBounds = resolveMovingAverageWindow(index, values.length, operation.window, center);
    const start = windowBounds.start;
    const end = windowBounds.end;
    const sum = prefixSums[end + 1] - prefixSums[start];
    const count = end - start + 1;
    const movingAverage = sum / count;

    if (targetColumn === "value") {
      return {
        ...point,
        value: movingAverage,
      };
    }

    return {
      ...point,
      [targetColumn]: movingAverage,
    };
  });
}

function calculateSeriesStats(
  before: TransformSeriesPoint[],
  after: TransformSeriesPoint[],
  outliersRemoved: number,
  warnings: TransformWarning[],
): TransformStats {
  const values = after.map((point) => point.value);
  const mean = calculateMean(values);
  const std = calculateStd(values, mean);
  const slope = calculateSlope(values);

  const stats: TransformStats = {
    count_before: before.length,
    count_after: after.length,
    outliers_removed: outliersRemoved,
    mean,
    std,
    slope,
  };

  if (warnings.length > 0) {
    stats.warnings = warnings;
  }

  return stats;
}

function diffNullableNumber(before: number | null, after: number | null) {
  if (before === null || after === null) {
    return null;
  }

  return after - before;
}

export function parseTransformSpec(input: unknown): TransformSpec {
  return TransformSpecSchema.parse(input);
}

export function applyTransform(specInput: unknown, seriesInput: TransformSeriesPoint[]) {
  const spec = parseTransformSpec(specInput);
  const before = normalizeSeries(seriesInput);
  let after = before;
  let outliersRemoved = 0;
  const warnings = new Set<TransformWarning>();

  for (const operation of spec.ops) {
    if (operation.op === "filter_outliers") {
      const result = applyFilterOutliers(after, operation);
      after = result.series;
      outliersRemoved += result.outliersRemoved;
      continue;
    }

    if (after.length > 0 && operation.window > after.length) {
      warnings.add(WINDOW_TOO_LARGE_WARNING);
      continue;
    }

    after = applyMovingAverage(after, operation);
  }

  return {
    series: after,
    stats: calculateSeriesStats(before, after, outliersRemoved, [...warnings]),
  };
}

export function compareStats(before: TransformStats, after: TransformStats): TransformStatsDiff {
  return {
    count_before: {
      before: before.count_before,
      after: after.count_before,
      delta: after.count_before - before.count_before,
    },
    count_after: {
      before: before.count_after,
      after: after.count_after,
      delta: after.count_after - before.count_after,
    },
    outliers_removed: {
      before: before.outliers_removed,
      after: after.outliers_removed,
      delta: after.outliers_removed - before.outliers_removed,
    },
    mean: {
      before: before.mean,
      after: after.mean,
      delta: diffNullableNumber(before.mean, after.mean),
    },
    std: {
      before: before.std,
      after: after.std,
      delta: diffNullableNumber(before.std, after.std),
    },
    slope: {
      before: before.slope,
      after: after.slope,
      delta: diffNullableNumber(before.slope, after.slope),
    },
  };
}
