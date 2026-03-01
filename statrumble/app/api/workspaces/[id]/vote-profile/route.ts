import { NextRequest, NextResponse } from "next/server";
import { parseVoteLabels, type VoteLabels } from "@/lib/voteProfile";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VoteProfileSection = {
  prompt: string;
  labels: VoteLabels;
};

type WorkspaceVoteProfileConfig = {
  discussion: VoteProfileSection;
  transform_proposal: VoteProfileSection;
};

type UpdateWorkspaceVoteProfileRequest = {
  config?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseVoteProfileSection(value: unknown): VoteProfileSection | null {
  const section = asRecord(value);

  if (!section) {
    return null;
  }

  const prompt = asNonEmptyString(section.prompt);
  const labels = parseVoteLabels(section.labels);

  if (!prompt || !labels) {
    return null;
  }

  return { prompt, labels };
}

function parseWorkspaceVoteProfileConfig(value: unknown): WorkspaceVoteProfileConfig | null {
  const config = asRecord(value);

  if (!config) {
    return null;
  }

  const discussion = parseVoteProfileSection(config.discussion);
  const transformProposal = parseVoteProfileSection(config.transform_proposal);

  if (!discussion || !transformProposal) {
    return null;
  }

  return {
    discussion,
    transform_proposal: transformProposal,
  };
}

function mapRpcErrorStatus(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("unauthorized")) {
    return 401;
  }

  if (normalized.includes("forbidden")) {
    return 403;
  }

  if (normalized.includes("workspace_id is required") || normalized.includes("config must be a json object")) {
    return 400;
  }

  if (normalized.includes("not found")) {
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

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing workspace id." }, { status: 400 });
  }

  const { supabase, authorized } = await requireAuth();

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_workspace_vote_profile", {
    p_workspace_id: id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: mapRpcErrorStatus(error.message) });
  }

  return NextResponse.json({ ok: true, config: data ?? null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing workspace id." }, { status: 400 });
  }

  const { supabase, authorized } = await requireAuth();

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: UpdateWorkspaceVoteProfileRequest | null = null;

  try {
    body = (await request.json()) as UpdateWorkspaceVoteProfileRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedConfig = parseWorkspaceVoteProfileConfig(body?.config);

  if (!parsedConfig) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "config must include discussion and transform_proposal with non-empty prompt and labels A/B/C.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("set_workspace_vote_profile", {
    p_workspace_id: id,
    p_config: parsedConfig,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: mapRpcErrorStatus(error.message) });
  }

  return NextResponse.json({ ok: true });
}
