import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/db/messages";
import { getThread } from "@/lib/db/threads";
import { getVoteSummary } from "@/lib/db/votes";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseLimit(input: string | null) {
  if (!input) {
    return undefined;
  }

  const parsed = Number.parseInt(input, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (limit === null) {
    return NextResponse.json({ ok: false, error: "Invalid limit." }, { status: 400 });
  }

  try {
    const thread = await getThread(id);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
    }

    const [messages, votes] = await Promise.all([listMessages(id, limit), getVoteSummary(id)]);

    return NextResponse.json({
      ok: true,
      messages,
      counts: votes.counts,
      my_stance: votes.my_stance,
      referee_report: thread.referee_report ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Thread not found." ? 404 : message === "Unauthorized." ? 401 : message === "Invalid limit." ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
