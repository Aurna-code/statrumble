import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";

export type DecisionCardListItem = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  created_by: string | null;
  thread_id: string | null;
};

export type DecisionCardDetail = DecisionCardListItem & {
  workspace_id: string;
  decision: string;
  context: string | null;
  snapshot: unknown;
  snapshot_start: string | null;
  snapshot_end: string | null;
  referee_report: unknown | null;
  updated_at: string | null;
  is_public: boolean;
  public_id: string | null;
  public_at: string | null;
};

export type PublicDecisionCard = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  snapshot_start: string | null;
  snapshot_end: string | null;
  referee_report: unknown | null;
};

type DecisionMembershipRow = {
  id: string;
  workspace_id: string;
};

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    supabase,
    userId: user.id,
  };
}

async function ensureDecisionWorkspaceMembership(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  workspaceId: string;
}) {
  const { data, error } = await params.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify decision access: ${error.message}`);
  }

  return Boolean(data);
}

export async function listDecisions(limit = 20): Promise<DecisionCardListItem[]> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("decision_cards")
    .select("id, title, summary, created_at, created_by, thread_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list decisions: ${error.message}`);
  }

  return (data as DecisionCardListItem[] | null) ?? [];
}

export async function getDecision(decisionId: string): Promise<DecisionCardDetail | null> {
  const auth = await getAuthenticatedUserId();

  if (!auth) {
    return null;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("decision_cards")
    .select(
      "id, workspace_id, title, summary, decision, context, snapshot, snapshot_start, snapshot_end, referee_report, created_at, updated_at, created_by, thread_id, is_public, public_id, public_at",
    )
    .eq("id", decisionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }

  const decision = (data as DecisionCardDetail | null) ?? null;

  if (!decision) {
    return null;
  }

  const hasMembership = await ensureDecisionWorkspaceMembership({
    supabase,
    userId,
    workspaceId: decision.workspace_id,
  });

  return hasMembership ? decision : null;
}

export async function getPublicDecisionByPublicId(publicId: string): Promise<PublicDecisionCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decision_cards")
    .select("id, title, summary, created_at, snapshot_start, snapshot_end, referee_report")
    .eq("public_id", publicId)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load public decision: ${error.message}`);
  }

  return (data as PublicDecisionCard | null) ?? null;
}

export async function getDecisionForThread(threadId: string): Promise<DecisionCardListItem | null> {
  const auth = await getAuthenticatedUserId();

  if (!auth) {
    return null;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("decision_cards")
    .select("id, workspace_id, title, summary, created_at, created_by, thread_id")
    .eq("thread_id", threadId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }

  const decision = (data as (DecisionCardListItem & DecisionMembershipRow) | null) ?? null;

  if (!decision) {
    return null;
  }

  const hasMembership = await ensureDecisionWorkspaceMembership({
    supabase,
    userId,
    workspaceId: decision.workspace_id,
  });

  if (!hasMembership) {
    return null;
  }

  return {
    id: decision.id,
    title: decision.title,
    summary: decision.summary,
    created_at: decision.created_at,
    created_by: decision.created_by,
    thread_id: decision.thread_id,
  };
}
