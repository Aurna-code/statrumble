import { NextRequest, NextResponse } from "next/server";
import { createMessage, listMessages } from "@/lib/db/messages";
import { getThread } from "@/lib/db/threads";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CreateMessageRequest = {
  content?: string;
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

  const thread = await getThread(id);
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (limit === null) {
    return NextResponse.json({ ok: false, error: "Invalid limit." }, { status: 400 });
  }

  try {
    const messages = await listMessages(id, limit);
    return NextResponse.json({ ok: true, messages });
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

  let body: CreateMessageRequest | null = null;

  try {
    body = (await request.json()) as CreateMessageRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const content = body?.content;

  if (typeof content !== "string") {
    return NextResponse.json({ ok: false, error: "content is required." }, { status: 400 });
  }

  try {
    await createMessage(id, content);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "content is required." ? 400 : message === "Thread not found." ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
