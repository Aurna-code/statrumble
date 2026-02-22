import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MemberWorkspaceRow = {
  id: string;
  name: string;
  invite_code: string;
  invite_enabled: boolean;
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

export async function listMemberWorkspaces(): Promise<MemberWorkspaceRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized.");
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, created_at, workspaces(id, name, invite_code, invite_enabled)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load member workspaces: ${error.message}`);
  }

  const rows = (data as MemberWorkspaceQueryRow[] | null) ?? [];

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
      } satisfies MemberWorkspaceRow;
    })
    .filter((row): row is MemberWorkspaceRow => row !== null);
}
