import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";

export type MetricRow = {
  id: string;
  workspace_id: string;
  name: string;
  unit: string | null;
  created_at: string;
};

export async function listMetrics(): Promise<MetricRow[]> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("metrics")
    .select("id, workspace_id, name, unit, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list metrics: ${error.message}`);
  }

  return data ?? [];
}

export async function getOrCreateMetric(name: string, unit: string | null): Promise<MetricRow> {
  const supabase = await createClient();
  const workspaceId = await getRequiredActiveWorkspaceId();
  const { data, error } = await supabase
    .from("metrics")
    .upsert(
      {
        workspace_id: workspaceId,
        name,
        unit,
      },
      {
        onConflict: "workspace_id,name",
      },
    )
    .select("id, workspace_id, name, unit, created_at")
    .single();

  if (error) {
    throw new Error(`Failed to get or create metric: ${error.message}`);
  }

  return data;
}
