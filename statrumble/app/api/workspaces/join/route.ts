import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type JoinWorkspaceRequest = {
  code?: string;
};

export async function POST(request: NextRequest) {
  let body: JoinWorkspaceRequest | null = null;

  try {
    body = (await request.json()) as JoinWorkspaceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const inviteCode = body?.code?.trim();

  if (!inviteCode) {
    return NextResponse.json({ ok: false, error: "code is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("join_workspace_by_code", {
    p_invite_code: inviteCode,
  });

  if (error) {
    const normalized = error.message.toLowerCase();
    const isUserInputError =
      normalized.includes("invite code") || normalized.includes("required") || normalized.includes("invalid");
    const status = isUserInputError ? 400 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, workspace_id: data as string });
}
