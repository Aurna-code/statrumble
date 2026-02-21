import "server-only";

import { createClient } from "@/lib/supabase/server";

const STANCES = ["A", "B", "C"] as const;

type ThreadWorkspaceRow = {
  workspace_id: string;
};

type VoteRow = {
  user_id: string;
  stance: string;
};

export type VoteStance = (typeof STANCES)[number];

export type VoteSummary = {
  counts: Record<VoteStance, number>;
  my_stance: VoteStance | null;
};

function isVoteStance(value: string): value is VoteStance {
  return STANCES.includes(value as VoteStance);
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized.");
  }

  return { supabase, user };
}

async function getThreadWorkspaceId(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  const { data: thread, error } = await supabase
    .from("arena_threads")
    .select("workspace_id")
    .eq("id", threadId)
    .single();

  if (error || !thread) {
    throw new Error("Thread not found.");
  }

  return (thread as ThreadWorkspaceRow).workspace_id;
}

export async function getVoteSummary(threadId: string): Promise<VoteSummary> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("arena_votes")
    .select("user_id, stance")
    .eq("thread_id", threadId);

  if (error) {
    throw new Error(`Failed to load vote summary: ${error.message}`);
  }

  const counts: Record<VoteStance, number> = {
    A: 0,
    B: 0,
    C: 0,
  };
  let myStance: VoteStance | null = null;

  for (const vote of (data as VoteRow[] | null) ?? []) {
    if (isVoteStance(vote.stance)) {
      counts[vote.stance] += 1;

      if (vote.user_id === user.id) {
        myStance = vote.stance;
      }
    }
  }

  return {
    counts,
    my_stance: myStance,
  };
}

export async function upsertVote(threadId: string, stance: VoteStance): Promise<VoteStance> {
  if (!isVoteStance(stance)) {
    throw new Error("Invalid stance.");
  }

  const { supabase, user } = await getAuthenticatedUser();
  const workspaceId = await getThreadWorkspaceId(supabase, threadId);
  const { error } = await supabase.from("arena_votes").upsert(
    {
      workspace_id: workspaceId,
      thread_id: threadId,
      user_id: user.id,
      stance,
    },
    {
      onConflict: "thread_id,user_id",
    },
  );

  if (error) {
    throw new Error(`Failed to upsert vote: ${error.message}`);
  }

  return stance;
}
