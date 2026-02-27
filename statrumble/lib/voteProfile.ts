export type VoteStance = "A" | "B" | "C";

export type VoteLabels = {
  A: string;
  B: string;
  C: string;
};

export type VoteProfileKind = "discussion" | "transform_proposal";

export type VoteProfileConfig = Record<VoteProfileKind, { prompt: string; labels: VoteLabels }>;

const VOTE_PROFILE_KINDS: VoteProfileKind[] = ["discussion", "transform_proposal"];

export const DEFAULT_VOTE_PROFILE_CONFIG: VoteProfileConfig = {
  discussion: {
    prompt: "Is the change in the selected range meaningful?",
    labels: {
      A: "Yes",
      B: "No",
      C: "Unclear",
    },
  },
  transform_proposal: {
    prompt: "Should we accept this transform proposal?",
    labels: {
      A: "Accept",
      B: "Reject",
      C: "Revise",
    },
  },
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseVoteLabels(value: unknown): VoteLabels | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const labelsRecord = value as Record<string, unknown>;
  const labelA = asNonEmptyString(labelsRecord.A);
  const labelB = asNonEmptyString(labelsRecord.B);
  const labelC = asNonEmptyString(labelsRecord.C);

  if (!labelA || !labelB || !labelC) {
    return null;
  }

  return {
    A: labelA,
    B: labelB,
    C: labelC,
  };
}

export function cloneVoteProfileConfig(config: VoteProfileConfig): VoteProfileConfig {
  return {
    discussion: {
      prompt: config.discussion.prompt,
      labels: {
        A: config.discussion.labels.A,
        B: config.discussion.labels.B,
        C: config.discussion.labels.C,
      },
    },
    transform_proposal: {
      prompt: config.transform_proposal.prompt,
      labels: {
        A: config.transform_proposal.labels.A,
        B: config.transform_proposal.labels.B,
        C: config.transform_proposal.labels.C,
      },
    },
  };
}

export function parseVoteProfileConfig(value: unknown): VoteProfileConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const root = value as Record<string, unknown>;
  const normalized = {} as VoteProfileConfig;

  for (const kind of VOTE_PROFILE_KINDS) {
    const section = root[kind];

    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return null;
    }

    const sectionRecord = section as Record<string, unknown>;
    const prompt = asNonEmptyString(sectionRecord.prompt);
    const labels = parseVoteLabels(sectionRecord.labels);

    if (!prompt || !labels) {
      return null;
    }

    normalized[kind] = {
      prompt,
      labels,
    };
  }

  return normalized;
}

export function assertVoteProfileConfig(value: unknown): VoteProfileConfig {
  const parsed = parseVoteProfileConfig(value);

  if (!parsed) {
    throw new Error("Invalid vote profile config.");
  }

  return parsed;
}

export function resolveVoteProfileConfig(value: unknown): VoteProfileConfig {
  const parsed = parseVoteProfileConfig(value);
  return cloneVoteProfileConfig(parsed ?? DEFAULT_VOTE_PROFILE_CONFIG);
}

export function resolveThreadVoteConfig(
  threadPrompt: unknown,
  threadLabels: unknown,
  workspaceConfig: { prompt: string; labels: VoteLabels },
): { prompt: string; labels: VoteLabels; source: "thread" | "workspace" } {
  const parsedThreadPrompt = asNonEmptyString(threadPrompt);
  const parsedThreadLabels = parseVoteLabels(threadLabels);

  if (parsedThreadPrompt && parsedThreadLabels) {
    return {
      prompt: parsedThreadPrompt,
      labels: parsedThreadLabels,
      source: "thread",
    };
  }

  return {
    prompt: workspaceConfig.prompt,
    labels: {
      A: workspaceConfig.labels.A,
      B: workspaceConfig.labels.B,
      C: workspaceConfig.labels.C,
    },
    source: "workspace",
  };
}
