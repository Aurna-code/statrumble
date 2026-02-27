import { NextRequest, NextResponse } from "next/server";
import { setWorkspaceVoteProfile } from "@/lib/db/voteProfile";
import { assertVoteProfileConfig } from "@/lib/voteProfile";
import { createClient } from "@/lib/supabase/server";

type VoteProfileRequestBody = {
  workspaceId?: unknown;
  config?: unknown;
};

function parseWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: VoteProfileRequestBody | null = null;

  try {
    body = (await request.json()) as VoteProfileRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const workspaceId = parseWorkspaceId(body?.workspaceId);

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId is required." }, { status: 400 });
  }

  let config;

  try {
    config = assertVoteProfileConfig(body?.config);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid vote profile config." },
      { status: 400 },
    );
  }

  try {
    await setWorkspaceVoteProfile(workspaceId, config);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save vote profile.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
