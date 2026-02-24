import { NextResponse } from "next/server";
import { getThread } from "@/lib/db/threads";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function formatDateLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ko-KR");
}

function buildDecisionTitle(metricName: string | null | undefined, startTs: string, endTs: string) {
  const safeMetric = metricName?.trim() ? metricName.trim() : "Decision";
  const startLabel = formatDateLabel(startTs);
  const endLabel = formatDateLabel(endTs);

  return `${safeMetric} (${startLabel} ~ ${endLabel})`;
}

function extractSummary(report: unknown) {
  if (!report || typeof report !== "object") {
    return null;
  }

  const record = report as Record<string, unknown>;
  const tldr = typeof record.tldr === "string" ? record.tldr.trim() : "";

  return tldr.length > 0 ? tldr : null;
}

export async function POST(_request: Request, context: RouteContext) {
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

  let activeWorkspaceId = "";

  try {
    activeWorkspaceId = await getRequiredActiveWorkspaceId();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "No workspace membership." },
      { status: 403 },
    );
  }

  const thread = await getThread(id);

  if (!thread || thread.workspace_id !== activeWorkspaceId) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  const { data: existingDecision, error: existingError } = await supabase
    .from("decision_cards")
    .select("id")
    .eq("thread_id", id)
    .eq("workspace_id", activeWorkspaceId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  if (existingDecision?.id) {
    return NextResponse.json({ ok: true, decisionId: existingDecision.id, created: false });
  }

  const summary = extractSummary(thread.referee_report);
  const decisionText = summary ?? "Decision pending.";
  const title = buildDecisionTitle(thread.metric?.name ?? null, thread.start_ts, thread.end_ts);

  const { data: insertedDecision, error: insertError } = await supabase
    .from("decision_cards")
    .insert({
      workspace_id: thread.workspace_id,
      thread_id: thread.id,
      title,
      summary,
      decision: decisionText,
      context: null,
      snapshot: thread.snapshot,
      snapshot_start: thread.start_ts,
      snapshot_end: thread.end_ts,
      created_by: user.id,
      referee_report: thread.referee_report ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: racedDecision, error: racedError } = await supabase
        .from("decision_cards")
        .select("id")
        .eq("thread_id", id)
        .eq("workspace_id", activeWorkspaceId)
        .limit(1)
        .maybeSingle();

      if (racedError || !racedDecision?.id) {
        return NextResponse.json({ ok: false, error: racedError?.message ?? insertError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, decisionId: racedDecision.id, created: false });
    }

    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  if (!insertedDecision?.id) {
    return NextResponse.json({ ok: false, error: "Failed to create decision." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, decisionId: insertedDecision.id, created: true });
}
