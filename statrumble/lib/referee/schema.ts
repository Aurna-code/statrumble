import { z } from "zod";

export type RefereeLeading = "A" | "B" | "C" | "unclear";

export const RefereeLeadingSchema = z.enum(["A", "B", "C", "unclear"]);

export const RefereeReportSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;

  if (Object.hasOwn(record, "demo_note")) {
    return input;
  }

  return {
    ...record,
    demo_note: null,
  };
},
z
  .object({
    tldr: z.string(),
    data_facts: z.array(
      z
        .object({
          fact: z.string(),
          support: z.string(),
        })
        .strict(),
    ),
    stances: z
      .object({
        A: z.object({ steelman: z.string(), weakness: z.string() }).strict(),
        B: z.object({ steelman: z.string(), weakness: z.string() }).strict(),
        C: z.object({ steelman: z.string(), weakness: z.string() }).strict(),
      })
      .strict(),
    confounders: z.array(z.string()),
    next_checks: z.array(
      z
        .object({
          what: z.string(),
          why: z.string(),
        })
        .strict(),
    ),
    verdict: z
      .object({
        leading: RefereeLeadingSchema,
        confidence_0_100: z.number().finite().min(0).max(100),
        reason: z.string(),
      })
      .strict(),
    demo_note: z.string().nullable(),
  })
  .strict());

export type RefereeReport = z.infer<typeof RefereeReportSchema>;

type JsonSchemaObject = {
  properties: Record<string, unknown>;
  required?: readonly string[];
};

function assertStrictRequiredAllKeys(schema: JsonSchemaObject) {
  const propertyKeys = Object.keys(schema.properties);
  const requiredSet = new Set(schema.required ?? []);
  const missing = propertyKeys.filter((key) => !requiredSet.has(key));

  if (missing.length > 0) {
    throw new Error(
      `[referee schema] strict mode violation: required must include every property key. Missing: ${missing.join(", ")}`,
    );
  }
}

const PROPS = {
  tldr: { type: "string" },
  demo_note: { type: ["string", "null"] },
  data_facts: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["fact", "support"],
      properties: {
        fact: { type: "string" },
        support: { type: "string" },
      },
    },
  },
  stances: {
    type: "object",
    additionalProperties: false,
    required: ["A", "B", "C"],
    properties: {
      A: {
        type: "object",
        additionalProperties: false,
        required: ["steelman", "weakness"],
        properties: {
          steelman: { type: "string" },
          weakness: { type: "string" },
        },
      },
      B: {
        type: "object",
        additionalProperties: false,
        required: ["steelman", "weakness"],
        properties: {
          steelman: { type: "string" },
          weakness: { type: "string" },
        },
      },
      C: {
        type: "object",
        additionalProperties: false,
        required: ["steelman", "weakness"],
        properties: {
          steelman: { type: "string" },
          weakness: { type: "string" },
        },
      },
    },
  },
  confounders: {
    type: "array",
    items: { type: "string" },
  },
  next_checks: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["what", "why"],
      properties: {
        what: { type: "string" },
        why: { type: "string" },
      },
    },
  },
  verdict: {
    type: "object",
    additionalProperties: false,
    required: ["leading", "confidence_0_100", "reason"],
    properties: {
      leading: {
        type: "string",
        enum: ["A", "B", "C", "unclear"],
      },
      confidence_0_100: {
        type: "number",
        minimum: 0,
        maximum: 100,
      },
      reason: { type: "string" },
    },
  },
} as const;

export const refereeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: PROPS,
  required: Object.keys(PROPS),
} as const;

assertStrictRequiredAllKeys(refereeJsonSchema);

export function readRefereeReport(value: unknown): RefereeReport | null {
  const parsed = RefereeReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function extractRefereeSummary(report: unknown): string | null {
  const parsed = readRefereeReport(report);

  if (!parsed) {
    return null;
  }

  const summary = parsed.tldr.trim();
  return summary.length > 0 ? summary : null;
}
