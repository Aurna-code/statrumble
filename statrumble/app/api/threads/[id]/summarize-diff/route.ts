import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getThread } from "@/lib/db/threads";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CodexDiffSummary = {
  summary: string;
  key_diffs: string[];
  risks: string[];
  recommendation: string;
};

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RouteError";
    this.status = status;
  }
}

const DEFAULT_SUMMARY_MODEL = "gpt-5.2-codex";
const MAX_OUTPUT_TOKENS = 700;
const PARSE_LOG_PREVIEW_CHARS = 300;

const codexSummaryPropertiesForModel = {
  summary: { type: "string", minLength: 1, maxLength: 800 },
  key_diffs: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, minItems: 3, maxItems: 6 },
  risks: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, minItems: 0, maxItems: 5 },
  recommendation: { type: "string", minLength: 1, maxLength: 600 },
} as const;

const codexSummarySchemaForModel = {
  type: "object",
  additionalProperties: false,
  properties: codexSummaryPropertiesForModel,
  required: Object.keys(codexSummaryPropertiesForModel),
} as const;

function asErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function assertNoUnsupportedSchemaCombinators(schema: unknown, schemaName: string) {
  const serialized = JSON.stringify(schema);
  const unsupported = ['"oneOf"', '"anyOf"', '"allOf"'].filter((keyword) => serialized.includes(keyword));

  if (unsupported.length > 0) {
    throw new Error(
      `[summarize-diff] ${schemaName} includes unsupported JSON schema combinators for strict outputs: ${unsupported.join(", ")}`,
    );
  }
}

