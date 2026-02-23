import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PromoteWorkspaceMemberRequest = {
  workspace_id?: string;
  user_id?: string;
  role?: string;
};

export async function POST(request: NextRequest) {
  let body: PromoteWorkspaceMemberRequest | null = null;

  try {
    body = (await request.json()) as PromoteWorkspaceMemberRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const workspaceId = body?.workspace_id?.trim();
  const userId = body?.user_id?.trim();
  const role = body?.role?.trim();

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_id is required." }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id is required." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ ok: false, error: "role is required." }, { status: 400 });
  }

  if (role !== "member" && role !== "owner") {
    return NextResponse.json({ ok: false, error: "role must be member or owner." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase.rpc("promote_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    const normalized = error.message.toLowerCase();
    const isUnauthorized = normalized.includes("unauthorized") || normalized.includes("only owners");
    const isUserInputError =
      normalized.includes("required") ||
      normalized.includes("member") ||
      normalized.includes("owner") ||
      normalized.includes("role") ||
      normalized.includes("not found");
    const status = isUnauthorized ? 401 : isUserInputError ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
