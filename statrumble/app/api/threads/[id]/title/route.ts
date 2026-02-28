import { NextRequest, NextResponse } from "next/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateThreadTitleRequest = {
  title?: string;
};

const MAX_TITLE_LENGTH = 120;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

  let body: UpdateThreadTitleRequest | null = null;

  try {
    body = (await request.json()) as UpdateThreadTitleRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const normalizedTitle = typeof body?.title === "string" ? body.title.trim() : "";

  if (!normalizedTitle) {
    return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
  }

  if (normalizedTitle.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ ok: false, error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let activeWorkspaceId = "";

  try {
    activeWorkspaceId = await getRequiredActiveWorkspaceId();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No workspace membership." },
      { status: 403 },
    );
  }

  const { data: thread, error: threadError } = await supabase
    .from("arena_threads")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", activeWorkspaceId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ ok: false, error: threadError.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("arena_threads")
    .update({ title: normalizedTitle })
    .eq("id", id)
    .eq("workspace_id", activeWorkspaceId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title: normalizedTitle });
}