function assertRequiredCoversAllProperties(schema: unknown, schemaName: string) {
  const issues: string[] = [];

  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }

    const record = node as Record<string, unknown>;
    const type = record.type;
    const propertiesRaw = record.properties;
    const hasObjectProperties =
      type === "object" && propertiesRaw && typeof propertiesRaw === "object" && !Array.isArray(propertiesRaw);

    if (hasObjectProperties) {
      const properties = propertiesRaw as Record<string, unknown>;
      const propertyKeys = Object.keys(properties);
      const requiredRaw = record.required;

      if (!Array.isArray(requiredRaw)) {
        issues.push(`${path}: required is missing or not an array`);
      } else {
        const requiredSet = new Set(requiredRaw.filter((item): item is string => typeof item === "string"));
        const missing = propertyKeys.filter((key) => !requiredSet.has(key));

        if (missing.length > 0) {
          issues.push(`${path}: required missing keys [${missing.join(", ")}]`);
        }
      }

      for (const [key, child] of Object.entries(properties)) {
        visit(child, `${path}.properties.${key}`);
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (hasObjectProperties && key === "properties") {
        continue;
      }

      if (key === "required") {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}.${key}[${index}]`));
        continue;
      }

      visit(value, `${path}.${key}`);
    }
  };

  visit(schema, schemaName);

  if (issues.length > 0) {
    throw new Error(`[summarize-diff] ${schemaName} required coverage check failed: ${issues.join(" | ")}`);
  }
}

if (process.env.NODE_ENV !== "production") {
  assertNoUnsupportedSchemaCombinators(codexSummarySchemaForModel, "transform_diff_summary");
  assertRequiredCoversAllProperties(codexSummarySchemaForModel, "transform_diff_summary");
}

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

function asStringArray(value: unknown, minItems: number, maxItems: number): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length < minItems || value.length > maxItems) {
    return null;
  }

  const normalized: string[] = [];

  for (const item of value) {
    const text = asNonEmptyString(item);

    if (!text) {
      return null;
    }

    normalized.push(text);
  }

  return normalized;
}

function toJsonCandidate(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

function extractRefusalMessage(response: unknown): string | null {
  const root = asRecord(response);

  if (!root) {
    return null;
  }

  const rootRefusal = asNonEmptyString(root.refusal);

  if (rootRefusal) {
    return rootRefusal;
  }

  const output = root.output;

  if (!Array.isArray(output)) {
    return null;
  }

  for (const outputItem of output) {
    const item = asRecord(outputItem);

    if (!item) {
      continue;
    }

    const itemRefusal = asNonEmptyString(item.refusal);

    if (itemRefusal) {
      return itemRefusal;
    }

    const content = item.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const entry = asRecord(contentItem);

      if (!entry) {
        continue;
      }

      const entryType = asNonEmptyString(entry.type);

      if (entryType === "refusal") {
        return asNonEmptyString(entry.refusal) ?? asNonEmptyString(entry.text) ?? "Model refused output.";
      }
    }
  }

  return null;
}

function extractStructuredOutputText(response: unknown): string | null {
  const root = asRecord(response);

  if (!root) {
    return null;
  }

  const outputText = asNonEmptyString(root.output_text);

  if (outputText) {
    return outputText;
  }

  const output = root.output;

  if (!Array.isArray(output)) {
    return null;
  }

  const textParts: string[] = [];

  for (const outputItem of output) {
    const item = asRecord(outputItem);

    if (!item) {
      continue;
    }

    const content = item.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const entry = asRecord(contentItem);

      if (!entry) {
        continue;
      }

      const entryType = asNonEmptyString(entry.type);

      if (entryType === "output_text" || entryType === "text") {
        const text = asNonEmptyString(entry.text);

        if (text) {
          textParts.push(text);
        }
      }
    }
  }

  if (textParts.length === 0) {
    return null;
  }

  return textParts.join("\n").trim();
}

function parseCodexSummary(value: unknown): CodexDiffSummary | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const summary = asNonEmptyString(record.summary);
  const keyDiffs = asStringArray(record.key_diffs, 3, 6);
  const risks = asStringArray(record.risks, 0, 5);
  const recommendation = asNonEmptyString(record.recommendation);

  if (!summary || !keyDiffs || !risks || !recommendation) {
    return null;
  }

  return {
    summary,
    key_diffs: keyDiffs,
    risks,
    recommendation,
  };
}

async function requestCodexSummary(params: {
  openai: OpenAI;
  model: string;
  parentStats: Record<string, unknown>;
  childStats: Record<string, unknown>;
  deltas: Record<string, unknown>;
  parentTransformSpecPresent: boolean;
  childTransformSpecPresent: boolean;
}) {
  const {
    openai,
    model,
    parentStats,
    childStats,
    deltas,
    parentTransformSpecPresent,
    childTransformSpecPresent,
  } = params;
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You summarize transform proposal diffs for collaboration reviews. Be concise, specific, and practical for team discussion.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Summarize child vs parent transform differences for collaboration review.",
            instructions: [
              "Use only the provided stats and deltas.",
              "Highlight concrete numeric shifts and likely practical implications.",
              "Keep the recommendation to 1-2 sentences.",
            ],
            input: {
              parent_stats: parentStats,
              child_stats: childStats,
              deltas,
              parent_transform_spec_present: parentTransformSpecPresent,
              child_transform_spec_present: childTransformSpecPresent,
            },
          },
          null,
          2,
        ),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "transform_diff_summary",
        strict: true,
        schema: codexSummarySchemaForModel,
      },
    },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  });

  const refusal = extractRefusalMessage(response);

  if (refusal) {
    throw new RouteError(502, `Model refusal: ${refusal}`);
  }

  const outputText = extractStructuredOutputText(response);

  if (!outputText) {
    throw new RouteError(502, "Model returned no structured JSON payload.");
  }

  const candidate = toJsonCandidate(outputText);

  try {
    const parsed = JSON.parse(candidate);
    const summary = parseCodexSummary(parsed);

    if (!summary) {
      throw new Error("Invalid codex summary payload.");
    }

    return summary;
  } catch (error) {
    console.error("[summarize-diff] Failed to parse summary JSON", {
      model,
      error: asErrorMessage(error),
      raw_head: outputText.slice(0, PARSE_LOG_PREVIEW_CHARS),
      raw_tail: outputText.slice(-PARSE_LOG_PREVIEW_CHARS),
      candidate_head: candidate.slice(0, PARSE_LOG_PREVIEW_CHARS),
      candidate_tail: candidate.slice(-PARSE_LOG_PREVIEW_CHARS),
    });

    throw new RouteError(502, `Failed to parse summary JSON: ${asErrorMessage(error)}`);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing thread id." }, { status: 400 });
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

    if (thread.kind !== "transform_proposal") {
      return NextResponse.json(
        { ok: false, error: "Diff summarization is only supported for transform_proposal threads." },
        { status: 400 },
      );
    }

    const diffReport = asRecord(thread.transform_diff_report);

    if (!diffReport) {
      return NextResponse.json({ ok: false, error: "transform_diff_report is missing." }, { status: 400 });
    }

    const diffError = asNonEmptyString(diffReport.error);
    const deltas = asRecord(diffReport.deltas);

    if (!diffError && !deltas) {
      return NextResponse.json(
        { ok: false, error: "transform_diff_report must include deltas or an error." },
        { status: 400 },
      );
    }

    if (diffError) {
      return NextResponse.json({ ok: false, error: `Cannot summarize diff because report has error: ${diffError}` }, { status: 400 });
    }

    if (!deltas) {
      return NextResponse.json({ ok: false, error: "transform_diff_report.deltas is missing." }, { status: 400 });
    }

    const parentStats = asRecord(diffReport.parent_stats);
    const childStats = asRecord(diffReport.child_stats);

    if (!parentStats || !childStats) {
      return NextResponse.json(
        { ok: false, error: "transform_diff_report parent_stats/child_stats are required for summarization." },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const model = process.env.OPENAI_CODEX_SUMMARY_MODEL?.trim() || DEFAULT_SUMMARY_MODEL;
    const openai = new OpenAI({ apiKey });
    const codexSummary = await requestCodexSummary({
      openai,
      model,
      parentStats,
      childStats,
      deltas,
      parentTransformSpecPresent: Boolean(diffReport.parent_transform_spec_present),
      childTransformSpecPresent: thread.transform_spec !== null && thread.transform_spec !== undefined,
    });

    const nextDiffReport = {
      ...diffReport,
      codex_summary: codexSummary,
      codex_summary_updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("arena_threads")
      .update({
        transform_diff_report: nextDiffReport,
      })
      .eq("id", thread.id)
      .eq("workspace_id", activeWorkspaceId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, codex_summary: codexSummary });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: asErrorMessage(error) }, { status: 500 });
  }
}
