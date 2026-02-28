import { NextRequest, NextResponse } from "next/server";
import { getDisplayNameFromUser } from "@/lib/userDisplay";
import { createClient } from "@/lib/supabase/server";

type UpdateProfileRequest = {
  displayName?: string;
};

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 32;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

function validateDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return { error: "displayName is required." as const, value: null };
  }

  const trimmed = value.trim();

  if (trimmed.length < DISPLAY_NAME_MIN_LENGTH || trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      error: `displayName must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters.` as const,
      value: null,
    };
  }

  if (!DISPLAY_NAME_PATTERN.test(trimmed)) {
    return {
      error: "displayName may contain only letters, numbers, spaces, hyphens, and underscores." as const,
      value: null,
    };
  }

  return { error: null, value: trimmed };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

export async function GET() {
  const { user } = await requireUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    displayName: getDisplayNameFromUser(user),
  });
}

export async function POST(request: NextRequest) {
  let body: UpdateProfileRequest | null = null;

  try {
    body = (await request.json()) as UpdateProfileRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const validated = validateDisplayName(body?.displayName);

  if (validated.error || !validated.value) {
    return NextResponse.json({ ok: false, error: validated.error ?? "displayName is required." }, { status: 400 });
  }

  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.auth.updateUser({
    data: {
      display_name: validated.value,
    },
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    displayName: getDisplayNameFromUser(data.user) ?? validated.value,
  });
}
