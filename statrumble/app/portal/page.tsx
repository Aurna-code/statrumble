import Link from "next/link";
import { listPublicWorkspaceProfiles, type PublicWorkspaceProfile } from "@/lib/db/publicPortal";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  let workspaces: PublicWorkspaceProfile[] = [];
  let loadError: string | null = null;

  try {
    workspaces = await listPublicWorkspaceProfiles();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Public Portal</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Public Workspaces</h1>
        <p className="mt-2 text-sm text-zinc-600">A workspace portal anyone can view.</p>
      </div>

      {loadError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {!loadError && workspaces.length === 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          No public workspaces yet.
        </div>
      ) : null}

      {!loadError && workspaces.length > 0 ? (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => (
            <li key={workspace.slug} className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Workspace</p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-900">{workspace.display_name}</h2>
              <p className="mt-2 text-sm text-zinc-600">
                {workspace.description ? workspace.description : "No description"}
              </p>
              <div className="mt-4">
                <Link
                  href={`/p/w/${workspace.slug}`}
                  className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
