export const SUPABASE_ENV_ERROR_CODE = "STATRUMBLE_SUPABASE_ENV_ERROR";

export const SUPABASE_PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type SupabasePublicEnvKey = (typeof SUPABASE_PUBLIC_ENV_KEYS)[number];

export type SupabaseEnvSource = Partial<Record<SupabasePublicEnvKey, string | undefined>>;

export type SupabaseEnvCheck = {
  name: SupabasePublicEnvKey;
  status: "ok" | "missing" | "invalid";
  message: string;
  valuePreview: string | null;
};

export type SupabaseEnvStatus = {
  ok: boolean;
  checks: SupabaseEnvCheck[];
  missing: SupabasePublicEnvKey[];
  invalid: SupabasePublicEnvKey[];
  message: string;
};

export class SupabaseEnvError extends Error {
  readonly code = SUPABASE_ENV_ERROR_CODE;
  readonly diagnostics: SupabaseEnvStatus;
  readonly context: string;

  constructor(context: string, diagnostics: SupabaseEnvStatus) {
    super(diagnostics.message);
    this.name = "SupabaseEnvError";
    this.context = context;
    this.diagnostics = diagnostics;
  }
}

function joinEnvNames(names: readonly string[]) {
  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function isValidSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getValuePreview(name: SupabasePublicEnvKey, value: string) {
  if (name === "NEXT_PUBLIC_SUPABASE_URL") {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function normalizeStatus(name: SupabasePublicEnvKey, rawValue: string | undefined): SupabaseEnvCheck {
  const value = rawValue?.trim() ?? "";

  if (value.length === 0) {
    return {
      name,
      status: "missing",
      message: "Missing",
      valuePreview: null,
    };
  }

  if (name === "NEXT_PUBLIC_SUPABASE_URL" && !isValidSupabaseUrl(value)) {
    return {
      name,
      status: "invalid",
      message: "Invalid URL",
      valuePreview: value,
    };
  }

  return {
    name,
    status: "ok",
    message: "Configured",
    valuePreview: getValuePreview(name, value),
  };
}

function buildSupabaseEnvMessage(context: string, missing: readonly SupabasePublicEnvKey[], invalid: readonly SupabasePublicEnvKey[]) {
  const parts: string[] = [];

  if (missing.length > 0) {
    parts.push(`missing ${joinEnvNames(missing)}`);
  }

  if (invalid.length > 0) {
    parts.push(`invalid ${joinEnvNames(invalid)}`);
  }

  if (parts.length === 0) {
    return `${SUPABASE_ENV_ERROR_CODE}: Supabase environment is configured.`;
  }

  return [
    `${SUPABASE_ENV_ERROR_CODE}: ${context} requires a valid Supabase environment.`,
    `Detected ${parts.join("; ")}.`,
    "Set the values in statrumble/.env.local and restart the app.",
    "Open /setup for diagnostics.",
  ].join(" ");
}

export function readSupabaseEnvSource(): SupabaseEnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function getSupabaseEnvStatus(source: SupabaseEnvSource = readSupabaseEnvSource(), context = "StatRumble") {
  const checks = SUPABASE_PUBLIC_ENV_KEYS.map((name) => normalizeStatus(name, source[name]));
  const missing = checks.filter((check) => check.status === "missing").map((check) => check.name);
  const invalid = checks.filter((check) => check.status === "invalid").map((check) => check.name);
  const ok = missing.length === 0 && invalid.length === 0;

  return {
    ok,
    checks,
    missing,
    invalid,
    message: buildSupabaseEnvMessage(context, missing, invalid),
  } satisfies SupabaseEnvStatus;
}

export function requireSupabaseEnv(
  context: string,
  source: SupabaseEnvSource = readSupabaseEnvSource(),
) {
  const diagnostics = getSupabaseEnvStatus(source, context);

  if (!diagnostics.ok) {
    throw new SupabaseEnvError(context, diagnostics);
  }

  return {
    supabaseUrl: source.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    supabaseAnonKey: source.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  };
}

export function isSupabaseEnvError(error: unknown): error is SupabaseEnvError {
  if (error instanceof SupabaseEnvError) {
    return true;
  }

  return error instanceof Error && error.message.includes(SUPABASE_ENV_ERROR_CODE);
}
