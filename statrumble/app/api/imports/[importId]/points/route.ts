import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_POINTS = 5000;

type PointRow = {
  ts: string;
  value: number;
};

type RouteContext = {
  params: Promise<{ importId: string }>;
};

function parseDateParam(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function downsamplePoints(points: PointRow[]) {
  if (points.length <= MAX_POINTS) {
    return {
      points,
      total: points.length,
      sampled: false,
    };
  }

  const stride = Math.ceil(points.length / MAX_POINTS);
  const sampledPoints = points.filter((_, index) => index % stride === 0).slice(0, MAX_POINTS);
  sampledPoints[sampledPoints.length - 1] = points[points.length - 1];

  return {
    points: sampledPoints,
    total: points.length,
    sampled: true,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { importId } = await context.params;

  if (!importId) {
    return NextResponse.json({ ok: false, error: "Missing importId." }, { status: 400 });
  }

  const startTsInput = request.nextUrl.searchParams.get("start_ts");
  const endTsInput = request.nextUrl.searchParams.get("end_ts");
  const startTs = parseDateParam(startTsInput);
  const endTs = parseDateParam(endTsInput);

  if (startTsInput && !startTs) {
    return NextResponse.json({ ok: false, error: "Invalid start_ts." }, { status: 400 });
  }

  if (endTsInput && !endTs) {
    return NextResponse.json({ ok: false, error: "Invalid end_ts." }, { status: 400 });
  }

  if (startTs && endTs && new Date(endTs).getTime() <= new Date(startTs).getTime()) {
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
      .select("id")
      .eq("id", importId)
      .maybeSingle();

    if (importError) {
      return NextResponse.json({ ok: false, error: importError.message }, { status: 500 });
    }

    if (!metricImport) {
      return NextResponse.json({ ok: false, error: "Import not found." }, { status: 404 });
    }

    let query = supabase
      .from("metric_points")
      .select("ts, value")
      .eq("import_id", importId)
      .order("ts", { ascending: true });

    if (startTs) {
      query = query.gte("ts", startTs);
    }

    if (endTs) {
      query = query.lte("ts", endTs);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as PointRow[];
    const sampledResult = downsamplePoints(rows);

    return NextResponse.json({
      ok: true,
      points: sampledResult.points,
      total: sampledResult.total,
      sampled: sampledResult.sampled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
