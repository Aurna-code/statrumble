import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MetricRow = {
  id: string;
  workspace_id: string;
  name: string;
  unit: string | null;
  created_at: string;
};

function getDefaultWorkspaceId() {
  const workspaceId = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID");
  }

  return workspaceId;
}

export async function listMetrics(): Promise<MetricRow[]> {
  const supabase = await createClient();
  const workspaceId = getDefaultWorkspaceId();
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
  const workspaceId = getDefaultWorkspaceId();
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
