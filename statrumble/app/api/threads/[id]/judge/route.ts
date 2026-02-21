import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getThread } from "@/lib/db/threads";
import { listMessages } from "@/lib/db/messages";
import { getVoteSummary } from "@/lib/db/votes";
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

function isGpt5Model(model: string) {
  return model.startsWith("gpt-5");
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

export async function POST(_request: NextRequest, context: RouteContext) {
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const thread = await getThread(id);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
    }

    const voteSummary = await getVoteSummary(id);
    const recentMessages = await listMessages(id, 30);
    const messagesForModel = recentMessages.length > 20 ? recentMessages.slice(-20) : recentMessages;
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
      "너는 데이터 논쟁의 Referee다. 제공된 snapshot/votes/messages만 근거로 판단하라. 모르는 내용은 추정하지 말고 confounders/next_checks에 명시하고 verdict.leading은 unclear를 사용할 수 있다. data_facts는 반드시 주어진 숫자/문장에서 직접 인용 가능한 사실만 작성하라. 출력은 반드시 JSON만 반환하고 스키마를 정확히 준수하라. 모든 문장은 가능한 한 한국어로 작성하라. 모든 string 필드는 줄바꿈 없이 한 줄로 작성하고, 줄바꿈이 필요하면 \\n 이스케이프를 사용하라.";
    const userContent = `다음 입력을 바탕으로 referee_report JSON을 생성하라.\n\n${JSON.stringify(modelInput, null, 2)}`;

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

    const { error: updateError } = await supabase
      .from("arena_threads")
      .update({ referee_report: report })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: asErrorMessage(error) }, { status: 500 });
  }
}
