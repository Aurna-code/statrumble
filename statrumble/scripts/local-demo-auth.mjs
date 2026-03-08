import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const LOCAL_DEMO_USERS = [
  {
    label: "User A",
    email: "demo-a@local.statrumble.test",
    password: "StatRumbleLocalA!2026",
    displayName: "Demo User A",
  },
  {
    label: "User B",
    email: "demo-b@local.statrumble.test",
    password: "StatRumbleLocalB!2026",
    displayName: "Demo User B",
  },
];

function createStatelessClient(supabaseUrl, key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function fail(message) {
  throw new Error(message);
}

export function parseEnvOutput(output) {
  const env = {};

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;

      if (options.streamOutput) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;

      if (options.streamOutput) {
        process.stderr.write(text);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code: code ?? 0, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        ),
      );
    });
  });
}

function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function isDockerUnavailable(message) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("cannot connect to the docker daemon") ||
    normalized.includes("docker daemon") ||
    normalized.includes("docker desktop") ||
    normalized.includes("permission denied while trying to connect to the docker daemon socket")
  );
}

function isSupabaseCliUnavailable(message) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("command \"supabase\" not found") ||
    normalized.includes("spawn pnpm enoent") ||
    normalized.includes("err_pnpm_recursive_exec_first_fail")
  );
}

export async function requireLocalSupabaseStatus(appDir) {
  const versionCheck = await runCommand("pnpm", ["exec", "supabase", "--version"], {
    cwd: appDir,
    allowFailure: true,
  });

  if (versionCheck.code !== 0) {
    fail("Supabase CLI is unavailable. Run `pnpm install` from the repo root, then retry.");
  }

  const status = await runCommand("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    cwd: appDir,
    allowFailure: true,
  });

  if (status.code !== 0) {
    const combinedOutput = `${status.stdout}\n${status.stderr}`;

    if (isDockerUnavailable(combinedOutput)) {
      fail("Docker is required for local Supabase. Start Docker, then run `pnpm -C statrumble exec supabase start`.");
    }

    if (isSupabaseCliUnavailable(combinedOutput)) {
      fail("Supabase CLI is unavailable. Run `pnpm install` from the repo root, then retry.");
    }

    fail(
      "Local Supabase is not running. Run `pnpm -C statrumble exec supabase start` and `pnpm -C statrumble exec supabase db reset`, then retry.",
    );
  }

  const env = parseEnvOutput(status.stdout);
  const supabaseUrl = env.API_URL ?? env.SUPABASE_URL;
  const anonKey = env.ANON_KEY ?? env.SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    fail("`supabase status` did not return the local API URL and auth keys. Re-run `pnpm -C statrumble exec supabase start`.");
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    fail(`Refusing to seed demo users against a non-local Supabase URL: ${supabaseUrl}`);
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  };
}

export function createAdminClient(localSupabase) {
  return createStatelessClient(localSupabase.supabaseUrl, localSupabase.serviceRoleKey);
}

export async function ensureDemoUser(adminClient, user) {
  const payload = {
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      display_name: user.displayName,
    },
  };

  const { data, error } = await adminClient.auth.admin.createUser(payload);

  if (!error && data.user) {
    return data.user;
  }

  if (!error?.message?.toLowerCase().includes("already")) {
    fail(`Failed to create ${user.email}: ${error?.message ?? "Unknown error"}`);
  }

  const { data: listedUsers, error: listError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    fail(`Failed to list existing auth users: ${listError.message}`);
  }

  const existingUser = listedUsers.users.find((candidate) => candidate.email === user.email);

  if (!existingUser) {
    fail(`User ${user.email} already exists but could not be loaded for update.`);
  }

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
    existingUser.id,
    payload,
  );

  if (updateError || !updatedUser.user) {
    fail(`Failed to refresh ${user.email}: ${updateError?.message ?? "Unknown error"}`);
  }

  return updatedUser.user;
}

export async function ensureDeterministicDemoUsers(adminClient, users = LOCAL_DEMO_USERS) {
  const ensuredUsers = [];

  for (const user of users) {
    ensuredUsers.push(await ensureDemoUser(adminClient, user));
  }

  return ensuredUsers;
}

export async function signInWithDemoPassword(localSupabase, user) {
  const client = createStatelessClient(localSupabase.supabaseUrl, localSupabase.anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    fail(`Password sign-in failed for ${user.email}: ${error?.message ?? "Missing session."}`);
  }

  return data.session;
}
