import type { RefereeLeading, RefereeReport } from "./referee/schema";
import type { TransformSpec, TransformStats, TransformStatsDiff } from "./transforms";

export const DEMO_MODE_NOTE = "Generated in demo mode (no API calls).";

type DemoVoteStance = "A" | "B" | "C";

type MockRefereeVotes = {
  A: number;
  B: number;
  C: number;
  my_stance: DemoVoteStance | null;
};

type MockMessage = {
  content: string;
  user_id: string;
  created_at: string;
};

type MockRefereeReportArgs = {
  threadId: string;
  votes: MockRefereeVotes;
  snapshotSummary: string;
  messages: MockMessage[];
};

type MockTransformProposalArgs = {
  prompt: string;
  importId: string;
  importMeta?: {
    name?: string | null;
    unit?: string | null;
  };
  startTs: string;
  endTs: string;
  parentThreadId?: string | null;
};

type MockTransformStatsPayload = {
  transformed: TransformStats;
  baseline: TransformStats;
  diff: TransformStatsDiff;
  demo_note: string;
};

export type MockTransformProposalResult = {
  title: string;
  explanation: string;
  transformSpec: TransformSpec;
  sqlPreview: string;
  statsPayload: MockTransformStatsPayload;
  diffReport: Record<string, unknown> | null;
};

type TransformDeltaRow = {
  before: number | null;
  after: number | null;
  delta: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 140): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
}

function buildDelta(before: number | null, after: number | null, digits = 3): TransformDeltaRow {
  if (before === null || after === null) {
    return {
      before,
      after,
      delta: null,
    };
  }

  return {
    before,
    after,
    delta: round(after - before, digits),
  };
}

function buildNumberDelta(before: number, after: number, digits = 3): { before: number; after: number; delta: number } {
  return {
    before,
    after,
    delta: round(after - before, digits),
  };
}

function compareStats(before: TransformStats, after: TransformStats): TransformStatsDiff {
  return {
    count_before: buildNumberDelta(before.count_before, after.count_before, 0),
    count_after: buildNumberDelta(before.count_after, after.count_after, 0),
    outliers_removed: buildNumberDelta(before.outliers_removed, after.outliers_removed, 0),
    mean: buildDelta(before.mean, after.mean, 4),
    std: buildDelta(before.std, after.std, 4),
    slope: buildDelta(before.slope, after.slope, 6),
  };
}

function readDeltaValue(deltas: unknown, key: string): number | null {
  const record = asRecord(deltas);

  if (!record) {
    return null;
  }

  const entry = asRecord(record[key]);

  if (!entry) {
    return null;
  }

  if (entry.delta === null) {
    return null;
  }

  return asFiniteNumber(entry.delta);
}

function formatSigned(value: number | null, digits = 2): string {
  if (value === null) {
    return "-";
  }

  const absolute = Math.abs(value).toFixed(digits);

  if (value === 0) {
    return `0.${"0".repeat(digits)}`;
  }

  return `${value > 0 ? "+" : "-"}${absolute}`;
}

function pickRecentQuote(messages: MockMessage[], seed: number): string {
  const recent = messages
    .slice(-2)
    .map((item) => normalizeWhitespace(item.content))
    .filter((content) => content.length > 0);

  if (recent.length === 0) {
    return "No recent messages were posted.";
  }

  return truncate(recent[seed % recent.length]);
}

function computeLeading(votes: MockRefereeVotes): RefereeLeading {
  const ordered = [
    { stance: "A" as const, count: votes.A },
    { stance: "B" as const, count: votes.B },
    { stance: "C" as const, count: votes.C },
  ].sort((left, right) => right.count - left.count);

  const first = ordered[0];
  const second = ordered[1];

  if (!first || !second || first.count <= 0 || first.count === second.count) {
    return "unclear";
  }

  return first.stance;
}

