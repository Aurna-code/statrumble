export type RefereeLeading = "A" | "B" | "C" | "unclear";

export type RefereeReport = {
  tldr: string;
  data_facts: Array<{
    fact: string;
    support: string;
  }>;
  stances: {
    A: { steelman: string; weakness: string };
    B: { steelman: string; weakness: string };
    C: { steelman: string; weakness: string };
  };
  confounders: string[];
  next_checks: Array<{
    what: string;
    why: string;
  }>;
  verdict: {
    leading: RefereeLeading;
    confidence_0_100: number;
    reason: string;
  };
  demo_note?: string;
};

export const refereeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tldr", "data_facts", "stances", "confounders", "next_checks", "verdict"],
  properties: {
    tldr: { type: "string" },
    demo_note: { type: "string" },
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
  },
} as const;
