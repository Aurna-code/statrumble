import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WorkspaceInviteRow = {
  id: string;
  name: string;
  invite_code: string;
  invite_enabled: boolean;
};

function getDefaultWorkspaceId() {
  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID");
  }

  return workspaceId;
}

export async function getDefaultWorkspaceInvite(): Promise<WorkspaceInviteRow | null> {
  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, invite_code, invite_enabled")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workspace invite info: ${error.message}`);
  }

  return (data as WorkspaceInviteRow | null) ?? null;
}
