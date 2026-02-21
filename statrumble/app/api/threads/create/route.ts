import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CreateThreadRequest = {
  import_id?: string;
  start_ts?: string;
  end_ts?: string;
};

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

    const { data: metricImport, error: importError } = await supabase
      .from("metric_imports")
      .select("id, workspace_id, metric_id")
      .eq("id", importId)
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

    const { data: insertedThread, error: insertError } = await supabase
      .from("arena_threads")
      .insert({
        workspace_id: metricImport.workspace_id,
        metric_id: metricImport.metric_id,
        import_id: importId,
        start_ts: startTs,
        end_ts: endTs,
        snapshot,
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
