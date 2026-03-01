export type VoteProfileKind = "discussion" | "transform_proposal";

export type VoteLabels = {
  A: string;
  B: string;
  C: string;
};

export type VoteProfile = {
  prompt: string;
  labels: VoteLabels;
};

const DEFAULT_DISCUSSION_PROFILE: VoteProfile = {
  prompt: "Is the change in the selected range meaningful?",
  labels: {
    A: "Yes",
    B: "No",
    C: "Unclear",
  },
};

const DEFAULT_TRANSFORM_PROPOSAL_PROFILE: VoteProfile = {
  prompt: "Should we accept this transform proposal?",
  labels: {
    A: "Accept",
    B: "Reject",
    C: "Revise",
  },
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

export function parseVoteLabels(value: unknown): VoteLabels | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const labelA = asNonEmptyString(record.A);
  const labelB = asNonEmptyString(record.B);
  const labelC = asNonEmptyString(record.C);

  if (!labelA || !labelB || !labelC) {
    return null;
  }

  return {
    A: labelA,
    B: labelB,
    C: labelC,
  };
}

function parseVoteProfile(value: unknown): VoteProfile | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const prompt = asNonEmptyString(record.prompt);
  const labels = parseVoteLabels(record.labels);

  if (!prompt || !labels) {
    return null;
  }

  return { prompt, labels };
}

function parseLegacyVoteProfile(root: Record<string, unknown>, kind: VoteProfileKind): VoteProfile | null {
  const promptKey = kind === "discussion" ? "discussion_prompt" : "transform_proposal_prompt";
  const labelsKey = kind === "discussion" ? "discussion_labels" : "transform_proposal_labels";

  const prompt = asNonEmptyString(root[promptKey]);
  const labels = parseVoteLabels(root[labelsKey]);

  if (!prompt || !labels) {
    return null;
  }

  return { prompt, labels };
}

export function getDefaultVoteProfile(kind: VoteProfileKind): VoteProfile {
  if (kind === "transform_proposal") {
    return {
      prompt: DEFAULT_TRANSFORM_PROPOSAL_PROFILE.prompt,
      labels: { ...DEFAULT_TRANSFORM_PROPOSAL_PROFILE.labels },
    };
  }

  return {
    prompt: DEFAULT_DISCUSSION_PROFILE.prompt,
    labels: { ...DEFAULT_DISCUSSION_PROFILE.labels },
  };
}

export function isVoteProfile(value: unknown): value is VoteProfile {
  return parseVoteProfile(value) !== null;
}

export function resolveVoteProfileFromConfig(config: unknown, kind: VoteProfileKind): VoteProfile | null {
  const root = asRecord(config);

  if (!root) {
    return null;
  }

  const profiles = asRecord(root.profiles);
  const threadProfiles = asRecord(root.thread_profiles);
  const voteProfiles = asRecord(root.vote_profiles);

  const candidates: unknown[] = [
    root[kind],
    profiles?.[kind],
    threadProfiles?.[kind],
    voteProfiles?.[kind],
    parseLegacyVoteProfile(root, kind),
    root,
  ];

  for (const candidate of candidates) {
    const parsed = parseVoteProfile(candidate);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function coerceVoteProfileFromThreadFields(args: {
  prompt: unknown;
  labels: unknown;
  kind: VoteProfileKind;
}): VoteProfile {
  const prompt = asNonEmptyString(args.prompt);
  const labels = parseVoteLabels(args.labels);

  if (prompt && labels) {
    return { prompt, labels };
  }

  return getDefaultVoteProfile(args.kind);
}
