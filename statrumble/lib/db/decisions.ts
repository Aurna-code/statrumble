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
  decision: string;
  context: string | null;
  snapshot: unknown;
  snapshot_start: string | null;
  snapshot_end: string | null;
  referee_report: unknown | null;
  updated_at: string | null;
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
      "id, title, summary, decision, context, snapshot, snapshot_start, snapshot_end, referee_report, created_at, updated_at, created_by, thread_id",
    )
    .eq("id", decisionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }

  return (data as DecisionCardDetail | null) ?? null;
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
