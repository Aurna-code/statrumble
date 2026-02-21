import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ImportMetricMeta = {
  name: string;
  unit: string | null;
};

export type MetricImportRow = {
  id: string;
  workspace_id: string;
  metric_id: string;
  file_name: string | null;
  row_count: number;
  created_at: string;
  metrics: ImportMetricMeta | ImportMetricMeta[] | null;
};

function getDefaultWorkspaceId() {
  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID");
  }

  return workspaceId;
}

export async function listImports(limit = 20): Promise<MetricImportRow[]> {
  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();
  const { data, error } = await supabase
    .from("metric_imports")
    .select("id, workspace_id, metric_id, file_name, row_count, created_at, metrics(name, unit)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list imports: ${error.message}`);
  }

  return (data as MetricImportRow[] | null) ?? [];
}

export async function createImport(
  metricId: string,
  fileName: string,
  rowCount: number,
): Promise<MetricImportRow> {
  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();
  const { data, error } = await supabase
    .from("metric_imports")
    .insert({
      workspace_id: workspaceId,
      metric_id: metricId,
      file_name: fileName,
      row_count: rowCount,
    })
    .select("id, workspace_id, metric_id, file_name, row_count, created_at, metrics(name, unit)")
    .single();

  if (error) {
    throw new Error(`Failed to create import: ${error.message}`);
  }

  return data as MetricImportRow;
}
