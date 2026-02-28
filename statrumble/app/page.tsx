import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listImports, listMetrics, listThreads, type MetricImportRow } from "@/lib/db";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import UploadCsvForm from "@/app/components/UploadCsvForm";
import ImportChart from "@/app/components/ImportChart";
import { formatDateTimeLabel } from "@/lib/formatDate";
import { formatMetricLabel, formatThreadPrimaryTitle, shortId } from "@/lib/threadLabel";

export const dynamic = "force-dynamic";

function getImportMetric(row: MetricImportRow) {
  const metric = Array.isArray(row.metrics) ? row.metrics[0] : row.metrics;

  if (!metric) {
    return null;
  }

  return {
    name: metric.name,
    unit: metric.unit,
  };
}

function formatImportMetricLabel(row: MetricImportRow) {
  return formatMetricLabel(getImportMetric(row));
}

function formatImportDisplayName(row: MetricImportRow) {
  const metricLabel = formatImportMetricLabel(row);
  const fileLabel = row.file_name?.trim() ? row.file_name.trim() : "no file name";
  const createdLabel = formatDateTimeLabel(row.created_at);
  return `${metricLabel} • ${fileLabel} • ${createdLabel}`;
}

export default async function Home() {
  let hasMembership = false;

  try {
    const memberships = await listMemberWorkspaceSummaries();
    hasMembership = memberships.length > 0;
  } catch {
    hasMembership = false;
  }

  if (!hasMembership) {
    return (
      <main className="min-h-screen bg-zinc-50">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
          <h1 className="text-2xl font-semibold">Arena</h1>
          <p className="mt-2 text-sm text-zinc-600">Join a workspace to start debating metric snapshots.</p>
          <OnboardingCard
            title="You are not in a workspace yet."
            description="Use an invite code or create a new workspace to get started."
          />
        </div>
      </main>
    );
  }

  const [metricsResult, importsResult, threadsResult] = await Promise.allSettled([
    listMetrics(),
    listImports(10),
    listThreads(10),
  ]);
  const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : [];
  const imports = importsResult.status === "fulfilled" ? importsResult.value : [];
  const threads = threadsResult.status === "fulfilled" ? threadsResult.value : [];
  const importsForChart = imports.map((item) => ({
    id: item.id,
    file_name: item.file_name,
    created_at: item.created_at,
    display_name: formatImportDisplayName(item),
  }));
  const metricsError = metricsResult.status === "rejected" ? metricsResult.reason : null;
  const importsError = importsResult.status === "rejected" ? importsResult.reason : null;
  const threadsError = threadsResult.status === "rejected" ? threadsResult.reason : null;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Arena</h1>
        <p className="mt-2 text-sm text-zinc-600">Upload data, choose a range, and launch a thread for review.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section id="chart" className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-medium">Chart</h2>
              <p className="mt-1 text-sm text-zinc-600">Select an import and range to create a thread.</p>
              {importsError ? (
                <p className="mt-2 text-sm text-red-600">
                  Failed to load: {importsError instanceof Error ? importsError.message : "Unknown error"}
                </p>
              ) : (
                <ImportChart imports={importsForChart} />
              )}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <details open={imports.length === 0}>
                <summary className="cursor-pointer select-none text-sm font-medium">Data</summary>
                <div className="mt-4 space-y-6">
                  <div>
                    <h3 className="font-medium">CSV Upload</h3>
                    <p className="mt-1 text-sm text-zinc-600">Upload a CSV and map the metric fields.</p>
                    <UploadCsvForm />
                  </div>

                  <div>
                    <h3 className="font-medium">Metrics</h3>
                    {metricsError ? (
                      <p className="mt-2 text-sm text-red-600">
                        Failed to load: {metricsError instanceof Error ? metricsError.message : "Unknown error"}
                      </p>
                    ) : metrics.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-600">No metrics yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm">
                        {metrics.map((metric) => (
                          <li key={metric.id} className="rounded border border-zinc-200 px-3 py-2">
                            <p className="font-medium">
                              {metric.name}
                              {metric.unit ? ` (${metric.unit})` : ""}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDateTimeLabel(metric.created_at)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="font-medium">Imports (Latest 10)</h3>
                    {importsError ? (
                      <p className="mt-2 text-sm text-red-600">
                        Failed to load: {importsError instanceof Error ? importsError.message : "Unknown error"}
                      </p>
                    ) : imports.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-600">No imports yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm">
                        {imports.map((item) => (
                          <li key={item.id} className="rounded border border-zinc-200 px-3 py-2">
                            <p className="font-medium">{item.file_name ?? "(no file name)"}</p>
                            <p className="mt-1 text-xs text-zinc-600">Rows: {item.row_count}</p>
                            <p className="mt-1 text-xs text-zinc-600">Metric: {formatImportMetricLabel(item)}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDateTimeLabel(item.created_at)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </details>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">Recent threads</h2>
                <Link href="/threads" className="text-xs font-medium text-zinc-700 hover:underline">
                  View all
                </Link>
              </div>
              {threadsError ? (
                <p className="mt-2 text-sm text-red-600">
                  Failed to load: {threadsError instanceof Error ? threadsError.message : "Unknown error"}
                </p>
              ) : threads.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">No threads yet. Create one from the chart.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {threads.map((thread) => (
                    <li key={thread.id} className="rounded border border-zinc-200 px-3 py-2">
                      <p className="font-medium">
                        <Link href={`/threads/${thread.id}`} className="hover:underline">
                          {formatThreadPrimaryTitle(thread)}
                        </Link>
                        {thread.kind === "transform_proposal" ? (
                          <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                            Proposal
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Range: {formatDateTimeLabel(thread.start_ts)} → {formatDateTimeLabel(thread.end_ts)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        ID: {shortId(thread.id)} • {formatDateTimeLabel(thread.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
