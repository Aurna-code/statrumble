import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listDecisions, type DecisionCardListItem } from "@/lib/db/decisions";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
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
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <p className="mt-2 text-sm text-zinc-600">Join a workspace to view decisions.</p>
        <OnboardingCard />
      </main>
    );
  }

  let decisions: DecisionCardListItem[] = [];
  let loadError: Error | null = null;

  try {
    decisions = await listDecisions(50);
  } catch (error) {
    loadError = error instanceof Error ? error : new Error("Unknown error");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Decisions</h1>
      <p className="mt-2 text-sm text-zinc-600">Workspace-level decision cards.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        {loadError ? (
          <p className="text-sm text-red-600">
            Load failed: {loadError.message}
          </p>
        ) : decisions.length === 0 ? (
          <p className="text-sm text-zinc-600">No decision cards yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {decisions.map((decision) => (
              <li key={decision.id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/decisions/${decision.id}`} className="text-base font-semibold hover:underline">
                    {decision.title}
                  </Link>
                  <span className="text-xs text-zinc-500">{formatDateLabel(decision.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">
                  {decision.summary ? decision.summary : "No summary"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                  <span>Created by: {decision.created_by ?? "-"}</span>
                  {decision.thread_id ? (
                    <Link href={`/threads/${decision.thread_id}`} className="hover:underline">
                      Open thread
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
