import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PublishRequest = {
  public?: boolean | string | number;
};

function parsePublicValue(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  return null;
}

async function readPublicFromBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return { value: null as boolean | null, invalid: false };
  }

  let body: PublishRequest | null = null;

  try {
    body = (await request.json()) as PublishRequest;
  } catch {
    return { value: null as boolean | null, invalid: true };
  }

  const candidate = body?.public;

  if (typeof candidate === "boolean") {
    return { value: candidate, invalid: false };
  }

  if (typeof candidate === "number") {
    return { value: candidate === 1, invalid: false };
  }

  if (typeof candidate === "string") {
    const parsed = parsePublicValue(candidate);
    return { value: parsed, invalid: parsed === null };
  }

  if (candidate === undefined) {
    return { value: null as boolean | null, invalid: false };
  }

  return { value: null as boolean | null, invalid: true };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing decision id." }, { status: 400 });
  }

  const publicQuery = request.nextUrl.searchParams.get("public");
  const publicFromQuery = parsePublicValue(publicQuery);

  if (publicQuery && publicFromQuery === null) {
    return NextResponse.json({ ok: false, error: "Invalid public query value." }, { status: 400 });
  }

  const { value: publicFromBody, invalid: publicBodyInvalid } = await readPublicFromBody(request);

  if (publicBodyInvalid) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const nextPublic = publicFromQuery ?? publicFromBody;

  if (nextPublic === null) {
    return NextResponse.json({ ok: false, error: "public flag is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("set_decision_public", {
    p_decision_id: id,
    p_public: nextPublic,
  });

  if (error) {
    const message = error.message ?? "Failed to update public status.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return NextResponse.json({ ok: false, error: "Failed to update decision." }, { status: 500 });
  }

  const publicId = row.public_id ?? null;
  const isPublic = Boolean(row.is_public);
  const publicUrl = publicId ? `/p/decisions/${publicId}` : null;

  return NextResponse.json({ ok: true, publicId, isPublic, publicUrl });
}
