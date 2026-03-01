export const TRANSFORM_OPS = ["filter_outliers", "moving_average"] as const;

export type TransformOpName = (typeof TRANSFORM_OPS)[number];

type TransformParamGuide = {
  name: string;
  hint: string;
};

type TransformOpGuide = {
  op: TransformOpName;
  summary: string;
  params: readonly TransformParamGuide[];
  example: string;
  note?: string;
};

export const TRANSFORM_OP_GUIDE: readonly TransformOpGuide[] = [
  {
    op: "filter_outliers",
    summary: "Flag and constrain extreme values with IQR or z-score bounds.",
    params: [
      { name: "method", hint: "`iqr` or `zscore`." },
      { name: "mode", hint: "`clip` keeps all rows; `remove` drops outlier points." },
      { name: "k", hint: "IQR multiplier (only when `method=iqr`)." },
      { name: "z", hint: "Z-score threshold (only when `method=zscore`)." },
    ],
    example: "filter_outliers(method=iqr, mode=clip, k=1.5)",
    note: "Use `clip` to preserve row count; use `remove` to exclude points.",
  },
  {
    op: "moving_average",
    summary: "Smooth noisy series values with a rolling average window.",
    params: [
      { name: "window", hint: "Positive integer window size (>= 1)." },
      { name: "center", hint: "Optional boolean; null is allowed when unused." },
      { name: "outputColumn", hint: "Optional identifier; defaults to `value`." },
    ],
    example: "moving_average(window=7, center=false, outputColumn=value)",
  },
] as const;

export const PROMPT_EXAMPLES_CREATE: readonly string[] = [
  "Clip outliers with IQR using k=1.5 so row count stays stable.",
  "Remove extreme points with z-score using z=3, then summarize count/mean/std impact.",
  "Apply a 7-point moving average with center=false on value.",
  "Clip z-score outliers at z=2.5 and explain slope change in plain language.",
] as const;

export const PROMPT_EXAMPLES_FORK: readonly string[] = [
  "Refine parent: switch filter_outliers mode from clip to remove.",
  "Refine parent: increase moving_average window from 7 to 14.",
  "Refine parent: try method=zscore with z=3 instead of IQR.",
  "Refine parent: keep same ops but reduce aggressiveness to protect count_after.",
] as const;

export const MODEL_GUIDANCE_BULLETS: readonly string[] = [
  "All schema keys must be present. Use null for fields that do not apply to an op.",
  "filter_outliers: if method=iqr, set k as number and z as null; if method=zscore, set z as number and k as null.",
  "moving_average: window must be an integer >= 1; center and outputColumn may be null.",
  "Use at most 3 ops and propose the smallest practical change.",
  "In explanation, describe expected impact on baseline_stats count, mean, std, and slope in plain terms.",
] as const;
