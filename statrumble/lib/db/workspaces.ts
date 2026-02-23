import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

export type MemberWorkspaceRow = {
  id: string;
  name: string;
  invite_code: string;
  invite_enabled: boolean;
  role: string;
  joined_at: string;
  owner_count: number;
};

export type MemberWorkspaceSummary = {
  id: string;
  name: string;
  role: string;
  joined_at: string;
};

export type WorkspaceMemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
};

type MemberWorkspaceQueryRow = {
  role: string;
  created_at: string;
  workspaces:
    | {
        id: string;
        name: string;
        invite_code: string;
        invite_enabled: boolean;
      }
    | {
        id: string;
        name: string;
        invite_code: string;
        invite_enabled: boolean;
      }[]
    | null;
};

type WorkspaceOwnerCountRow = {
  workspace_id: string;
  owner_count: number;
};

type WorkspaceMemberQueryRow = {
  user_id: string;
  role: string;
  joined_at: string;
};

function pickWorkspace(
  value: MemberWorkspaceQueryRow["workspaces"],
): { id: string; name: string; invite_code: string; invite_enabled: boolean } | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized.");
  }

  return { supabase, userId: user.id };
}

async function listMemberWorkspaceRows(): Promise<MemberWorkspaceRow[]> {
  const { supabase, userId } = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, created_at, workspaces(id, name, invite_code, invite_enabled)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load member workspaces: ${error.message}`);
  }

  const rows = (data as MemberWorkspaceQueryRow[] | null) ?? [];
  const ownerCountsByWorkspace = new Map<string, number>();

  if (rows.length > 0) {
    const { data: ownerCounts, error: ownerCountError } = await supabase.rpc("list_workspace_owner_counts");

    if (!ownerCountError) {
      const ownerRows = (ownerCounts as WorkspaceOwnerCountRow[] | null) ?? [];

      for (const row of ownerRows) {
        ownerCountsByWorkspace.set(row.workspace_id, row.owner_count);
      }
    }
  }

  return rows
    .map((row) => {
      const workspace = pickWorkspace(row.workspaces);

      if (!workspace) {
        return null;
      }

      return {
        id: workspace.id,
        name: workspace.name,
        invite_code: workspace.invite_code,
        invite_enabled: workspace.invite_enabled,
        role: row.role,
        joined_at: row.created_at,
        owner_count: ownerCountsByWorkspace.get(workspace.id) ?? 0,
      } satisfies MemberWorkspaceRow;
    })
    .filter((row): row is MemberWorkspaceRow => row !== null);
}

export async function listMemberWorkspaces(): Promise<MemberWorkspaceRow[]> {
  return listMemberWorkspaceRows();
}

export async function listMemberWorkspaceSummaries(): Promise<MemberWorkspaceSummary[]> {
  const rows = await listMemberWorkspaceRows();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    joined_at: row.joined_at,
  }));
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  if (!workspaceId) {
    throw new Error("workspace_id is required.");
  }

  const { supabase } = await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc("list_workspace_members", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(`Failed to load workspace members: ${error.message}`);
  }

  const rows = (data as WorkspaceMemberQueryRow[] | null) ?? [];

  return rows.map((row) => ({
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at,
  }));
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const workspaces = await listMemberWorkspaceSummaries();

  if (workspaces.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const candidate = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();

  if (candidate && workspaces.some((workspace) => workspace.id === candidate)) {
    return candidate;
  }

  return workspaces[0].id;
}

export async function getActiveWorkspaceSelection(): Promise<{
  workspaces: MemberWorkspaceSummary[];
  activeWorkspaceId: string | null;
}> {
  const workspaces = await listMemberWorkspaceSummaries();

  if (workspaces.length === 0) {
    return {
      workspaces,
      activeWorkspaceId: null,
    };
  }

  const cookieStore = await cookies();
  const candidate = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();
  const activeWorkspaceId =
    candidate && workspaces.some((workspace) => workspace.id === candidate) ? candidate : workspaces[0].id;

  return {
    workspaces,
    activeWorkspaceId,
  };
}

export async function getRequiredActiveWorkspaceId(): Promise<string> {
  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    throw new Error("No workspace membership.");
  }

  return workspaceId;
}

export async function ensurePersonalWorkspaceMembership(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data, error } = await supabase.rpc("ensure_personal_workspace");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to ensure personal workspace.");
  }

  return data as string;
}
