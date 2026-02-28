import { notFound } from "next/navigation";
import ThreadShareActions from "@/app/components/ThreadShareActions";
import ThreadSnapshotChart from "@/app/components/ThreadSnapshotChart";
import ThreadTitleEditor from "@/app/components/ThreadTitleEditor";
import ThreadArena from "@/app/components/ThreadArena";
import TransformProposalForkForm from "@/app/components/TransformProposalForkForm";
import { getDecisionForThread } from "@/lib/db/decisions";
import { getThread } from "@/lib/db/threads";
import { createClient } from "@/lib/supabase/server";
import type { RefereeReport } from "@/lib/referee/schema";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";
import { formatCount as formatCountLabel, formatNumber as formatNumberLabel } from "@/lib/formatNumber";
import { extractSelectedSeries } from "@/lib/snapshot";
import { formatMetricLabel, shortId } from "@/lib/threadLabel";
import { getDisplayNameFromUser } from "@/lib/userDisplay";

export const dynamic = "force-dynamic";

interface ThreadPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  mean: number | null;
  std: number | null;
  slope: number | null;
  warnings?: string[];
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
  const mean = asNullableFiniteNumber(record.mean);
  const std = asNullableFiniteNumber(record.std);
  const slope = asNullableFiniteNumber(record.slope);

  if (
    countBefore === null ||
    countAfter === null ||
    outliersRemoved === null ||
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
    mean,
    std,
    slope,
    ...(warnings ? { warnings } : {}),
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

function formatSignedNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "-";
  }

  const formatted = formatNumberLabel(value, digits);

  return value > 0 ? `+${formatted}` : formatted;
}

function formatSignedCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const rounded = Math.round(value);
  const formatted = formatCountLabel(rounded);

  return rounded > 0 ? `+${formatted}` : formatted;
}

function resolveProposalTitle(thread: unknown) {
  const title = asRecord(thread)?.title;
  return asNonEmptyString(title) ?? "Transform Proposal";
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatNumberLabel(value, digits);
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatCountLabel(Math.round(value));
}

function asSearchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return asSearchValue(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildBackToArenaHref(input: { importId: string | null; start: string | null; end: string | null }): string {
  const query = new URLSearchParams();

  if (input.importId) {
    query.set("import", input.importId);
  }

  if (input.start) {
    query.set("start", input.start);
  }

  if (input.end) {
    query.set("end", input.end);
  }

  const queryString = query.toString();
  return queryString.length > 0 ? `/?${queryString}#chart` : "/#chart";
}

export default async function Page({ params, searchParams }: ThreadPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  let thread = null;
  let initialDecisionId: string | null = null;
  let currentUserId: string | null = null;
  let currentUserDisplayName: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!authError && user) {
      currentUserId = user.id;
      currentUserDisplayName = getDisplayNameFromUser(user);
    }
  } catch {
    currentUserId = null;
    currentUserDisplayName = null;
  }

  try {
    thread = await getThread(id);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Thread</h1>
        <p className="mt-2 text-sm text-red-600">Failed to load: {error instanceof Error ? error.message : "Unknown error"}</p>
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
  const metricName = thread.metric?.name ?? snapshot.metric?.name ?? null;
  const metricUnit = thread.metric?.unit ?? snapshot.metric?.unit ?? null;
  const metricLabel = formatMetricLabel({ name: metricName, unit: metricUnit });
  const selectedPoints = extractSelectedSeries(thread.snapshot) ?? [];
  const selectedAvg = snapshot.selected?.avg ?? null;
  const selectedN = snapshot.selected?.n ?? null;
  const beforeAvg = snapshot.before?.avg ?? null;
  const beforeN = snapshot.before?.n ?? null;
  const deltaAbs = snapshot.delta?.abs ?? null;
  const deltaRel = snapshot.delta?.rel ?? null;
  const rangeStart = snapshot.range?.start_ts ?? thread.start_ts;
  const rangeEnd = snapshot.range?.end_ts ?? thread.end_ts;
  const rangeLabel = `Range: ${formatDateLabel(rangeStart)} → ${formatDateLabel(rangeEnd)}`;
  const threadShortId = shortId(thread.id);
  const backToArenaHref = buildBackToArenaHref({
    importId: asSearchValue(resolvedSearchParams.import),
    start: asSearchValue(resolvedSearchParams.start),
    end: asSearchValue(resolvedSearchParams.end),
  });
  const isTransformProposal = thread.kind === "transform_proposal";
  const proposalTitle = resolveProposalTitle(thread);
  const proposalPrompt = asNonEmptyString(thread.transform_prompt);
  const sqlPreview = asNonEmptyString(thread.transform_sql_preview);
  const proposalStatsRecord = asRecord(thread.transform_stats);
  const proposalStats = extractComparableStats(thread.transform_stats);
  const proposalDemoNote = asNonEmptyString(proposalStatsRecord?.demo_note);
  const diffReport = asRecord(thread.transform_diff_report);
  const diffError = asNonEmptyString(diffReport?.error);
  const deltas = asRecord(diffReport?.deltas);
  const meanDelta = readDeltaValue(deltas, "mean");
  const stdDelta = readDeltaValue(deltas, "std");
  const slopeDelta = readDeltaValue(deltas, "slope");
  const countAfterDelta = readDeltaValue(deltas, "count_after");
  const hasCompareSection = isTransformProposal && (Boolean(thread.parent_thread_id) || diffReport !== null);
  const compareItems = [
    { label: "Mean Δ", value: formatSignedNumber(meanDelta) },
    { label: "Std Δ", value: formatSignedNumber(stdDelta) },
    { label: "Slope Δ", value: formatSignedNumber(slopeDelta) },
    { label: "Count After Δ", value: formatSignedCount(countAfterDelta) },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <ThreadTitleEditor threadId={thread.id} initialTitle={thread.title} />
      {isTransformProposal ? (
        <p className="mt-2">
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            Proposal
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-600">
        Metric: {metricLabel} • {rangeLabel} • ID: {threadShortId}
      </p>
      <ThreadShareActions threadId={thread.id} backHref={backToArenaHref} />

      <ThreadSnapshotChart points={selectedPoints} metricLabel={metricLabel} />

      {isTransformProposal ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{proposalTitle}</h2>
              <p className="mt-1 text-xs text-zinc-600">Proposal thread for collaborative transform review.</p>
              {proposalDemoNote ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  {proposalDemoNote}
                </p>
              ) : null}
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
              <p className="text-xs font-medium text-zinc-500">SQL Preview (not executed)</p>
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
                {diffError ? (
                  <p className="mt-1 rounded-md border border-zinc-200 bg-white p-3 text-zinc-600">{diffError}</p>
                ) : (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {compareItems.map((item) => (
                      <p key={item.label} className="rounded-md border border-zinc-200 bg-white p-3">
                        {item.label}: <span className="font-medium">{item.value}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Snapshot Summary</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Metric</p>
            <p className="mt-1 font-medium">{metricLabel}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Selected Avg / n</p>
            <p className="mt-1 font-medium">
              {formatNumber(selectedAvg)} / {formatCount(selectedN)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Previous Avg / n</p>
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
            <p className="text-xs text-zinc-500">Created</p>
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
        currentUserId={currentUserId}
        currentUserDisplayName={currentUserDisplayName}
      />
    </main>
  );
}
