import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";

export type ThreadMetricMeta = {
  name: string;
  unit: string | null;
};

type ThreadRow = {
  id: string;
  workspace_id: string;
  visibility: "workspace" | "invite" | "public";
  metric_id: string | null;
  import_id: string;
  start_ts: string;
  end_ts: string;
  snapshot: unknown;
  referee_report: unknown;
  created_at: string;
  metrics: ThreadMetricMeta | ThreadMetricMeta[] | null;
};

export type ArenaThread = Omit<ThreadRow, "metrics"> & {
  metric: ThreadMetricMeta | null;
};

type ThreadListRow = {
  id: string;
  created_at: string;
  start_ts: string;
  end_ts: string;
  metric_id: string | null;
  visibility: "workspace" | "invite" | "public";
  metrics: ThreadMetricMeta | ThreadMetricMeta[] | null;
};

export type ArenaThreadListItem = Omit<ThreadListRow, "metrics"> & {
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
    .select(
      "id, workspace_id, visibility, metric_id, import_id, start_ts, end_ts, snapshot, referee_report, created_at, metrics(name, unit)",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load thread: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as ThreadRow;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    visibility: row.visibility,
    metric_id: row.metric_id,
    import_id: row.import_id,
    start_ts: row.start_ts,
    end_ts: row.end_ts,
    snapshot: row.snapshot,
    referee_report: row.referee_report,
    created_at: row.created_at,
    metric: pickMetric(row.metrics),
  };
}

export async function listThreads(limit = 20): Promise<ArenaThreadListItem[]> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("arena_threads")
    .select("id, created_at, start_ts, end_ts, metric_id, visibility, metrics(name, unit)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list threads: ${error.message}`);
  }

  return ((data as ThreadListRow[] | null) ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    start_ts: row.start_ts,
    end_ts: row.end_ts,
    metric_id: row.metric_id,
    visibility: row.visibility,
    metric: pickMetric(row.metrics),
  }));
}
