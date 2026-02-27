import "server-only";

import { createClient } from "@/lib/supabase/server";
import { assertVoteProfileConfig, type VoteProfileConfig } from "@/lib/voteProfile";

export async function getWorkspaceVoteProfile(workspaceId: string): Promise<VoteProfileConfig | null> {
  if (!workspaceId) {
    throw new Error("workspaceId is required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_workspace_vote_profile", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to load workspace vote profile.");
  }

  if (data === null) {
    return null;
  }

  return assertVoteProfileConfig(data);
}

export async function setWorkspaceVoteProfile(workspaceId: string, config: VoteProfileConfig): Promise<void> {
  if (!workspaceId) {
    throw new Error("workspaceId is required.");
  }

  const normalizedConfig = assertVoteProfileConfig(config);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workspace_vote_profile", {
    p_workspace_id: workspaceId,
    p_config: normalizedConfig,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to update workspace vote profile.");
  }
}