function computeConfidence(votes: MockRefereeVotes, seed: number): { label: "low" | "medium" | "high"; score: number } {
  const ordered = [votes.A, votes.B, votes.C].sort((left, right) => right - left);
  const total = votes.A + votes.B + votes.C;
  const margin = (ordered[0] ?? 0) - (ordered[1] ?? 0);

  if (total <= 0 || margin <= 0) {
    return {
      label: "low",
      score: 35 + (seed % 8),
    };
  }

  const marginRatio = margin / total;

  if (marginRatio >= 0.35) {
    return {
      label: "high",
      score: 80 + (seed % 10),
    };
  }

  if (marginRatio >= 0.15) {
    return {
      label: "medium",
      score: 63 + (seed % 10),
    };
  }

  return {
    label: "low",
    score: 47 + (seed % 10),
  };
}

function buildSteelmanLines(stance: DemoVoteStance, snapshotSummary: string, votes: MockRefereeVotes): string {
  const lines = [
    `- ${stance} highlights the selected-window evidence: ${snapshotSummary}.`,
    `- ${stance} reads the current vote split (A ${votes.A} / B ${votes.B} / C ${votes.C}) as support for this direction.`,
    `- ${stance} emphasizes that quick execution can keep collaboration momentum while details are reviewed.`,
  ];

  return `${pick(lines, stableHash(`${stance}|steelman|1|${snapshotSummary}`))}\n${pick(
    lines,
    stableHash(`${stance}|steelman|2|${votes.A}|${votes.B}|${votes.C}`),
  )}`;
}

function buildWeaknessLines(stance: DemoVoteStance, quote: string, votes: MockRefereeVotes): string {
  const lines = [
    `- ${stance} may overfit to short-term movement while underweighting alternate windows.`,
    `- The thread quote ("${quote}") shows uncertainty that ${stance} has not fully addressed.`,
    `- Vote totals (A ${votes.A} / B ${votes.B} / C ${votes.C}) do not prove causal validity on their own.`,
  ];

  const first = pick(lines, stableHash(`${stance}|weakness|1|${quote}`));
  const second = pick(lines, stableHash(`${stance}|weakness|2|${votes.A}|${votes.B}|${votes.C}`));

  return `${first}\n${second}`;
}

export function stableHash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return hash >>> 0;
}

export function pick<T>(arr: readonly T[], seed: number): T {
  if (arr.length === 0) {
    throw new Error("pick() requires a non-empty array.");
  }

  const index = Math.abs(seed) % arr.length;
  const value = arr[index];

  if (value === undefined) {
    throw new Error("pick() selected an invalid index.");
  }

  return value;
}

export function mockRefereeReport(args: MockRefereeReportArgs): RefereeReport {
  const seed = stableHash(`${args.threadId}|${args.votes.A}|${args.votes.B}|${args.votes.C}|${args.snapshotSummary}`);
  const leading = computeLeading(args.votes);
  const confidence = computeConfidence(args.votes, seed);
  const quote = pickRecentQuote(args.messages, seed);

  const report: RefereeReport = {
    tldr: `Demo referee: leading stance is ${leading} with ${confidence.label} confidence. ${args.snapshotSummary}`,
    data_facts: [
      {
        fact: `Vote totals are A ${args.votes.A}, B ${args.votes.B}, C ${args.votes.C}.`,
        support: `Computed from thread votes (my stance: ${args.votes.my_stance ?? "none"}).`,
      },
      {
        fact: args.snapshotSummary,
        support: "Derived from the stored thread snapshot.",
      },
      {
        fact: `Recent quote: "${quote}"`,
        support: "Taken from the last thread messages.",
      },
    ],
    stances: {
      A: {
        steelman: buildSteelmanLines("A", args.snapshotSummary, args.votes),
        weakness: buildWeaknessLines("A", quote, args.votes),
      },
      B: {
        steelman: buildSteelmanLines("B", args.snapshotSummary, args.votes),
        weakness: buildWeaknessLines("B", quote, args.votes),
      },
      C: {
        steelman: buildSteelmanLines("C", args.snapshotSummary, args.votes),
        weakness: buildWeaknessLines("C", quote, args.votes),
      },
    },
    confounders: [
      "Selected range effects may differ from full-series behavior.",
      "Message sentiment and vote timing can shift after new evidence.",
    ],
    next_checks: [
      {
        what: "Recompute on an adjacent window",
        why: "Checks whether the stance ranking is stable beyond the selected segment.",
      },
      {
        what: "Inspect high-leverage points",
        why: "Confirms whether a small set of values is dominating the conclusion.",
      },
    ],
    verdict: {
      leading,
      confidence_0_100: confidence.score,
      reason: `Vote margin and recent messages point to ${leading} with ${confidence.label} confidence in this demo run.`,
    },
    demo_note: DEMO_MODE_NOTE,
  };

  return report;
}

