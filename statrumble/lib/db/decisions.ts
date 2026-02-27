import "server-only";

import { createAnonClient, createClient } from "@/lib/supabase/server";
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

export type PublicDecisionDetail = {
  id: string | null;
  title: string | null;
  summary: string | null;
  created_at: string | null;
  snapshot_start: string | null;
  snapshot_end: string | null;
  referee_report: unknown | null;
  thread_id: string | null;
  thread_kind: string | null;
  transform_prompt: string | null;
  transform_spec: unknown | null;
  transform_sql_preview: string | null;
  transform_stats: unknown | null;
  transform_diff_report: unknown | null;
};

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
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("decision_cards")
    .select(
      "id, title, summary, decision, context, snapshot, snapshot_start, snapshot_end, referee_report, created_at, updated_at, created_by, thread_id, is_public, public_id, public_at",
    )
    .eq("id", decisionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }

  return (data as DecisionCardDetail | null) ?? null;
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

export async function getPublicDecisionDetailByPublicId(publicId: string): Promise<PublicDecisionDetail | null> {
  const supabase = await createAnonClient();
  const { data, error } = await supabase.rpc("get_public_decision_detail", {
    p_public_id: publicId,
  });

  if (error) {
    throw new Error(`Failed to load public decision detail: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return (data[0] as PublicDecisionDetail | null) ?? null;
}

export async function getDecisionForThread(threadId: string): Promise<DecisionCardListItem | null> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("decision_cards")
    .select("id, title, summary, created_at, created_by, thread_id")
    .eq("thread_id", threadId)
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }

  return (data as DecisionCardListItem | null) ?? null;
}
