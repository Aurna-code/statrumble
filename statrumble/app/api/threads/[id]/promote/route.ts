import { NextResponse } from "next/server";
import {
  PROMOTE_REQUIRES_JUDGE_MESSAGE,
  getPromotableRefereeReport,
} from "@/lib/decisions/promotion";
import { getThread } from "@/lib/db/threads";
import { createClient } from "@/lib/supabase/server";
import { formatDateLabel } from "@/lib/formatDate";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildDecisionTitle(metricName: string | null | undefined, startTs: string, endTs: string) {
  const safeMetric = metricName?.trim() ? metricName.trim() : "Decision";
  const startLabel = formatDateLabel(startTs);
  const endLabel = formatDateLabel(endTs);

  return `${safeMetric} (${startLabel} ~ ${endLabel})`;
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

  const thread = await getThread(id);

  if (!thread) {
    return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
  }

  const { data: existingDecision, error: existingError } = await supabase
    .from("decision_cards")
    .select("id")
    .eq("thread_id", id)
    .eq("workspace_id", thread.workspace_id)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  if (existingDecision?.id) {
    return NextResponse.json({ ok: true, decisionId: existingDecision.id, created: false });
  }

  const promotableReport = getPromotableRefereeReport(thread.referee_report);

  if (!promotableReport) {
    return NextResponse.json({ ok: false, error: PROMOTE_REQUIRES_JUDGE_MESSAGE }, { status: 400 });
  }

  const decisionText = promotableReport.summary;
  const title = buildDecisionTitle(thread.metric?.name ?? null, thread.start_ts, thread.end_ts);

  const { data: insertedDecision, error: insertError } = await supabase
    .from("decision_cards")
    .insert({
      workspace_id: thread.workspace_id,
      thread_id: thread.id,
      title,
      summary: promotableReport.summary,
      decision: decisionText,
      context: null,
      snapshot: thread.snapshot,
      snapshot_start: thread.start_ts,
      snapshot_end: thread.end_ts,
      created_by: user.id,
      referee_report: promotableReport.report,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: racedDecision, error: racedError } = await supabase
        .from("decision_cards")
        .select("id")
        .eq("thread_id", id)
        .eq("workspace_id", thread.workspace_id)
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
