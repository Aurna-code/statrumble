import { NextRequest, NextResponse } from "next/server";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { mergeSelectedSeriesIntoSnapshot } from "@/lib/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getDefaultVoteProfile, isVoteProfile, resolveVoteProfileFromConfig } from "@/lib/voteProfile";

type CreateThreadRequest = {
  import_id?: string;
  start_ts?: string;
  end_ts?: string;
};

type PointRow = {
  ts: string;
  value: number;
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

function buildDiscussionThreadTitle(snapshot: unknown, startTs: string, endTs: string): string {
  const snapshotRecord = asRecord(snapshot);
  const metricRecord = asRecord(snapshotRecord?.metric);
  const metricName = asNonEmptyString(metricRecord?.name) ?? "Thread";

  return `${metricName} (${startTs} → ${endTs})`;
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export async function POST(request: NextRequest) {
  let body: CreateThreadRequest | null = null;

  try {
    body = (await request.json()) as CreateThreadRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const importId = body?.import_id?.trim();
  const startTs = parseDate(body?.start_ts);
  const endTs = parseDate(body?.end_ts);

  if (!importId) {
    return NextResponse.json({ ok: false, error: "import_id is required." }, { status: 400 });
  }

  if (!startTs || !endTs) {
    return NextResponse.json({ ok: false, error: "start_ts and end_ts must be valid dates." }, { status: 400 });
  }

  if (new Date(endTs).getTime() <= new Date(startTs).getTime()) {
    return NextResponse.json({ ok: false, error: "end_ts must be greater than start_ts." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const activeWorkspaceId = await getRequiredActiveWorkspaceId();

    const { data: metricImport, error: importError } = await supabase
      .from("metric_imports")
      .select("id, workspace_id, metric_id")
      .eq("id", importId)
      .eq("workspace_id", activeWorkspaceId)
      .single();

    if (importError || !metricImport) {
      return NextResponse.json({ ok: false, error: "Import not found." }, { status: 404 });
    }

    const { data: snapshot, error: snapshotError } = await supabase.rpc("compute_snapshot", {
      p_import_id: importId,
      p_start_ts: startTs,
      p_end_ts: endTs,
    });

    if (snapshotError) {
      return NextResponse.json({ ok: false, error: snapshotError.message }, { status: 500 });
    }

    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "Snapshot calculation returned empty result." }, { status: 500 });
    }

    const { data: voteProfileConfig, error: voteProfileError } = await supabase.rpc("get_workspace_vote_profile", {
      p_workspace_id: metricImport.workspace_id,
    });

    if (voteProfileError) {
      return NextResponse.json({ ok: false, error: "Vote profile resolution failed" }, { status: 500 });
    }

    const voteProfile =
      resolveVoteProfileFromConfig(voteProfileConfig, "discussion") ?? getDefaultVoteProfile("discussion");

    if (!isVoteProfile(voteProfile)) {
      return NextResponse.json({ ok: false, error: "Vote profile resolution failed" }, { status: 500 });
    }

    const { data: selectedPointRows, error: selectedPointsError } = await supabase
      .from("metric_points")
      .select("ts, value")
      .eq("workspace_id", metricImport.workspace_id)
      .eq("import_id", importId)
      .gte("ts", startTs)
      .lt("ts", endTs)
      .order("ts", { ascending: true });

    if (selectedPointsError) {
      return NextResponse.json({ ok: false, error: selectedPointsError.message }, { status: 500 });
    }

    const selectedPoints = ((selectedPointRows as PointRow[] | null) ?? []).map((point) => ({
      ts: point.ts,
      value: point.value,
    }));
    const snapshotWithSeries = mergeSelectedSeriesIntoSnapshot(snapshot, selectedPoints);
    const title = buildDiscussionThreadTitle(snapshotWithSeries, startTs, endTs);

    const { data: insertedThread, error: insertError } = await supabase
      .from("arena_threads")
      .insert({
        workspace_id: metricImport.workspace_id,
        visibility: "workspace",
        kind: "discussion",
        metric_id: metricImport.metric_id,
        import_id: importId,
        start_ts: startTs,
        end_ts: endTs,
        snapshot: snapshotWithSeries,
        vote_prompt: voteProfile.prompt,
        vote_labels: voteProfile.labels,
        title,
      })
      .select("id")
      .single();

    if (insertError || !insertedThread) {
      return NextResponse.json({ ok: false, error: insertError?.message ?? "Failed to create thread." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, thread_id: insertedThread.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
