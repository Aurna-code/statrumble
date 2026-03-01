import { NextRequest, NextResponse } from "next/server";
import { parseVoteLabels, type VoteLabels } from "@/lib/voteProfile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VoteProfileUpdateRequest = {
  vote_prompt?: unknown;
  vote_labels?: unknown;
  reset_votes?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapRpcErrorStatus(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("unauthorized")) {
    return 401;
  }

  if (normalized.includes("forbidden")) {
    return 403;
  }

  if (normalized.includes("votes already exist")) {
    return 409;
  }

  if (
    normalized.includes("thread_id is required") ||
    normalized.includes("vote_prompt is required") ||
    normalized.includes("vote_labels must contain non-empty string values for a, b, and c")
  ) {
    return 400;
  }

  if (normalized.includes("thread not found")) {
    return 404;
  }

  return 500;
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, authorized: false as const };
  }

  return { supabase, authorized: true as const };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

  const { supabase, authorized } = await requireAuth();

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: VoteProfileUpdateRequest | null = null;

  try {
    body = (await request.json()) as VoteProfileUpdateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const votePrompt = asNonEmptyString(body?.vote_prompt);
  const voteLabels = parseVoteLabels(body?.vote_labels);
  const resetVotes = body?.reset_votes;

  if (!votePrompt) {
    return NextResponse.json({ ok: false, error: "vote_prompt is required." }, { status: 400 });
  }

  if (!voteLabels) {
    return NextResponse.json(
      { ok: false, error: "vote_labels must contain non-empty string values for A, B, and C." },
      { status: 400 },
    );
  }

  if (resetVotes !== undefined && typeof resetVotes !== "boolean") {
    return NextResponse.json({ ok: false, error: "reset_votes must be a boolean." }, { status: 400 });
  }

  const rpcPayload: {
    p_thread_id: string;
    p_vote_prompt: string;
    p_vote_labels: VoteLabels;
    p_reset_votes?: boolean;
  } = {
    p_thread_id: id,
    p_vote_prompt: votePrompt,
    p_vote_labels: voteLabels,
  };

  if (typeof resetVotes === "boolean") {
    rpcPayload.p_reset_votes = resetVotes;
  }

  const { error } = await supabase.rpc("set_thread_vote_profile", rpcPayload);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: mapRpcErrorStatus(error.message) });
  }

  return NextResponse.json({ ok: true });
}
