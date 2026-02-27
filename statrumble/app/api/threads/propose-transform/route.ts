import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceVoteProfile } from "@/lib/db/voteProfile";
import { createMessage } from "@/lib/db/messages";
import { getRequiredActiveWorkspaceId } from "@/lib/db/workspaces";
import { createClient } from "@/lib/supabase/server";
import { resolveVoteProfileConfig } from "@/lib/voteProfile";
import {
  TransformSpecSchema,
  applyTransform,
  compareStats,
  type TransformSeriesPoint,
  type TransformWarning,
  type TransformStats,
} from "@/lib/transforms";

type ProposeTransformRequest = {
  import_id?: string;
  prompt?: string;
  parent_thread_id?: string | null;
};

type ImportRow = {
  id: string;
  workspace_id: string;
  metric_id: string | null;
};

type ParentThreadRow = {
  id: string;
  kind: string;
  import_id: string;
  transform_stats: unknown;
  transform_spec: unknown;
};

type PointRow = {
  ts: string;
  value: number;
};

type TransformProposalModelOutput = {
  title: string;
  explanation: string;
  transform_spec: unknown;
  sql_preview: string;
};

const MAX_PROMPT_LENGTH = 4_000;
const MAX_MODEL_POINTS = 200;
const PARSE_LOG_PREVIEW_CHARS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMOVED_CODEX_MODEL = "codex-mini-latest";
const DEFAULT_CODEX_MODEL = "gpt-5.1-codex-mini";

const opPropertiesForModel = {
  op: { type: "string", enum: ["filter_outliers", "moving_average"] },
  method: { type: ["string", "null"], enum: ["iqr", "zscore", null] },
  k: { type: ["number", "null"] },
  z: { type: ["number", "null"] },
  mode: { type: ["string", "null"], enum: ["remove", "clip", null] },
  window: { type: ["integer", "null"], minimum: 1 },
  center: { type: ["boolean", "null"] },
  outputColumn: { type: ["string", "null"] },
} as const;

const opSchemaForModel = {
  type: "object",
  additionalProperties: false,
  properties: opPropertiesForModel,
  required: Object.keys(opPropertiesForModel),
} as const;

const transformSpecPropertiesForModel = {
  version: { type: "integer", enum: [1] },
  ops: { type: "array", minItems: 1, maxItems: 20, items: opSchemaForModel },
} as const;

const transformSpecSchemaForModel = {
  type: "object",
  additionalProperties: false,
  properties: transformSpecPropertiesForModel,
  required: Object.keys(transformSpecPropertiesForModel),
} as const;

const transformProposalPropertiesForModel = {
  title: { type: "string", minLength: 1, maxLength: 120 },
  explanation: { type: "string", minLength: 1, maxLength: 2_000 },
  transform_spec: transformSpecSchemaForModel,
  sql_preview: { type: "string", minLength: 1, maxLength: 4_000 },
} as const;

const transformProposalSchemaForModel = {
  type: "object",
  additionalProperties: false,
  properties: transformProposalPropertiesForModel,
  required: Object.keys(transformProposalPropertiesForModel),
} as const;

function assertNoUnsupportedSchemaCombinators(schema: unknown, schemaName: string) {
  const serialized = JSON.stringify(schema);
  const unsupported = ['"oneOf"', '"anyOf"', '"allOf"'].filter((keyword) => serialized.includes(keyword));

  if (unsupported.length > 0) {
    throw new Error(
      `[propose-transform] ${schemaName} includes unsupported JSON schema combinators for strict outputs: ${unsupported.join(", ")}`,
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
    throw new Error(`[propose-transform] ${schemaName} required coverage check failed: ${issues.join(" | ")}`);
  }
}

if (process.env.NODE_ENV !== "production") {
  assertNoUnsupportedSchemaCombinators(transformProposalSchemaForModel, "transform_proposal");
  assertRequiredCoversAllProperties(transformProposalSchemaForModel, "transform_proposal");
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

class RouteError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "RouteError";
    this.status = status;
    this.details = details;
  }
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

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return asFiniteNumber(value) ?? undefined;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asPositiveNumber(value: unknown): number | null {
  const numeric = asFiniteNumber(value);

  if (numeric === null || numeric <= 0) {
    return null;
  }

  return numeric;
}

function asPositiveInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);

  if (numeric === null || numeric <= 0 || !Number.isInteger(numeric)) {
    return null;
  }

  return numeric;
}

