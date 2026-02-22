import "server-only";

import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type ThreadWorkspaceRow = {
  workspace_id: string;
};

export type ArenaMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

function toSafeLimit(limit?: number) {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized.");
  }

  return { supabase, userId: user.id };
}

async function getThreadWorkspaceId(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  const { data: thread, error } = await supabase
    .from("arena_threads")
    .select("workspace_id")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load thread: ${error.message}`);
  }

  if (!thread) {
    return null;
  }

  return (thread as ThreadWorkspaceRow).workspace_id;
}

export async function listMessages(threadId: string, limit = DEFAULT_LIMIT): Promise<ArenaMessage[]> {
  const supabase = await createClient();
  const safeLimit = toSafeLimit(limit);
  const { data, error } = await supabase
    .from("arena_messages")
    .select("id, user_id, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Failed to list messages: ${error.message}`);
  }

  return ((data as ArenaMessage[] | null) ?? []).reverse();
}

export async function createMessage(threadId: string, content: string): Promise<void> {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    throw new Error("content is required.");
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const workspaceId = await getThreadWorkspaceId(supabase, threadId);

  if (!workspaceId) {
    throw new Error("Thread not found.");
  }
  const { error } = await supabase.from("arena_messages").insert({
    workspace_id: workspaceId,
    thread_id: threadId,
    user_id: userId,
    content: normalizedContent,
  });

  if (error) {
    throw new Error(`Failed to create message: ${error.message}`);
  }
}
