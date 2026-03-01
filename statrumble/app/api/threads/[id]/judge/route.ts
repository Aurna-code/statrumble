import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getThread } from "@/lib/db/threads";
import { listMessages } from "@/lib/db/messages";
import { getVoteSummary } from "@/lib/db/votes";
import { mockRefereeReport } from "@/lib/demoMock";
import { isDemoMode } from "@/lib/demoMode";
import { refereeJsonSchema, type RefereeReport } from "@/lib/referee/schema";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_REFEREE_MODEL = "gpt-5-mini";
const DEFAULT_REFEREE_FALLBACK_MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 2000;
const PARSE_LOG_PREVIEW_CHARS = 300;

function asErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function parseForceValue(value: string | null) {
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

async function readForceFromBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return { value: null as boolean | null, invalid: false };
  }

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    return { value: null as boolean | null, invalid: true };
  }

  if (!body || typeof body !== "object") {
    return { value: null as boolean | null, invalid: false };
  }

  const force = (body as Record<string, unknown>).force;

  if (typeof force === "boolean") {
    return { value: force, invalid: false };
  }

  if (typeof force === "number") {
    return { value: force === 1, invalid: false };
  }

  if (typeof force === "string") {
    const parsed = parseForceValue(force);
    return { value: parsed, invalid: parsed === null };
  }

  if (force === undefined) {
    return { value: null as boolean | null, invalid: false };
  }

  return { value: null as boolean | null, invalid: true };
}

function isGpt5Model(model: string) {
  return model.startsWith("gpt-5");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null) {
    return "-";
  }

  return value.toFixed(digits);
}

