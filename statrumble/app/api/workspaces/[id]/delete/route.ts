import { NextRequest, NextResponse } from "next/server";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DeleteWorkspaceRequest = {
  confirmName?: string;
};

function mapRpcErrorToStatus(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("unauthorized")) {
    return 401;
  }

  if (normalized.includes("forbidden")) {
    return 403;
  }

  if (normalized.includes("not found")) {
    return 404;
  }

  if (normalized.includes("confirmation mismatch")) {
    return 400;
  }

  return 500;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const workspaceId = id?.trim();

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_id is required." }, { status: 400 });
  }

  if (!UUID_PATTERN.test(workspaceId)) {
    return NextResponse.json({ ok: false, error: "workspace_id must be a UUID." }, { status: 400 });
  }

  let body: DeleteWorkspaceRequest | null = null;

  try {
    body = (await request.json()) as DeleteWorkspaceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body?.confirmName !== undefined && typeof body.confirmName !== "string") {
    return NextResponse.json({ ok: false, error: "confirmName must be a string." }, { status: 400 });
  }

  const confirmName = body?.confirmName ?? "";
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase.rpc("delete_workspace", {
    p_workspace_id: workspaceId,
    p_confirm_name: confirmName,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: mapRpcErrorToStatus(error.message) });
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
