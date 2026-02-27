import Link from "next/link";
import { notFound } from "next/navigation";
import DecisionPublishControls from "@/app/components/DecisionPublishControls";
import OnboardingCard from "@/app/components/OnboardingCard";
import RefereeReportView from "@/app/components/RefereeReportView";
import { getDecision, type DecisionCardDetail } from "@/lib/db/decisions";
import { getActiveWorkspaceSelection } from "@/lib/db/workspaces";
import type { RefereeReport } from "@/lib/referee/schema";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

interface DecisionDetailPageProps {
  params: Promise<{ id: string }>;
}

function isRefereeReport(value: unknown): value is RefereeReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.tldr !== "string") {
    return false;
  }

  if (!Array.isArray(record.data_facts) || !Array.isArray(record.confounders) || !Array.isArray(record.next_checks)) {
    return false;
  }

  if (!record.stances || typeof record.stances !== "object") {
    return false;
  }

  if (!record.verdict || typeof record.verdict !== "object") {
    return false;
  }

  const verdict = record.verdict as Record<string, unknown>;

  return (
    typeof verdict.leading === "string" &&
    typeof verdict.confidence_0_100 === "number" &&
    typeof verdict.reason === "string"
  );
}

function renderSummary(decision: DecisionCardDetail) {
  if (decision.summary && decision.summary.trim().length > 0) {
    return decision.summary;
  }

  if (decision.decision && decision.decision.trim().length > 0) {
    return decision.decision;
  }

  return "No summary";
}

export default async function DecisionDetailPage({ params }: DecisionDetailPageProps) {
  const { id } = await params;
  let workspaceSelection = {
    workspaces: [],
    activeWorkspaceId: null,
  } as Awaited<ReturnType<typeof getActiveWorkspaceSelection>>;

  try {
    workspaceSelection = await getActiveWorkspaceSelection();
  } catch {
    workspaceSelection = {
      workspaces: [],
      activeWorkspaceId: null,
    };
  }

  if (workspaceSelection.workspaces.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Decision</h1>
        <p className="mt-2 text-sm text-zinc-600">You must join a workspace to view Decisions.</p>
        <OnboardingCard />
      </main>
    );
  }

  const activeWorkspace =
    workspaceSelection.workspaces.find((workspace) => workspace.id === workspaceSelection.activeWorkspaceId) ?? null;
  const isOwner = activeWorkspace?.role === "owner";
  let decision: DecisionCardDetail | null = null;
  let loadError: string | null = null;

  try {
    decision = await getDecision(id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  if (!loadError && !decision) {
    notFound();
  }

  const report = decision && isRefereeReport(decision.referee_report) ? decision.referee_report : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decision</h1>
          <p className="mt-2 text-sm text-zinc-600">Decision details</p>
        </div>
        <Link href="/decisions" className="text-sm text-zinc-600 hover:text-zinc-900">
          Back to list
        </Link>
      </div>

      {loadError ? (
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-sm text-red-600">Failed to load: {loadError}</p>
        </section>
      ) : decision ? (
        <section className="mt-6 space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">{decision.title}</h2>
            <p className="mt-2 text-sm text-zinc-700">{renderSummary(decision)}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Visibility: {decision.is_public ? "Public" : "Private"}
            </p>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                Snapshot Start: <span className="font-medium">{formatDateLabel(decision.snapshot_start)}</span>
              </p>
              <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                Snapshot End: <span className="font-medium">{formatDateLabel(decision.snapshot_end)}</span>
              </p>
              <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                Created: <span className="font-medium">{formatDateLabel(decision.created_at)}</span>
              </p>
              <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                Created by: <span className="font-medium">{decision.created_by ?? "-"}</span>
              </p>
            </div>
            {decision.thread_id ? (
              <div className="mt-4">
                <Link
                  href={`/threads/${decision.thread_id}`}
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  View thread
                </Link>
              </div>
            ) : null}
            {decision.is_public && decision.public_id ? (
              <div className="mt-3">
                <Link
                  href={`/p/decisions/${decision.public_id}`}
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  Open public URL
                </Link>
              </div>
            ) : null}
          </div>

          {isOwner ? (
            <DecisionPublishControls
              decisionId={decision.id}
              initialIsPublic={decision.is_public}
              initialPublicId={decision.public_id}
            />
          ) : null}

          {report ? (
            <RefereeReportView report={report} />
          ) : (
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-base font-semibold">Referee Report</h2>
              <p className="mt-2 text-sm text-zinc-600">No Referee report linked.</p>
            </section>
          )}
        </section>
      ) : null}
    </main>
  );
}
