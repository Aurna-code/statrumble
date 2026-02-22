import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace/active";

type CreateWorkspaceRequest = {
  name?: string;
};

type CreateWorkspaceResult = {
  workspace_id: string;
  invite_code: string;
};

export async function POST(request: NextRequest) {
  let body: CreateWorkspaceRequest | null = null;

  try {
    body = (await request.json()) as CreateWorkspaceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body?.name?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const row = ((data as CreateWorkspaceResult[] | null) ?? [])[0];

  if (!row?.workspace_id || !row.invite_code) {
    return NextResponse.json({ ok: false, error: "Failed to create workspace." }, { status: 500 });
  }

  const response = NextResponse.json({
    ok: true,
    workspace_id: row.workspace_id,
    invite_code: row.invite_code,
  });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, row.workspace_id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