function buildMetricLabel(importMeta: MockTransformProposalArgs["importMeta"]): string {
  const name = typeof importMeta?.name === "string" ? importMeta.name.trim() : "";
  const unit = typeof importMeta?.unit === "string" ? importMeta.unit.trim() : "";

  if (!name) {
    return "selected metric";
  }

  if (!unit) {
    return name;
  }

  return `${name} (${unit})`;
}

function buildMockStats(seed: number, useRemove: boolean, includeMovingAverage: boolean): {
  baseline: TransformStats;
  transformed: TransformStats;
} {
  const countBefore = 140 + (seed % 360);
  const outliersTouched = 3 + (seed % 17);
  const countAfter = useRemove ? Math.max(12, countBefore - outliersTouched) : countBefore;
  const baselineMean = round(80 + (((seed >>> 3) % 500) - 250) / 20, 4);
  const baselineStd = round(6 + (((seed >>> 5) % 250) / 25), 4);
  const baselineSlope = round((((seed >>> 7) % 240) - 120) / 1000, 6);
  const smoothingReduction = includeMovingAverage ? 0.3 + (((seed >>> 9) % 8) / 20) : 0;
  const transformedMean = round(baselineMean - (useRemove ? 0.28 : 0.12), 4);
  const transformedStd = round(Math.max(0.05, baselineStd - (useRemove ? 0.9 : 0.55) - smoothingReduction), 4);
  const transformedSlope = round(baselineSlope + (includeMovingAverage ? -0.003 : 0.002), 6);

  return {
    baseline: {
      count_before: countBefore,
      count_after: countBefore,
      outliers_removed: 0,
      mean: baselineMean,
      std: baselineStd,
      slope: baselineSlope,
    },
    transformed: {
      count_before: countBefore,
      count_after: countAfter,
      outliers_removed: outliersTouched,
      mean: transformedMean,
      std: transformedStd,
      slope: transformedSlope,
    },
  };
}

function buildParentStats(seed: number, childStats: TransformStats): TransformStats {
  const parentCountBefore = childStats.count_before + 5 + ((seed >>> 11) % 7);
  const parentOutliers = Math.max(0, childStats.outliers_removed - 1);
  const parentCountAfter = Math.max(10, parentCountBefore - parentOutliers);

  return {
    count_before: parentCountBefore,
    count_after: parentCountAfter,
    outliers_removed: parentOutliers,
    mean: childStats.mean === null ? null : round(childStats.mean + 0.22, 4),
    std: childStats.std === null ? null : round(childStats.std + 0.35, 4),
    slope: childStats.slope === null ? null : round(childStats.slope - 0.004, 6),
  };
}