function formatCount(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${Math.round(value)}`;
}

function buildSnapshotSummary(snapshot: unknown) {
  const root = asRecord(snapshot);
  const selected = asRecord(root?.selected);
  const before = asRecord(root?.before);
  const delta = asRecord(root?.delta);
  const selectedAvg = asFiniteNumber(selected?.avg);
  const selectedN = asFiniteNumber(selected?.n);
  const beforeAvg = asFiniteNumber(before?.avg);
  const beforeN = asFiniteNumber(before?.n);
  const deltaAbs = asFiniteNumber(delta?.abs);
  const deltaRel = asFiniteNumber(delta?.rel);
  const deltaPct = deltaRel === null ? "-" : formatNumber(deltaRel * 100, 2);

  if (beforeAvg === null) {
    return `Selected average ${formatNumber(selectedAvg)} over ${formatCount(selectedN)} points; no prior-range baseline available.`;
  }

  return `Selected average ${formatNumber(selectedAvg)} over ${formatCount(selectedN)} points; previous average ${formatNumber(beforeAvg)} over ${formatCount(beforeN)} points; delta ${formatNumber(deltaAbs)} (${deltaPct}%).`;
}

function toJsonCandidate(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

function logParseFailure(raw: string, candidate: string, model: string, error: unknown) {
  const rawHead = raw.slice(0, PARSE_LOG_PREVIEW_CHARS);
  const rawTail = raw.slice(-PARSE_LOG_PREVIEW_CHARS);
  const candidateHead = candidate.slice(0, PARSE_LOG_PREVIEW_CHARS);
  const candidateTail = candidate.slice(-PARSE_LOG_PREVIEW_CHARS);

  console.error("[judge] Failed to parse referee JSON", {
    model,
    parse_error: asErrorMessage(error),
    raw_length: raw.length,
    raw_head: rawHead,
    raw_tail: rawTail,
    candidate_length: candidate.length,
    candidate_head: candidateHead,
    candidate_tail: candidateTail,
  });
}

function tryParseRefereeReport(rawOutput: string, model: string):
  | { ok: true; report: RefereeReport }
  | { ok: false; error: string } {
  const raw = rawOutput.trim();

  if (!raw) {
    return {
      ok: false,
      error: "Failed to parse referee JSON: Empty referee output.",
    };
  }

  const candidate = toJsonCandidate(raw);

  try {
    const report = JSON.parse(candidate) as RefereeReport;

    return {
      ok: true,
      report,
    };
  } catch (error) {
    logParseFailure(raw, candidate, model, error);

    return {
      ok: false,
      error: `Failed to parse referee JSON: ${asErrorMessage(error)}`,
    };
  }
}

async function requestRefereeOutput(params: {
  openai: OpenAI;
  model: string;
  systemContent: string;
  userContent: string;
}) {
  const { openai, model, systemContent, userContent } = params;
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "referee_report",
        strict: true,
        schema: refereeJsonSchema,
      },
    },
    ...(isGpt5Model(model)
      ? {
          reasoning: {
            effort: "minimal" as const,
          },
        }
      : {}),
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  });

  return (response.output_text ?? "").trim();
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const forceQuery = request.nextUrl.searchParams.get("force");
  const forceFromQuery = parseForceValue(forceQuery);

  if (forceQuery && forceFromQuery === null) {
    return NextResponse.json({ ok: false, error: "Invalid force query value." }, { status: 400 });
  }

  const { value: forceFromBody, invalid: forceBodyInvalid } = await readForceFromBody(request);

  if (forceBodyInvalid) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const force = forceFromQuery ?? forceFromBody ?? false;

  try {
    const thread = await getThread(id);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
    }

    const existingReportRaw = (thread.referee_report as RefereeReport | null) ?? null;
    const existingReport = existingReportRaw
      ? {
          ...existingReportRaw,
          demo_note: typeof existingReportRaw.demo_note === "string" ? existingReportRaw.demo_note : null,
        }
      : null;

    if (!force && existingReport) {
      return NextResponse.json({ ok: true, report: existingReport, reused: true });
    }

    const voteSummary = await getVoteSummary(id);
    const recentMessages = await listMessages(id, 30);
    const messagesForModel = recentMessages.length > 20 ? recentMessages.slice(-20) : recentMessages;
    const demoMode = isDemoMode();

    if (demoMode) {
      const report = mockRefereeReport({
        threadId: id,
        votes: {
          A: voteSummary.counts.A,
          B: voteSummary.counts.B,
          C: voteSummary.counts.C,
          my_stance: voteSummary.my_stance,
        },
        snapshotSummary: buildSnapshotSummary(thread.snapshot),
        messages: messagesForModel.map((message) => ({
          content: message.content,
          user_id: message.user_id,
          created_at: message.created_at,
        })),
      });

      const { error: updateError } = await supabase
        .from("arena_threads")
        .update({ referee_report: report, referee_report_updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, report, reused: false });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const model = process.env.OPENAI_REFEREE_MODEL || DEFAULT_REFEREE_MODEL;
    const fallbackModel = process.env.OPENAI_REFEREE_FALLBACK_MODEL || DEFAULT_REFEREE_FALLBACK_MODEL;
    const openai = new OpenAI({ apiKey });

    const modelInput = {
      metric: {
        name: thread.metric?.name ?? null,
        unit: thread.metric?.unit ?? null,
      },
      range: {
        start_ts: thread.start_ts,
        end_ts: thread.end_ts,
      },
      snapshot: thread.snapshot,
      votes: {
        A: voteSummary.counts.A,
        B: voteSummary.counts.B,
        C: voteSummary.counts.C,
        my_stance: voteSummary.my_stance,
      },
      messages: messagesForModel.map((message) => ({
        created_at: message.created_at,
        user_id: message.user_id,
        content: message.content,
      })),
    };

    const systemContent =
      "You are a referee for data disputes. Judge only from snapshot/votes/messages. Do not guess unknowns; use confounders/next_checks and verdict.leading can be unclear. data_facts must contain only directly citable facts from provided numbers/text. Return JSON only and follow the schema exactly. Keep every string field on one line; if needed, use escaped \\n.";
    const userContent = `Generate referee_report JSON from the following input.\n\n${JSON.stringify(modelInput, null, 2)}`;

    const primaryRaw = await requestRefereeOutput({
      openai,
      model,
      systemContent,
      userContent,
    });
    const primaryParse = tryParseRefereeReport(primaryRaw, model);

    let report: RefereeReport;

    if (primaryParse.ok) {
      report = primaryParse.report;
    } else {
      if (!fallbackModel || fallbackModel === model) {
        return NextResponse.json({ ok: false, error: primaryParse.error }, { status: 500 });
      }

      const fallbackRaw = await requestRefereeOutput({
        openai,
        model: fallbackModel,
        systemContent,
        userContent,
      });
      const fallbackParse = tryParseRefereeReport(fallbackRaw, fallbackModel);

      if (!fallbackParse.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `${primaryParse.error} | fallback(${fallbackModel}): ${fallbackParse.error}`,
          },
          { status: 500 },
        );
      }

      report = fallbackParse.report;
    }

    // Real API mode should not show a demo banner.
    report = {
      ...report,
      demo_note: null,
    };

    const { error: updateError } = await supabase
      .from("arena_threads")
      .update({ referee_report: report, referee_report_updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, report, reused: false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: asErrorMessage(error) }, { status: 500 });
  }
}
