import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listThreads, type ArenaThreadListItem } from "@/lib/db/threads";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
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
        <h1 className="text-2xl font-semibold">Threads</h1>
        <p className="mt-2 text-sm text-zinc-600">You must join a workspace to view Threads.</p>
        <OnboardingCard />
      </main>
    );
  }

  let threads: ArenaThreadListItem[] = [];
  let loadError: Error | null = null;

  try {
    threads = await listThreads(50);
  } catch (error) {
    loadError = error instanceof Error ? error : new Error("Unknown error");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Threads</h1>
      <p className="mt-2 text-sm text-zinc-600">Recent arena threads from your workspace.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        {loadError ? (
          <p className="text-sm text-red-600">
            Failed to load: {loadError.message}
          </p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-zinc-600">No Threads yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
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
    </main>
  );
}
