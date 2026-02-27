import { NextRequest, NextResponse } from "next/server";
import { parseVoteLabels } from "@/lib/voteProfile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VoteProfileRequestBody = {
  vote_prompt?: unknown;
  vote_labels?: unknown;
  reset_votes?: unknown;
};

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseResetVotes(value: unknown): boolean | null {
  if (value === undefined) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "n", ""].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function mapRpcErrorStatus(message: string): number {
  if (message.includes("Unauthorized.")) {
    return 401;
  }

  if (message.includes("Forbidden.")) {
    return 403;
  }

  if (message.includes("Thread not found.")) {
    return 404;
  }

  if (message.includes("Votes exist;")) {
    return 409;
  }

  if (message.includes("vote_prompt is required.") || message.includes("Invalid vote_labels.")) {
    return 400;
  }

  return 500;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

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

  const votePrompt = parseNonEmptyString(body?.vote_prompt);
  const voteLabels = parseVoteLabels(body?.vote_labels);
  const resetVotes = parseResetVotes(body?.reset_votes);

  if (!votePrompt) {
    return NextResponse.json({ ok: false, error: "vote_prompt is required." }, { status: 400 });
  }

  if (!voteLabels) {
    return NextResponse.json({ ok: false, error: "vote_labels must include non-empty A, B, and C values." }, { status: 400 });
  }

  if (resetVotes === null) {
    return NextResponse.json({ ok: false, error: "reset_votes must be a boolean-like value." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_thread_vote_profile", {
    p_thread_id: id,
    p_vote_prompt: votePrompt,
    p_vote_labels: voteLabels,
    p_reset_votes: Boolean(resetVotes),
  });

  if (error) {
    const message = error.message ?? "Failed to update thread vote profile.";
    return NextResponse.json({ ok: false, error: message }, { status: mapRpcErrorStatus(message) });
  }

  return NextResponse.json({ ok: true });
}
