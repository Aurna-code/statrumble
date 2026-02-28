import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";

export type ThreadMetricMeta = {
  name: string;
  unit: string | null;
};

type ThreadProposalFields = {
  kind: string;
  parent_thread_id?: string | null;
  transform_prompt?: string | null;
  transform_spec?: unknown | null;
  transform_sql_preview?: string | null;
  transform_stats?: unknown | null;
  transform_diff_report?: unknown | null;
};

type ThreadVoteProfileFields = {
  vote_prompt: string;
  vote_labels: unknown;
};

type ThreadRow = {
  id: string;
  workspace_id: string;
  visibility: "workspace" | "invite" | "public";
  kind: string;
  parent_thread_id: string | null;
  metric_id: string | null;
  import_id: string;
  start_ts: string;
  end_ts: string;
  snapshot: unknown;
  referee_report: unknown;
  referee_report_updated_at: string | null;
  transform_prompt: string | null;
  transform_spec: unknown | null;
  transform_sql_preview: string | null;
  transform_stats: unknown | null;
  transform_diff_report: unknown | null;
  vote_prompt: string;
  vote_labels: unknown;
  created_at: string;
  metrics: ThreadMetricMeta | ThreadMetricMeta[] | null;
};

export type ArenaThread = Omit<ThreadRow, "metrics" | keyof ThreadProposalFields | keyof ThreadVoteProfileFields> &
  ThreadProposalFields &
  ThreadVoteProfileFields & {
  metric: ThreadMetricMeta | null;
};

type ThreadListRow = {
  id: string;
  created_at: string;
  start_ts: string;
  end_ts: string;
  metric_id: string | null;
  visibility: "workspace" | "invite" | "public";
  kind: string;
  parent_thread_id: string | null;
  metrics: ThreadMetricMeta | ThreadMetricMeta[] | null;
};

export type ArenaThreadListItem = Omit<ThreadListRow, "metrics" | keyof ThreadProposalFields> &
  ThreadProposalFields & {
  metric: ThreadMetricMeta | null;
};

function pickMetric(metrics: ThreadRow["metrics"]): ThreadMetricMeta | null {
  if (!metrics) {
    return null;
  }

  if (Array.isArray(metrics)) {
    return metrics[0] ?? null;
  }

  return metrics;
}

export async function getThread(threadId: string): Promise<ArenaThread | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("arena_threads")
    .select("*, metrics(name, unit)")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load thread: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as ThreadRow;
  const { metrics, ...thread } = row;

  return {
    ...thread,
    metric: pickMetric(metrics),
  };
}

export async function listThreads(limit = 20): Promise<ArenaThreadListItem[]> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("arena_threads")
    .select("id, created_at, start_ts, end_ts, metric_id, visibility, kind, parent_thread_id, metrics(name, unit)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list threads: ${error.message}`);
  }

  return ((data as ThreadListRow[] | null) ?? []).map((row) => {
    const { metrics, ...thread } = row;

    return {
      ...thread,
      metric: pickMetric(metrics),
    };
  });
}
