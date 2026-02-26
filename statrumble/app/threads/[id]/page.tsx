import { notFound } from "next/navigation";
import ThreadArena from "@/app/components/ThreadArena";
import TransformDiffSummary from "@/app/components/TransformDiffSummary";
import TransformProposalForkForm from "@/app/components/TransformProposalForkForm";
import { getDecisionForThread } from "@/lib/db/decisions";
import { getThread } from "@/lib/db/threads";
import type { RefereeReport } from "@/lib/referee/schema";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

interface ThreadPageProps {
  params: Promise<{ id: string }>;
}

type SnapshotMetric = {
  name?: string | null;
  unit?: string | null;
};

type SnapshotRange = {
  start_ts?: string | null;
  end_ts?: string | null;
};

type SnapshotStats = {
  n?: number | null;
  avg?: number | null;
};

type SnapshotDelta = {
  abs?: number | null;
  rel?: number | null;
};

type ThreadSnapshot = {
  metric?: SnapshotMetric | null;
  range?: SnapshotRange | null;
  selected?: SnapshotStats | null;
  before?: SnapshotStats | null;
  delta?: SnapshotDelta | null;
};

type ComparableStats = {
  count_before: number;
  count_after: number;
  outliers_removed: number;
  outliers_clipped: number;
  mean: number | null;
  std: number | null;
  slope: number | null;
  warnings?: string[];
};

type CodexDiffSummary = {
  summary: string;
  key_diffs: string[];
  risks: string[];
  recommendation: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return asFiniteNumber(value) ?? undefined;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => Boolean(item));

  if (normalized.length !== value.length) {
    return null;
  }

  return normalized;
}

function extractComparableStats(value: unknown): ComparableStats | null {
  const direct = extractComparableStatsFromRecord(asRecord(value));

  if (direct) {
    return direct;
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  return extractComparableStatsFromRecord(asRecord(record.transformed));
}

function extractComparableStatsFromRecord(record: Record<string, unknown> | null): ComparableStats | null {
  if (!record) {
    return null;
  }

  const countBefore = asFiniteNumber(record.count_before);
  const countAfter = asFiniteNumber(record.count_after);
  const outliersRemoved = asFiniteNumber(record.outliers_removed);
  const outliersClippedRaw = record.outliers_clipped;
  const outliersClipped =
    outliersClippedRaw === undefined || outliersClippedRaw === null ? 0 : asFiniteNumber(outliersClippedRaw);
  const mean = asNullableFiniteNumber(record.mean);
  const std = asNullableFiniteNumber(record.std);
  const slope = asNullableFiniteNumber(record.slope);

  if (
    countBefore === null ||
    countAfter === null ||
    outliersRemoved === null ||
    outliersClipped === null ||
    mean === undefined ||
    std === undefined ||
    slope === undefined
  ) {
    return null;
  }

  const warningsRaw = record.warnings;
  let warnings: string[] | undefined;

  if (warningsRaw !== undefined) {
    if (!Array.isArray(warningsRaw) || warningsRaw.some((item) => typeof item !== "string")) {
      return null;
    }

    const normalizedWarnings = (warningsRaw as string[]).map((item) => item.trim()).filter((item) => item.length > 0);

    if (normalizedWarnings.length > 0) {
      warnings = normalizedWarnings;
    }
  }

  return {
    count_before: countBefore,
    count_after: countAfter,
    outliers_removed: outliersRemoved,
    outliers_clipped: outliersClipped,
    mean,
    std,
    slope,
    ...(warnings ? { warnings } : {}),
  };
}

function extractCodexDiffSummary(value: unknown): CodexDiffSummary | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const summary = asNonEmptyString(record.summary);
  const keyDiffs = asStringArray(record.key_diffs);
  const risks = asStringArray(record.risks);
  const recommendation = asNonEmptyString(record.recommendation);

  if (!summary || !keyDiffs || !risks || !recommendation) {
    return null;
  }

  return {
    summary,
    key_diffs: keyDiffs,
    risks,
    recommendation,
  };
}

function readDeltaValue(deltas: Record<string, unknown> | null, key: string): number | null | undefined {
  if (!deltas) {
    return undefined;
  }

  const entry = asRecord(deltas[key]);

  if (!entry) {
    return undefined;
  }

  const delta = entry.delta;

  if (delta === null) {
    return null;
  }

  return asFiniteNumber(delta) ?? undefined;
}

function formatSignedNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined) {
    return "—";
  }

  const sign = value < 0 ? "-" : "+";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return `${sign}${formatted}`;
}

function formatSignedCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "+";
  const formatted = Math.abs(rounded).toLocaleString("en-US");

  return `${sign}${formatted}`;
}

function resolveProposalTitle(thread: unknown) {
  const title = asRecord(thread)?.title;
  return asNonEmptyString(title) ?? "Transform Proposal";
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return Math.round(value).toLocaleString("en-US");
}

export default async function Page({ params }: ThreadPageProps) {
  const { id } = await params;
  let thread = null;
  let initialDecisionId: string | null = null;

  try {
    thread = await getThread(id);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Thread #{id}</h1>
        <p className="mt-2 text-sm text-red-600">
          Load failed: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </main>
    );
  }

  if (thread === null) {
    notFound();
  }

  try {
    const decision = await getDecisionForThread(id);
    initialDecisionId = decision?.id ?? null;
  } catch {
    initialDecisionId = null;
  }

  const snapshot = (thread.snapshot ?? {}) as ThreadSnapshot;
  const metricName = thread.metric?.name ?? snapshot.metric?.name ?? "-";
  const metricUnit = thread.metric?.unit ?? snapshot.metric?.unit ?? null;
  const selectedAvg = snapshot.selected?.avg ?? null;
  const selectedN = snapshot.selected?.n ?? null;
  const beforeAvg = snapshot.before?.avg ?? null;
  const beforeN = snapshot.before?.n ?? null;
  const deltaAbs = snapshot.delta?.abs ?? null;
  const deltaRel = snapshot.delta?.rel ?? null;
  const rangeStart = snapshot.range?.start_ts ?? thread.start_ts;
  const rangeEnd = snapshot.range?.end_ts ?? thread.end_ts;
  const isTransformProposal = thread.kind === "transform_proposal";
  const proposalTitle = resolveProposalTitle(thread);
  const proposalPrompt = asNonEmptyString(thread.transform_prompt);
  const sqlPreview = asNonEmptyString(thread.transform_sql_preview);
  const proposalStats = extractComparableStats(thread.transform_stats);
  const diffReport = asRecord(thread.transform_diff_report);
  const diffError = asNonEmptyString(diffReport?.error);
  const deltas = asRecord(diffReport?.deltas);
  const initialCodexSummary = extractCodexDiffSummary(diffReport?.codex_summary);
  const countBeforeDelta = readDeltaValue(deltas, "count_before");
  const countAfterDelta = readDeltaValue(deltas, "count_after");
  const outliersRemovedDelta = readDeltaValue(deltas, "outliers_removed");
  const outliersClippedDelta = readDeltaValue(deltas, "outliers_clipped");
  const meanDelta = readDeltaValue(deltas, "mean");
  const stdDelta = readDeltaValue(deltas, "std");
  const slopeDelta = readDeltaValue(deltas, "slope");
  const hasCompareSection = isTransformProposal && (Boolean(thread.parent_thread_id) || diffReport !== null);
  const explicitDeltaValues = [
    countBeforeDelta,
    countAfterDelta,
    outliersRemovedDelta,
    outliersClippedDelta,
    meanDelta,
    stdDelta,
    slopeDelta,
  ];
  const hasExplicitDelta = explicitDeltaValues.some((value) => value !== null && value !== undefined);
  const countDeltasForHint = [countBeforeDelta, countAfterDelta, outliersRemovedDelta, outliersClippedDelta].map((value) =>
    value === null || value === undefined ? 0 : Math.round(value),
  );
  const floatDeltasForHint = [meanDelta, stdDelta, slopeDelta].map((value) => (value === null || value === undefined ? 0 : value));
  const hasLittleToNoChange =
    hasExplicitDelta &&
    countDeltasForHint.every((value) => value === 0) &&
    floatDeltasForHint.every((value) => Math.abs(value) < 0.0001);
  const compareItems = [
    { label: "Count Before Δ", value: formatSignedCount(countBeforeDelta) },
    { label: "Count After Δ", value: formatSignedCount(countAfterDelta) },
    { label: "Outliers Removed Δ", value: formatSignedCount(outliersRemovedDelta) },
    { label: "Outliers Clipped Δ", value: formatSignedCount(outliersClippedDelta) },
    { label: "Mean Δ", value: formatSignedNumber(meanDelta) },
    { label: "Std Δ", value: formatSignedNumber(stdDelta) },
    { label: "Slope Δ", value: formatSignedNumber(slopeDelta) },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Thread #{id}</h1>
      <p className="mt-2 text-sm text-zinc-600">Discussion and voting are based on the snapshot captured at creation time.</p>

      {isTransformProposal ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{proposalTitle}</h2>
              <p className="mt-1 text-xs text-zinc-600">Proposal thread for collaborative transform review.</p>
            </div>
            <TransformProposalForkForm importId={thread.import_id} parentThreadId={thread.id} />
          </div>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium text-zinc-500">Prompt</p>
              <p className="mt-1 rounded-md border border-zinc-200 bg-white p-3 text-zinc-800">
                {proposalPrompt ?? "No prompt recorded."}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-500">SQL Preview</p>
              <p className="mt-1 text-xs text-zinc-500">
                SQL preview is for review only and is NOT executed. The server executes only a safe TransformSpec DSL.
              </p>
              <pre className="mt-1 overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800">
                <code>{sqlPreview ?? "No SQL preview."}</code>
              </pre>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-500">Transform Stats</p>
              {proposalStats ? (
                <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    count_before: <span className="font-medium">{formatCount(proposalStats.count_before)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    count_after: <span className="font-medium">{formatCount(proposalStats.count_after)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    outliers_removed: <span className="font-medium">{formatCount(proposalStats.outliers_removed)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    outliers_clipped: <span className="font-medium">{formatCount(proposalStats.outliers_clipped)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    mean: <span className="font-medium">{formatNumber(proposalStats.mean)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    std: <span className="font-medium">{formatNumber(proposalStats.std)}</span>
                  </p>
                  <p className="rounded-md border border-zinc-200 bg-white p-3">
                    slope: <span className="font-medium">{formatNumber(proposalStats.slope)}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-1 rounded-md border border-zinc-200 bg-white p-3 text-zinc-600">Stats unavailable.</p>
              )}
            </div>

            {proposalStats?.warnings && proposalStats.warnings.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-zinc-500">Warnings</p>
                <ul className="mt-1 space-y-1">
                  {proposalStats.warnings.map((warning) => (
                    <li key={warning} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasCompareSection ? (
              <div>
                <p className="text-xs font-medium text-zinc-500">Compare to parent</p>
                <p className="mt-1 text-xs text-zinc-500">Deltas are shown as child - parent.</p>
                {diffError ? (
                  <p className="mt-2 rounded-md border border-zinc-200 bg-white p-3 text-zinc-600">{diffError}</p>
                ) : (
                  <>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {compareItems.map((item) => (
                        <p key={item.label} className="rounded-md border border-zinc-200 bg-white p-3">
                          {item.label}: <span className="font-medium">{item.value}</span>
                        </p>
                      ))}
                    </div>
                    <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                      <p className="font-medium text-zinc-700">Interpretation hints</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        <li>Std dev decrease means smoother / less volatility.</li>
                        <li>Count decrease means points were removed (potential data loss).</li>
                        <li>Slope change may indicate trend distortion.</li>
                        <li>Mean shift indicates level offset vs parent.</li>
                      </ul>
                    </div>
                    {hasLittleToNoChange ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        No meaningful change vs parent (data may be stable or the spec may be identical).
                      </p>
                    ) : null}
                    {thread.parent_thread_id ? (
                      <TransformDiffSummary threadId={thread.id} initialSummary={initialCodexSummary} />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Snapshot Summary</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Metric</p>
            <p className="mt-1 font-medium">
              {metricName}
              {metricUnit ? ` (${metricUnit})` : ""}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Selected Range Avg / n</p>
            <p className="mt-1 font-medium">
              {formatNumber(selectedAvg)} / {formatCount(selectedN)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Previous Range Avg / n</p>
            <p className="mt-1 font-medium">
              {formatNumber(beforeAvg)} / {formatCount(beforeN)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Delta (abs)</p>
            <p className="mt-1 font-medium">{formatNumber(deltaAbs)}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Delta (rel %)</p>
            <p className="mt-1 font-medium">{deltaRel === null ? "-" : `${formatNumber(deltaRel * 100)}%`}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Created At</p>
            <p className="mt-1 font-medium">{formatDateLabel(thread.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            Start: <span className="font-medium">{formatDateLabel(rangeStart ?? thread.start_ts)}</span>
          </p>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            End: <span className="font-medium">{formatDateLabel(rangeEnd ?? thread.end_ts)}</span>
          </p>
        </div>
      </div>

      <ThreadArena
        threadId={thread.id}
        snapshot={thread.snapshot}
        initialRefereeReport={(thread.referee_report as RefereeReport | null) ?? null}
        initialDecisionId={initialDecisionId}
      />
    </main>
  );
}
