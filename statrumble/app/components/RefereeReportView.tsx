import type { RefereeReport } from "@/lib/referee/schema";

type RefereeReportViewProps = {
  report: RefereeReport;
};

export default function RefereeReportView({ report }: RefereeReportViewProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold">Referee Report</h2>

      <div className="mt-4 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700">TL;DR</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{report.tldr}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-700">Data Facts</h3>
          {report.data_facts.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-600">None</p>
          ) : (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-900">
              {report.data_facts.map((item, index) => (
                <li key={`${item.fact}-${index}`}>
                  <p>{item.fact}</p>
                  <p className="text-xs text-zinc-600">Support: {item.support}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-700">Stances</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {(["A", "B", "C"] as const).map((key) => (
              <article key={key} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="font-semibold">{key}</p>
                <p className="mt-2 text-xs text-zinc-600">Steelman</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-900">{report.stances[key].steelman}</p>
                <p className="mt-2 text-xs text-zinc-600">Weakness</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-900">{report.stances[key].weakness}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-700">Confounders</h3>
          {report.confounders.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-600">None</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-900">
              {report.confounders.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-700">Next Checks</h3>
          {report.next_checks.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-600">None</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-zinc-900">
              {report.next_checks.map((item, index) => (
                <li key={`${item.what}-${index}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="font-medium">{item.what}</p>
                  <p className="mt-1 text-zinc-700">{item.why}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-700">Verdict</h3>
          <p className="mt-1 text-sm text-zinc-900">Leading: {report.verdict.leading}</p>
          <p className="mt-1 text-sm text-zinc-900">Confidence: {report.verdict.confidence_0_100.toFixed(1)} / 100</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{report.verdict.reason}</p>
        </div>
      </div>
    </section>
  );
}
