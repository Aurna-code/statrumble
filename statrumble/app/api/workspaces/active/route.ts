import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

type SetActiveWorkspaceRequest = {
  workspace_id?: string;
};

export async function POST(request: NextRequest) {
  let body: SetActiveWorkspaceRequest | null = null;

  try {
    body = (await request.json()) as SetActiveWorkspaceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const workspaceId = body?.workspace_id?.trim();

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, workspace_id: workspaceId });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
