import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listThreads, type ArenaThreadListItem } from "@/lib/db/threads";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";
import { formatThreadPrimaryTitle, shortId } from "@/lib/threadLabel";

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
        <p className="mt-2 text-sm text-zinc-600">Join a workspace to view and discuss threads.</p>
        <OnboardingCard
          title="You are not in a workspace yet."
          description="Use an invite code or create a new workspace to get started."
        />
      </main>
    );
  }

  let threads: ArenaThreadListItem[] = [];
  let loadError: Error | null = null;

  try {
    threads = await listThreads(100);
  } catch (error) {
    loadError = error instanceof Error ? error : new Error("Unknown error");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Threads</h1>
      <p className="mt-2 text-sm text-zinc-600">Review active arena threads in your workspace.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        {loadError ? (
          <p className="text-sm text-red-600">Failed to load: {loadError.message}</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-zinc-600">No threads yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {threads.map((thread) => (
              <li key={thread.id} className="rounded-md border border-zinc-200 p-4">
                <p className="font-medium">
                  <Link href={`/threads/${thread.id}`} className="hover:underline">
                    {formatThreadPrimaryTitle(thread)}
                  </Link>
                  {thread.kind === "transform_proposal" ? (
                    <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      Proposal
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs font-normal text-zinc-500">ID: {shortId(thread.id)}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Range: {formatDateLabel(thread.start_ts)} → {formatDateLabel(thread.end_ts)}
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
