import { notFound } from "next/navigation";
import { getPublicDecisionByPublicId } from "@/lib/db/decisions";

export const dynamic = "force-dynamic";

interface PublicDecisionPageProps {
  params: Promise<{ publicId: string }>;
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function extractRefereeSummary(report: unknown) {
  if (!report || typeof report !== "object") {
    return null;
  }

  const record = report as Record<string, unknown>;
  const tldr = typeof record.tldr === "string" ? record.tldr.trim() : "";

  return tldr.length > 0 ? tldr : null;
}

export default async function PublicDecisionPage({ params }: PublicDecisionPageProps) {
  const { publicId } = await params;

  if (!publicId) {
    notFound();
  }

  let decision = null;

  try {
    decision = await getPublicDecisionByPublicId(publicId);
  } catch {
    decision = null;
  }

  if (!decision) {
    notFound();
  }

  const refereeSummary = extractRefereeSummary(decision.referee_report);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Public Decision</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{decision.title}</h1>
        <p className="mt-3 text-sm text-zinc-700">{decision.summary ?? "요약 없음"}</p>
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
      </div>

      {refereeSummary ? (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-semibold text-zinc-900">Referee Summary</h2>
          <p className="mt-2 text-sm text-zinc-700">{refereeSummary}</p>
        </section>
      ) : null}
    </main>
  );
}
