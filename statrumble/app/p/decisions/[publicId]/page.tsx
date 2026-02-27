import { notFound } from "next/navigation";
import { getPublicDecisionDetailByPublicId } from "@/lib/db/decisions";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

interface PublicDecisionPageProps {
  params: Promise<{ publicId: string }>;
}

function extractRefereeSummary(report: unknown) {
  if (!report || typeof report !== "object") {
    return null;
  }

  const record = report as Record<string, unknown>;
  const tldr = typeof record.tldr === "string" ? record.tldr.trim() : "";

  return tldr.length > 0 ? tldr : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    const record = asRecord(current);

    if (!record || !(key in record)) {
      return null;
    }

    current = record[key];
  }

  return current;
}

function formatStatValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }

  return "-";
}

function getStatValue(stats: unknown, candidatePaths: string[][]): string {
  for (const path of candidatePaths) {
    const value = getNestedValue(stats, path);

    if (value !== null && value !== undefined) {
      const formatted = formatStatValue(value);
      if (formatted !== "-") {
        return formatted;
      }
    }
  }

  return "-";
}

function extractTransformOps(spec: unknown): string[] {
  const record = asRecord(spec);

  if (!record || !Array.isArray(record.ops)) {
    return [];
  }

  const ops = record.ops
    .map((entry) => {
      const opRecord = asRecord(entry);
      if (!opRecord || typeof opRecord.op !== "string") {
        return null;
      }

      const op = opRecord.op.trim();
      return op.length > 0 ? op : null;
    })
    .filter((op): op is string => Boolean(op));

  return Array.from(new Set(ops));
}

export default async function PublicDecisionPage({ params }: PublicDecisionPageProps) {
  const { publicId } = await params;

  if (!publicId) {
    notFound();
  }

  let decision = null;

  try {
    decision = await getPublicDecisionDetailByPublicId(publicId);
  } catch {
    decision = null;
  }

  if (!decision) {
    notFound();
  }

  const refereeSummary = extractRefereeSummary(decision.referee_report);
  const transformOps = extractTransformOps(decision.transform_spec);
  const hasTransformPayload = Boolean(
    decision.transform_spec || decision.transform_sql_preview || decision.transform_stats,
  );
  const shouldShowTransform = decision.thread_kind === "transform_proposal" && hasTransformPayload;

  const transformStatsItems = [
    {
      label: "Count Before",
      value: getStatValue(decision.transform_stats, [["transformed", "count_before"], ["count_before"]]),
    },
    {
      label: "Count After",
      value: getStatValue(decision.transform_stats, [["transformed", "count_after"], ["count_after"]]),
    },
    {
      label: "Outliers Removed",
      value: getStatValue(decision.transform_stats, [
        ["transformed", "outliers_removed"],
        ["outliers_removed"],
      ]),
    },
    {
      label: "Mean",
      value: getStatValue(decision.transform_stats, [["transformed", "mean"], ["mean"]]),
    },
    {
      label: "Std",
      value: getStatValue(decision.transform_stats, [["transformed", "std"], ["std"]]),
    },
    {
      label: "Slope",
      value: getStatValue(decision.transform_stats, [["transformed", "slope"], ["slope"]]),
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 md:px-8">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Public Decision</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{decision.title ?? "Untitled"}</h1>
          <p className="mt-3 text-sm text-zinc-700">{decision.summary ?? "No summary"}</p>
          <div className="mt-4 grid gap-2 text-sm text-zinc-600 md:grid-cols-2">
            <p>
              Snapshot Start: <span className="font-medium">{formatDateLabel(decision.snapshot_start)}</span>
            </p>
            <p>
              Snapshot End: <span className="font-medium">{formatDateLabel(decision.snapshot_end)}</span>
            </p>
            <p>
              Created: <span className="font-medium">{formatDateLabel(decision.created_at)}</span>
            </p>
          </div>
        </section>

        {refereeSummary ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-900">Referee Summary</h2>
            <p className="mt-2 text-sm text-zinc-700">{refereeSummary}</p>
          </section>
        ) : null}

        {shouldShowTransform ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-emerald-950">Transform Proposal</h2>
              {transformOps.length > 0
                ? transformOps.map((op) => (
                    <span
                      key={op}
                      className="rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-xs font-medium text-emerald-800"
                    >
                      {op}
                    </span>
                  ))
                : (
                    <span className="rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-xs font-medium text-emerald-800">
                      ops: -
                    </span>
                  )}
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-emerald-900">Stats</h3>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {transformStatsItems.map((item) => (
                  <div key={item.label} className="rounded-lg border border-emerald-200 bg-white/80 px-3 py-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-emerald-700">{item.label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-emerald-950">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-4 space-y-3">
              {decision.transform_prompt ? (
                <details className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Prompt</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{decision.transform_prompt}</p>
                </details>
              ) : null}

              {decision.transform_sql_preview ? (
                <details className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-900">SQL Preview</summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-zinc-900/95 p-3 text-xs text-zinc-100">
                    {decision.transform_sql_preview}
                  </pre>
                </details>
              ) : null}

              {decision.transform_spec ? (
                <details className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
                    Transform Spec JSON
                  </summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-zinc-900/95 p-3 text-xs text-zinc-100">
                    {JSON.stringify(decision.transform_spec, null, 2)}
                  </pre>
                </details>
              ) : null}

              {decision.transform_diff_report ? (
                <details className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Diff Report JSON</summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-zinc-900/95 p-3 text-xs text-zinc-100">
                    {JSON.stringify(decision.transform_diff_report, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-emerald-900/80">SQL preview is for review only; not executed.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
