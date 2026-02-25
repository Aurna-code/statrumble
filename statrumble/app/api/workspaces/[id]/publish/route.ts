import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PublishRequest = {
  public?: boolean | string | number;
  displayName?: string | null;
  description?: string | null;
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

function normalizeDisplayName(value: unknown) {
  if (value === undefined) {
    return { value: undefined as string | null | undefined, invalid: false };
  }

  if (value === null) {
    return { value: null as string | null, invalid: false };
  }

  if (typeof value !== "string") {
    return { value: undefined as string | null | undefined, invalid: true };
  }

  const trimmed = value.trim();
  return { value: trimmed.length > 0 ? trimmed : null, invalid: false };
}

function normalizeDescription(value: unknown) {
  if (value === undefined) {
    return { value: undefined as string | null | undefined, invalid: false };
  }

  if (value === null) {
    return { value: null as string | null, invalid: false };
  }

  if (typeof value !== "string") {
    return { value: undefined as string | null | undefined, invalid: true };
  }

  return { value, invalid: false };
}

async function readPublishFromBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      value: null as boolean | null,
      invalid: false,
      displayName: undefined as string | null | undefined,
      description: undefined as string | null | undefined,
    };
  }

  let body: PublishRequest | null = null;

  try {
    body = (await request.json()) as PublishRequest;
  } catch {
    return {
      value: null as boolean | null,
      invalid: true,
      displayName: undefined as string | null | undefined,
      description: undefined as string | null | undefined,
    };
  }

  const candidate = body?.public;
  let value: boolean | null = null;
  let invalid = false;

  if (typeof candidate === "boolean") {
    value = candidate;
  } else if (typeof candidate === "number") {
    value = candidate === 1;
  } else if (typeof candidate === "string") {
    const parsed = parsePublicValue(candidate);
    value = parsed;
    invalid = parsed === null;
  } else if (candidate !== undefined) {
    invalid = true;
  }

  const displayNameResult = normalizeDisplayName(body?.displayName);
  const descriptionResult = normalizeDescription(body?.description);

  if (displayNameResult.invalid || descriptionResult.invalid) {
    invalid = true;
  }

  return {
    value,
    invalid,
    displayName: displayNameResult.value,
    description: descriptionResult.value,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing workspace id." }, { status: 400 });
  }

  const publicQuery = request.nextUrl.searchParams.get("public");
  const publicFromQuery = parsePublicValue(publicQuery);

  if (publicQuery && publicFromQuery === null) {
    return NextResponse.json({ ok: false, error: "Invalid public query value." }, { status: 400 });
  }

  const { value: publicFromBody, invalid, displayName, description } = await readPublishFromBody(request);

  if (invalid) {
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

  const rpcPayload: {
    p_workspace_id: string;
    p_public: boolean;
    p_display_name?: string | null;
    p_description?: string | null;
  } = {
    p_workspace_id: id,
    p_public: nextPublic,
  };

  if (displayName !== undefined) {
    rpcPayload.p_display_name = displayName;
  }

  if (description !== undefined) {
    rpcPayload.p_description = description;
  }

  const { data, error } = await supabase.rpc("set_workspace_public", rpcPayload);

  if (error) {
    const message = error.message ?? "Failed to update public status.";
    const status =
      message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return NextResponse.json({ ok: false, error: "Failed to update workspace." }, { status: 500 });
  }

  const slug = row.slug ?? null;
  const isPublic = Boolean(row.is_public);
  const publicAt = row.public_at ?? null;
  const publicUrl = slug ? `/p/w/${slug}` : null;

  return NextResponse.json({ ok: true, slug, isPublic, publicAt, publicUrl });
}
