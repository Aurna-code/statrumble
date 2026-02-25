import "server-only";

import { createAnonClient } from "@/lib/supabase/server";

export type PublicWorkspaceProfile = {
  workspace_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  public_at: string | null;
};

export type PublicWorkspaceDecision = {
  id: string;
  public_id: string;
  title: string;
  summary: string | null;
  snapshot_start: string | null;
  snapshot_end: string | null;
  created_at: string;
};

export async function listPublicWorkspaceProfiles(): Promise<PublicWorkspaceProfile[]> {
  const supabase = await createAnonClient();
  const { data, error } = await supabase
    .from("workspace_public_profiles")
    .select("workspace_id, slug, display_name, description, public_at")
    .eq("is_public", true)
    .order("public_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list public workspaces: ${error.message}`);
  }

  return (data as PublicWorkspaceProfile[] | null) ?? [];
}

export async function getPublicWorkspaceProfileBySlug(slug: string): Promise<PublicWorkspaceProfile | null> {
  const supabase = await createAnonClient();
  const { data, error } = await supabase
    .from("workspace_public_profiles")
    .select("workspace_id, slug, display_name, description, public_at")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load public workspace: ${error.message}`);
  }

  return (data as PublicWorkspaceProfile | null) ?? null;
}

export async function listPublicWorkspaceDecisions(workspaceId: string): Promise<PublicWorkspaceDecision[]> {
  if (!workspaceId) {
    throw new Error("workspace_id is required.");
  }

  const supabase = await createAnonClient();
  const { data, error } = await supabase
    .from("decision_cards")
    .select("id, public_id, title, summary, snapshot_start, snapshot_end, created_at")
    .eq("workspace_id", workspaceId)
    .eq("is_public", true)
    .not("public_id", "is", null)
    .order("public_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list public decisions: ${error.message}`);
  }

  return (data as PublicWorkspaceDecision[] | null) ?? [];
}
