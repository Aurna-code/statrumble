import Link from "next/link";
import { cookies } from "next/headers";
import WorkspacesHub from "@/app/components/WorkspacesHub";
import {
  listMemberWorkspaces,
  listWorkspacePortalStatuses,
  listWorkspaceMembers,
  getWorkspacePublicProfile,
  type MemberWorkspaceRow,
  type WorkspacePortalStatus,
  type WorkspaceMemberRow,
  type WorkspacePublicProfile,
} from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";
import { getDisplayNameFromUser } from "@/lib/userDisplay";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  let workspaces: MemberWorkspaceRow[] = [];
  let loadError: string | null = null;
  let activeWorkspaceId: string | null = null;
  let workspaceMembers: WorkspaceMemberRow[] = [];
  let membersWorkspaceId: string | null = null;
  let membersError: string | null = null;
  let workspacePublicProfile: WorkspacePublicProfile | null = null;
  let activeWorkspaceVoteConfig: unknown | null = null;
  let workspacePortalStatuses: WorkspacePortalStatus[] = [];
  let viewerDisplayName: string | null = null;

  if (authError || !user) {
    loadError = "Login required.";
  } else {
    viewerDisplayName = getDisplayNameFromUser(user);

    try {
      workspaces = await listMemberWorkspaces();
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unknown error";
    }

    if (workspaces.length > 0) {
      try {
        workspacePortalStatuses = await listWorkspacePortalStatuses(workspaces.map((workspace) => workspace.id));
      } catch {
        workspacePortalStatuses = [];
      }
    }
  }

  if (!loadError && workspaces.length > 0) {
    const cookieStore = await cookies();
    const candidate = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();
    activeWorkspaceId =
      candidate && workspaces.some((workspace) => workspace.id === candidate) ? candidate : workspaces[0].id;
  }

  if (!loadError && activeWorkspaceId) {
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

    try {
      const { data: voteConfig, error: voteConfigError } = await supabase.rpc("get_workspace_vote_profile", {
        p_workspace_id: activeWorkspaceId,
      });
      activeWorkspaceVoteConfig = voteConfigError ? null : (voteConfig ?? null);
    } catch {
      activeWorkspaceVoteConfig = null;
    }

    try {
      workspaceMembers = await listWorkspaceMembers(activeWorkspaceId);
      membersWorkspaceId = activeWorkspaceId;
    } catch (error) {
      membersError = error instanceof Error ? error.message : "Unknown error";
    }

    if (activeWorkspace?.role === "owner") {
      try {
        workspacePublicProfile = await getWorkspacePublicProfile(activeWorkspaceId);
      } catch {
        workspacePublicProfile = null;
      }
    }
  }

  const portalStatusByWorkspaceId = Object.fromEntries(
    workspacePortalStatuses.map((workspace) => [workspace.workspace_id, workspace.is_public]),
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="mt-1 text-sm text-zinc-600">Manage your workspace, invite members, and publish a portal.</p>

        {loadError ? (
          <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm text-red-700">{loadError}</p>
            {loadError.includes("Login") ? (
              <Link href="/login" className="mt-3 inline-flex text-sm font-medium text-red-700 hover:underline">
                Go to login
              </Link>
            ) : null}
          </section>
        ) : (
          <WorkspacesHub
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            workspaceMembers={workspaceMembers}
            membersWorkspaceId={membersWorkspaceId}
            membersError={membersError}
            workspacePublicProfile={workspacePublicProfile}
            portalStatusByWorkspaceId={portalStatusByWorkspaceId}
            initialDisplayName={viewerDisplayName}
            initialWorkspaceVoteConfig={activeWorkspaceVoteConfig}
          />
        )}
      </div>
    </main>
  );
}
