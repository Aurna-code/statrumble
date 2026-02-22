import { NextRequest, NextResponse } from "next/server";
import { getVoteSummary, type VoteStance, upsertVote } from "@/lib/db/votes";
import { getThread } from "@/lib/db/threads";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VoteRequest = {
  stance?: string;
};

function isVoteStance(value: string): value is VoteStance {
  return value === "A" || value === "B" || value === "C";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const thread = await getThread(id);
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  try {
    const summary = await getVoteSummary(id);

    return NextResponse.json({
      ok: true,
      counts: summary.counts,
      my_stance: summary.my_stance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Thread not found." ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const thread = await getThread(id);
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  let body: VoteRequest | null = null;

  try {
    body = (await request.json()) as VoteRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.stance || !isVoteStance(body.stance)) {
    return NextResponse.json({ ok: false, error: "stance must be one of A, B, C." }, { status: 400 });
  }

  try {
    const myStance = await upsertVote(id, body.stance);
    return NextResponse.json({ ok: true, my_stance: myStance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Thread not found." ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
