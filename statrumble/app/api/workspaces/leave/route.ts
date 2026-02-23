import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

type LeaveWorkspaceRequest = {
  workspace_id?: string;
};

export async function POST(request: NextRequest) {
  let body: LeaveWorkspaceRequest | null = null;

  try {
    body = (await request.json()) as LeaveWorkspaceRequest;
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

  const { data, error } = await supabase.rpc("leave_workspace", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    const normalized = error.message.toLowerCase();
    const isUnauthorized = normalized.includes("unauthorized");
    const isUserInputError =
      normalized.includes("required") ||
      normalized.includes("membership") ||
      normalized.includes("last owner") ||
      normalized.includes("owner") ||
      normalized.includes("not found");
    const status = isUnauthorized ? 401 : isUserInputError ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Failed to leave workspace." }, { status: 500 });
  }

  let remainingMemberships = [] as Awaited<ReturnType<typeof listMemberWorkspaceSummaries>>;

  try {
    remainingMemberships = await listMemberWorkspaceSummaries();
  } catch {
    remainingMemberships = [];
  }

  const candidate = request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim();
  const nextActiveWorkspaceId =
    candidate && remainingMemberships.some((workspace) => workspace.id === candidate)
      ? candidate
      : remainingMemberships[0]?.id ?? null;
  const response = NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    active_workspace_id: nextActiveWorkspaceId,
  });

  if (nextActiveWorkspaceId) {
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, nextActiveWorkspaceId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", {
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    });
  }

  return response;
}