function parseComparableStats(value: unknown): TransformStats | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const countBefore = asFiniteNumber(record.count_before);
  const countAfter = asFiniteNumber(record.count_after);
  const outliersRemoved = asFiniteNumber(record.outliers_removed);
  const mean = asNullableFiniteNumber(record.mean);
  const std = asNullableFiniteNumber(record.std);
  const slope = asNullableFiniteNumber(record.slope);

  if (
    countBefore === null ||
    countAfter === null ||
    outliersRemoved === null ||
    mean === undefined ||
    std === undefined ||
    slope === undefined
  ) {
    return null;
  }

  const warningsRaw = record.warnings;
  let warnings: TransformWarning[] | undefined;

  if (warningsRaw !== undefined) {
    if (!Array.isArray(warningsRaw)) {
      return null;
    }

    const normalizedWarnings = (warningsRaw as unknown[]).filter(
      (item): item is TransformWarning => item === "window_too_large",
    );

    if (normalizedWarnings.length !== warningsRaw.length) {
      return null;
    }

    warnings = normalizedWarnings;
  }

  return {
    count_before: countBefore,
    count_after: countAfter,
    outliers_removed: outliersRemoved,
    mean,
    std,
    slope,
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  };
}

function extractComparableStats(value: unknown): TransformStats | null {
  const direct = parseComparableStats(value);

  if (direct) {
    return direct;
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  return parseComparableStats(record.transformed);
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

function toJsonCandidate(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

function pruneNullsDeep(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => pruneNullsDeep(item)).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(record)) {
    const pruned = pruneNullsDeep(nested);

    if (pruned !== undefined) {
      result[key] = pruned;
    }
  }

  return result;
}

function normalizeTransformSpecFromModel(spec: unknown): unknown {
  const record = asRecord(spec);

  if (!record) {
    return spec;
  }

  const opsRaw = Array.isArray(record.ops) ? record.ops : [];
  const normalizedOps = opsRaw.map((op) => {
    const opRecord = asRecord(op);

    if (!opRecord) {
      return op;
    }

    const opName = asNonEmptyString(opRecord.op);

    if (opName === "filter_outliers") {
      const inferredMethod =
        opRecord.method === "zscore" || (opRecord.method !== "iqr" && asPositiveNumber(opRecord.z) !== null)
          ? "zscore"
          : "iqr";
      const method = inferredMethod === "zscore" ? "zscore" : "iqr";
      const mode = opRecord.mode === "remove" ? "remove" : "clip";

      if (method === "zscore") {
        const z = asPositiveNumber(opRecord.z) ?? 2.5;
        return { op: "filter_outliers", method, mode, z };
      }

      const k = asPositiveNumber(opRecord.k) ?? 1.5;
      return { op: "filter_outliers", method, mode, k };
    }

    if (opName === "moving_average") {
      const window = asPositiveInteger(opRecord.window) ?? 7;
      const center = asBoolean(opRecord.center) ?? false;
      const outputColumn = asNonEmptyString(opRecord.outputColumn);

      return {
        op: "moving_average",
        window,
        center,
        ...(outputColumn ? { outputColumn } : {}),
      };
    }

    return opRecord;
  });

  return {
    version: 1,
    ops: normalizedOps,
  };
}

function parseTimestampMs(ts: string | number) {
  if (typeof ts === "number") {
    return Number.isFinite(ts) ? ts : null;
  }

  const trimmed = ts.trim();

  if (!trimmed) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function sampleSeriesForModel(series: TransformSeriesPoint[]) {
  if (series.length <= MAX_MODEL_POINTS) {
    return series;
  }

  const stride = Math.ceil(series.length / MAX_MODEL_POINTS);
  const sampled = series.filter((_, index) => index % stride === 0).slice(0, MAX_MODEL_POINTS);

  if (sampled.length > 0) {
    sampled[sampled.length - 1] = series[series.length - 1];
  }

  return sampled;
}

function buildInitialMessage(params: {
  title: string;
  explanation: string;
  sqlPreview: string;
  stats: ReturnType<typeof applyTransform>["stats"];
}) {
  const { title, explanation, sqlPreview, stats } = params;

  return [
    `Transform Proposal: ${title}`,
    explanation,
    `Expected effect: count ${stats.count_before} -> ${stats.count_after}, outliers_removed=${stats.outliers_removed}.`,
    "SQL preview is for review only and is NOT executed.",
    `SQL preview:\n${sqlPreview}`,
  ].join("\n\n");
}

async function requestProposalFromModel(params: {
  openai: OpenAI;
  model: string;
  userPrompt: string;
  importId: string;
  parentThreadId: string | null;
  series: TransformSeriesPoint[];
}) {
  const { openai, model, userPrompt, importId, parentThreadId, series } = params;
  const baseline = applyTransform(
    {
      version: 1,
      ops: [{ op: "moving_average", window: 1 }],
    },
    series,
  );
  const sampled = sampleSeriesForModel(baseline.series);
  const userContent = JSON.stringify(
    {
      task: "Create a safe transform proposal for a timeseries debate thread.",
      constraints: [
        "Use only allowed TransformSpec ops.",
        "Keep transform_spec practical for the provided data profile.",
        "sql_preview is illustrative text only; it will not be executed.",
      ],
      input: {
        import_id: importId,
        parent_thread_id: parentThreadId,
        user_prompt: userPrompt,
        series_count: baseline.series.length,
        baseline_stats: baseline.stats,
        sampled_series: sampled,
      },
    },
    null,
    2,
  );

  const modelInput = [
    {
      role: "system" as const,
      content:
        "You generate transform proposals for a chart review workflow. Output must be valid JSON matching the provided schema.",
    },
    {
      role: "user" as const,
      content: userContent,
    },
  ];

  const makeTextConfig = () => ({
    format: {
      type: "json_schema" as const,
      name: "transform_proposal",
      strict: true,
      schema: transformProposalSchemaForModel,
    },
  });

  // Keep this request free of sampling params and text.verbosity for GPT-5/Codex model compatibility.
  const response = await openai.responses.create({
    model,
    input: modelInput,
    text: makeTextConfig(),
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
    const parsed = JSON.parse(candidate) as TransformProposalModelOutput;

    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    const sqlPreview = typeof parsed.sql_preview === "string" ? parsed.sql_preview.trim() : "";

    if (!title || !explanation || !sqlPreview) {
      throw new RouteError(502, "Model output is missing required fields.");
    }

    const cleanedSpec = pruneNullsDeep(parsed.transform_spec);
    const normalizedSpec = normalizeTransformSpecFromModel(cleanedSpec);
    const validatedSpec = TransformSpecSchema.safeParse(normalizedSpec);

    if (!validatedSpec.success) {
      throw new RouteError(422, "Invalid transform_spec from model.", {
        issues: validatedSpec.error.issues,
      });
    }

    return {
      title,
      explanation,
      sqlPreview,
      transformSpec: validatedSpec.data,
    };
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    console.error("[propose-transform] Failed to parse proposal JSON", {
      model,
      error: asErrorMessage(error),
      raw_head: outputText.slice(0, PARSE_LOG_PREVIEW_CHARS),
      raw_tail: outputText.slice(-PARSE_LOG_PREVIEW_CHARS),
      candidate_head: candidate.slice(0, PARSE_LOG_PREVIEW_CHARS),
      candidate_tail: candidate.slice(-PARSE_LOG_PREVIEW_CHARS),
    });

    throw new RouteError(502, `Failed to parse transform proposal JSON: ${asErrorMessage(error)}`);
  }
}

export async function POST(request: NextRequest) {
  let body: ProposeTransformRequest | null = null;

  try {
    body = (await request.json()) as ProposeTransformRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const importId = typeof body?.import_id === "string" ? body.import_id.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const parentThreadIdRaw = typeof body?.parent_thread_id === "string" ? body.parent_thread_id.trim() : "";
  const parentThreadId = parentThreadIdRaw || null;

  if (!importId) {
    return NextResponse.json({ ok: false, error: "import_id is required." }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt is required." }, { status: 400 });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ ok: false, error: `prompt is too long. Max length is ${MAX_PROMPT_LENGTH}.` }, { status: 400 });
  }

  if (parentThreadId && !UUID_PATTERN.test(parentThreadId)) {
    return NextResponse.json({ ok: false, error: "parent_thread_id must be a valid UUID." }, { status: 400 });
  }

  const configuredModel = process.env.CODEX_MODEL?.trim() ?? "";
  const normalizedModel = configuredModel.toLowerCase();

  if (normalizedModel === REMOVED_CODEX_MODEL) {
    return NextResponse.json(
      {
        ok: false,
        error: "codex-mini-latest is removed; use gpt-5-codex-mini or gpt-5.1-codex-mini",
      },
      { status: 400 },
    );
  }

  const model = configuredModel || DEFAULT_CODEX_MODEL;

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
    let workspaceVoteProfile = null;

    try {
      workspaceVoteProfile = await getWorkspaceVoteProfile(activeWorkspaceId);
    } catch {
      workspaceVoteProfile = null;
    }

    const voteConfig = resolveVoteProfileConfig(workspaceVoteProfile).transform_proposal;

    const { data: metricImport, error: importError } = await supabase
      .from("metric_imports")
      .select("id, workspace_id, metric_id")
      .eq("id", importId)
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();

    if (importError) {
      return NextResponse.json({ ok: false, error: importError.message }, { status: 500 });
    }

    if (!metricImport) {
      return NextResponse.json({ ok: false, error: "Import not found." }, { status: 404 });
    }

    let parentThread: ParentThreadRow | null = null;

    if (parentThreadId) {
      const { data: parentThreadData, error: parentError } = await supabase
        .from("arena_threads")
        .select("id, kind, import_id, transform_stats, transform_spec")
        .eq("id", parentThreadId)
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle();

      if (parentError) {
        return NextResponse.json({ ok: false, error: parentError.message }, { status: 500 });
      }

      if (!parentThreadData) {
        return NextResponse.json({ ok: false, error: "Parent thread not found." }, { status: 404 });
      }

      parentThread = parentThreadData as ParentThreadRow;

      if (parentThread.kind !== "transform_proposal") {
        return NextResponse.json(
          { ok: false, error: "parent_thread_id must reference a transform_proposal thread." },
          { status: 400 },
        );
      }

      if (parentThread.import_id !== importId) {
        return NextResponse.json(
          { ok: false, error: "parent_thread_id must reference a thread with the same import_id." },
          { status: 400 },
        );
      }
    }

    const { data: pointRows, error: pointsError } = await supabase
      .from("metric_points")
      .select("ts, value")
      .eq("workspace_id", activeWorkspaceId)
      .eq("import_id", importId)
      .order("ts", { ascending: true });

    if (pointsError) {
      return NextResponse.json({ ok: false, error: pointsError.message }, { status: 500 });
    }

    const series = ((pointRows as PointRow[] | null) ?? []).map((point) => ({
      ts: point.ts,
      value: point.value,
    }));

    if (series.length === 0) {
      return NextResponse.json({ ok: false, error: "Import has no points." }, { status: 400 });
    }

    const firstTsMs = parseTimestampMs(series[0].ts);
    const lastTsMs = parseTimestampMs(series[series.length - 1].ts);

    if (firstTsMs === null || lastTsMs === null) {
      return NextResponse.json({ ok: false, error: "Import points contain invalid timestamps." }, { status: 500 });
    }

    const startTs = new Date(firstTsMs).toISOString();
    const endTs = new Date(lastTsMs + 1).toISOString();

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

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const proposal = await requestProposalFromModel({
      openai,
      model,
      userPrompt: prompt,
      importId,
      parentThreadId,
      series,
    });
    const transformed = applyTransform(proposal.transformSpec, series);
    const childStats = transformed.stats;
    const baseline = applyTransform(
      {
        version: 1,
        ops: [{ op: "moving_average", window: 1 }],
      },
      series,
    );
    const statsPayload = {
      transformed: childStats,
      baseline: baseline.stats,
      diff: compareStats(baseline.stats, childStats),
    };
    let transformDiffReport: Record<string, unknown> | null = null;

    if (parentThreadId) {
      const childComparableStats = extractComparableStats(childStats);

      if (!childComparableStats) {
        transformDiffReport = {
          parent_thread_id: parentThreadId,
          error: "missing_child_stats",
        };
      } else {
        const parentComparableStats = extractComparableStats(parentThread?.transform_stats ?? null);

        if (!parentComparableStats) {
          transformDiffReport = {
            parent_thread_id: parentThreadId,
            error: "missing_parent_stats",
          };
        } else {
          transformDiffReport = {
            parent_thread_id: parentThreadId,
            parent_stats: parentComparableStats,
            child_stats: childComparableStats,
            deltas: compareStats(parentComparableStats, childComparableStats),
            ...(parentThread?.transform_spec !== null && parentThread?.transform_spec !== undefined
              ? { parent_transform_spec_present: true }
              : {}),
          };
        }
      }
    }

    const { data: insertedThread, error: insertError } = await supabase
      .from("arena_threads")
      .insert({
        workspace_id: (metricImport as ImportRow).workspace_id,
        visibility: "workspace",
        kind: "transform_proposal",
        parent_thread_id: parentThreadId,
        metric_id: (metricImport as ImportRow).metric_id,
        import_id: importId,
        start_ts: startTs,
        end_ts: endTs,
        snapshot,
        vote_prompt: voteConfig.prompt,
        vote_labels: voteConfig.labels,
      })
      .select("id")
      .single();

    if (insertError || !insertedThread) {
      return NextResponse.json(
        { ok: false, error: insertError?.message ?? "Failed to create transform proposal thread." },
        { status: 500 },
      );
    }

    const threadId = insertedThread.id;
    const { error: updateError } = await supabase
      .from("arena_threads")
      .update({
        transform_prompt: prompt,
        transform_spec: proposal.transformSpec,
        transform_sql_preview: proposal.sqlPreview,
        transform_stats: statsPayload,
        transform_diff_report: transformDiffReport,
      })
      .eq("id", threadId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    await createMessage(
      threadId,
      buildInitialMessage({
        title: proposal.title,
        explanation: proposal.explanation,
        sqlPreview: proposal.sqlPreview,
        stats: childStats,
      }),
    );

    return NextResponse.json({ thread_id: threadId });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status },
      );
    }

    return NextResponse.json({ ok: false, error: asErrorMessage(error) }, { status: 500 });
  }
}
