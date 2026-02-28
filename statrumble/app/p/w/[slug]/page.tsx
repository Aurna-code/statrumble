import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublicWorkspaceProfileBySlug,
  listPublicWorkspaceDecisions,
  type PublicWorkspaceDecision,
} from "@/lib/db/publicPortal";
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";

export const dynamic = "force-dynamic";

interface PublicWorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicWorkspacePage({ params }: PublicWorkspacePageProps) {
  const { slug } = await params;

  if (!slug) {
    notFound();
  }

  let profile = null;

  try {
    profile = await getPublicWorkspaceProfileBySlug(slug);
  } catch {
    profile = null;
  }

  if (!profile) {
    notFound();
  }

  let decisions: PublicWorkspaceDecision[] = [];
  let loadError: string | null = null;

  try {
    decisions = await listPublicWorkspaceDecisions(profile.workspace_id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Public Workspace</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{profile.display_name}</h1>
        <p className="mt-3 text-sm text-zinc-700">{profile.description ?? "설명 없음"}</p>
      </div>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Public Decisions</h2>
          <p className="text-xs text-zinc-500">{decisions.length} total</p>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {!loadError && decisions.length === 0 ? (
          <div className="mt-4 rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
            공개된 decision이 아직 없습니다.
          </div>
        ) : null}

        {!loadError && decisions.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {decisions.map((decision) => (
              <li key={decision.id} className="rounded-lg border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900">{decision.title}</h3>
                    <p className="mt-2 text-sm text-zinc-600">
                      {decision.summary ? decision.summary : "요약 없음"}
                    </p>
                  </div>
                  <Link
                    href={`/p/decisions/${decision.public_id}`}
                    className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-100"
                  >
                    View
                  </Link>
                </div>
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
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
