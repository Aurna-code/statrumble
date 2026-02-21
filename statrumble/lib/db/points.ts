import "server-only";

import { createClient } from "@/lib/supabase/server";

const BULK_INSERT_CHUNK_SIZE = 500;
const MAX_BULK_INSERT_ROWS = 50_000;

export type PointInput = {
  ts: string;
  value: number;
};

export type PointRange = {
  start?: string;
  end?: string;
};

export type MetricPointRow = {
  id: string;
  workspace_id: string;
  import_id: string;
  ts: string;
  value: number;
  created_at: string;
};

function getDefaultWorkspaceId() {
  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID");
  }

  return workspaceId;
}

export async function insertPointsBulk(importId: string, rows: PointInput[]): Promise<void> {
  if (rows.length > MAX_BULK_INSERT_ROWS) {
    throw new Error(`Too many rows for bulk insert: ${rows.length}. Max is ${MAX_BULK_INSERT_ROWS}.`);
  }

  if (rows.length === 0) {
    return;
  }

  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();

  for (let start = 0; start < rows.length; start += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + BULK_INSERT_CHUNK_SIZE);
    const payload = chunk.map((row) => ({
      workspace_id: workspaceId,
      import_id: importId,
      ts: row.ts,
      value: row.value,
    }));
    const chunkIndex = Math.floor(start / BULK_INSERT_CHUNK_SIZE) + 1;
    const { error } = await supabase.from("metric_points").insert(payload);

    if (error) {
      throw new Error(`Failed to insert points chunk ${chunkIndex}: ${error.message}`);
    }
  }
}

export async function fetchPoints(importId: string, range?: PointRange): Promise<MetricPointRow[]> {
  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();

  let query = supabase
    .from("metric_points")
    .select("id, workspace_id, import_id, ts, value, created_at")
    .eq("workspace_id", workspaceId)
    .eq("import_id", importId);

  if (range?.start) {
    query = query.gte("ts", range.start);
  }

  if (range?.end) {
    query = query.lte("ts", range.end);
  }

  const { data, error } = await query.order("ts", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch points: ${error.message}`);
  }

  return (data as MetricPointRow[] | null) ?? [];
}