export function mockTransformProposal(args: MockTransformProposalArgs): MockTransformProposalResult {
  const metricLabel = buildMetricLabel(args.importMeta);
  const seed = stableHash(
    `${args.prompt}|${args.importId}|${metricLabel}|${args.startTs}|${args.endTs}|${args.parentThreadId ?? "root"}`,
  );
  const useRemove = seed % 2 === 0;
  const includeMovingAverage = seed % 3 === 0;
  const movingWindow = 3 + ((seed >>> 2) % 5);

  const ops: TransformSpec["ops"] = [
    useRemove
      ? {
          op: "filter_outliers",
          method: "zscore",
          mode: "remove",
          z: 3,
        }
      : {
          op: "filter_outliers",
          method: "iqr",
          mode: "clip",
          k: 1.5,
        },
  ];

  if (includeMovingAverage) {
    ops.push({
      op: "moving_average",
      window: movingWindow,
      center: false,
    });
  }

  const transformSpec: TransformSpec = {
    version: 1,
    ops,
  };

  const { baseline, transformed } = buildMockStats(seed, useRemove, includeMovingAverage);
  const statsPayload: MockTransformStatsPayload = {
    transformed,
    baseline,
    diff: compareStats(baseline, transformed),
    demo_note: DEMO_MODE_NOTE,
  };

  const clipMin = round(10 + (((seed >>> 4) % 250) / 10), 2);
  const clipMax = round(clipMin + 40 + (((seed >>> 8) % 200) / 10), 2);
  const sqlPreview = [
    `/* ${DEMO_MODE_NOTE} */`,
    "/* Preview only; this SQL is illustrative and is NOT executed. */",
    useRemove
      ? "SELECT ts, value"
      : `SELECT ts, LEAST(GREATEST(value, ${clipMin}), ${clipMax}) AS value`,
    "FROM metric_points",
    `WHERE import_id = '${args.importId}'`,
    `  AND ts >= '${args.startTs}'`,
    `  AND ts < '${args.endTs}'`,
    useRemove ? "  -- pseudo filter: ABS((value - avg_value) / std_value) <= 3" : "  -- pseudo clip: constrain to p5/p95 demo bounds",
    includeMovingAverage ? `  -- pseudo smoothing: moving_average(window=${movingWindow})` : "",
    "ORDER BY ts;",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const titleTemplates = [
    `Demo proposal: stabilize ${metricLabel}`,
    `Demo proposal: outlier guard for ${metricLabel}`,
    `Demo proposal: smoother trend for ${metricLabel}`,
  ];
  const title = pick(titleTemplates, seed);

  const explanation = [
    `This deterministic demo proposal is based on prompt hash ${seed}.`,
    useRemove
      ? "Primary op removes z-score outliers (z=3) to reduce extreme spikes."
      : `Primary op clips extremes to demo bounds (${clipMin} to ${clipMax}).`,
    includeMovingAverage ? `Secondary op applies moving_average(window=${movingWindow}).` : "No secondary smoothing op was selected.",
    "Counts and stats are mock values for collaboration/testing only.",
  ].join(" ");

  let diffReport: Record<string, unknown> | null = null;

  if (args.parentThreadId) {
    const parentStats = buildParentStats(seed, transformed);
    const deltas = compareStats(parentStats, transformed);

    diffReport = {
      parent_thread_id: args.parentThreadId,
      parent_stats: parentStats,
      child_stats: transformed,
      deltas,
      summary: mockDiffSummary({
        deltas,
        beforeStats: parentStats,
        afterStats: transformed,
      }),
    };
  }

  return {
    title,
    explanation,
    transformSpec,
    sqlPreview,
    statsPayload,
    diffReport,
  };
}

export function mockDiffSummary(args: {
  deltas?: unknown;
  beforeStats?: Partial<TransformStats> | null;
  afterStats?: Partial<TransformStats> | null;
}): string {
  const seed = stableHash(JSON.stringify(args));
  const intros = [
    "Demo diff summary:",
    "Mock comparison:",
    "Deterministic review:",
  ];
  const intro = pick(intros, seed);

  const countAfterDelta =
    readDeltaValue(args.deltas, "count_after") ??
    (() => {
      const before = asFiniteNumber(args.beforeStats?.count_after);
      const after = asFiniteNumber(args.afterStats?.count_after);
      if (before === null || after === null) {
        return null;
      }
      return round(after - before, 0);
    })();

  const stdDelta =
    readDeltaValue(args.deltas, "std") ??
    (() => {
      const before = asFiniteNumber(args.beforeStats?.std);
      const after = asFiniteNumber(args.afterStats?.std);
      if (before === null || after === null) {
        return null;
      }
      return round(after - before, 4);
    })();

  const slopeDelta =
    readDeltaValue(args.deltas, "slope") ??
    (() => {
      const before = asFiniteNumber(args.beforeStats?.slope);
      const after = asFiniteNumber(args.afterStats?.slope);
      if (before === null || after === null) {
        return null;
      }
      return round(after - before, 6);
    })();

  return `${intro} count_after ${formatSigned(countAfterDelta, 0)}, std ${formatSigned(stdDelta, 3)}, slope ${formatSigned(slopeDelta, 4)}.`;
}
