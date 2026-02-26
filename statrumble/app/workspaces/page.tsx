import Link from "next/link";
import { cookies } from "next/headers";
import OnboardingCard from "@/app/components/OnboardingCard";
import WorkspacesHub from "@/app/components/WorkspacesHub";
import {
  listMemberWorkspaces,
  listWorkspaceMembers,
  getWorkspacePublicProfile,
  type MemberWorkspaceRow,
  type WorkspaceMemberRow,
  type WorkspacePublicProfile,
} from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";
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

  if (authError || !user) {
    loadError = "Login required.";
  } else {
    try {
      workspaces = await listMemberWorkspaces();
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unknown error";
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

    if (activeWorkspace?.role === "owner") {
      try {
        workspaceMembers = await listWorkspaceMembers(activeWorkspaceId);
        membersWorkspaceId = activeWorkspaceId;
      } catch (error) {
        membersError = error instanceof Error ? error.message : "Unknown error";
      }

      try {
        workspacePublicProfile = await getWorkspacePublicProfile(activeWorkspaceId);
      } catch {
        workspacePublicProfile = null;
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Workspaces</h1>
      <p className="mt-2 text-sm text-zinc-600">Manage your workspaces and switch the active one.</p>

      {loadError ? (
        <section className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-700">{loadError}</p>
          {loadError.toLowerCase().includes("login") ? (
            <Link href="/login" className="mt-3 inline-flex text-sm font-medium text-red-700 hover:underline">
              Go to login
            </Link>
          ) : null}
        </section>
      ) : null}

      {!loadError && workspaces.length === 0 ? (
        <OnboardingCard
          title="No workspace membership"
          description="Join or create a workspace first to use the hub."
        />
      ) : null}

      {!loadError && workspaces.length > 0 ? (
        <WorkspacesHub
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceMembers={workspaceMembers}
          membersWorkspaceId={membersWorkspaceId}
          membersError={membersError}
          workspacePublicProfile={workspacePublicProfile}
        />
      ) : null}
    </main>
  );
}
