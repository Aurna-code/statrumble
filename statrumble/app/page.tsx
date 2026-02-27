import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listImports, listMetrics, listThreads, type MetricImportRow } from "@/lib/db";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import UploadCsvForm from "@/app/components/UploadCsvForm";
import ImportChart from "@/app/components/ImportChart";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

function formatMetricLabel(row: MetricImportRow) {
  const metric = Array.isArray(row.metrics) ? row.metrics[0] : row.metrics;

  if (!metric) {
    return "-";
  }

  return metric.unit ? `${metric.name} (${metric.unit})` : metric.name;
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
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">StatRumble</h1>
        <p className="mt-2 text-sm text-zinc-600">Join a workspace to start a data debate.</p>
        <OnboardingCard />
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
  }));
  const metricsError = metricsResult.status === "rejected" ? metricsResult.reason : null;
  const importsError = importsResult.status === "rejected" ? importsResult.reason : null;
  const threadsError = threadsResult.status === "rejected" ? threadsResult.reason : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">StatRumble</h1>
      <p className="mt-2 text-sm text-zinc-600">Upload a metric series, select a range, and start an Arena thread.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">CSV Upload</h2>
        <p className="mt-1 text-sm text-zinc-600">Upload a CSV to create an import.</p>
        <UploadCsvForm />
      </section>

      <section id="chart" className="mt-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Chart</h2>
        <p className="mt-1 text-sm text-zinc-600">Select an import and a range to create an Arena Thread.</p>
        {importsError ? (
          <p className="mt-2 text-sm text-red-600">
            Failed to load: {importsError instanceof Error ? importsError.message : "Unknown error"}
          </p>
        ) : (
          <ImportChart imports={importsForChart} />
        )}
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Threads</h2>
        {threadsError ? (
          <p className="mt-2 text-sm text-red-600">
            Failed to load: {threadsError instanceof Error ? threadsError.message : "Unknown error"}
          </p>
        ) : threads.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">None yet</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {threads.map((thread) => (
              <li key={thread.id} className="rounded border border-zinc-200 px-3 py-2">
                <p className="font-medium">
                  <Link href={`/threads/${thread.id}`} className="hover:underline">
                    Thread #{thread.id}
                  </Link>
                  {thread.kind === "transform_proposal" ? (
                    <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      Proposal
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  metric: {thread.metric?.name ?? "-"} {thread.metric?.unit ? `(${thread.metric.unit})` : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{formatDateLabel(thread.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Metrics</h2>
          {metricsError ? (
            <p className="mt-2 text-sm text-red-600">
              Failed to load: {metricsError instanceof Error ? metricsError.message : "Unknown error"}
            </p>
          ) : metrics.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">None yet</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {metrics.map((metric) => (
                <li key={metric.id} className="rounded border border-zinc-200 px-3 py-2">
                  <p className="font-medium">
                    {metric.name}
                    {metric.unit ? ` (${metric.unit})` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDateLabel(metric.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="font-medium">Imports (latest 10)</h2>
          {importsError ? (
            <p className="mt-2 text-sm text-red-600">
              Failed to load: {importsError instanceof Error ? importsError.message : "Unknown error"}
            </p>
          ) : imports.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">None yet</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {imports.map((item) => (
                <li key={item.id} className="rounded border border-zinc-200 px-3 py-2">
                  <p className="font-medium">{item.file_name ?? "(no file name)"}</p>
                  <p className="mt-1 text-xs text-zinc-600">rows: {item.row_count}</p>
                  <p className="mt-1 text-xs text-zinc-600">metric: {formatMetricLabel(item)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDateLabel(item.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
