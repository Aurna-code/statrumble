import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { parseCsvRows, persistCsvImportToWorkspace } from "../lib/csvImport.ts";
import { LOCAL_DEMO_USERS, ensureDemoUser, parseEnvOutput, runCommand } from "./local-demo-auth.mjs";

const APP_HOST = "127.0.0.1";
const APP_PORT = Number(process.env.README_SMOKE_PORT ?? 3010);
const BASE_URL = process.env.README_SMOKE_BASE_URL ?? `http://${APP_HOST}:${APP_PORT}`;
const WORKSPACE_NAME = "README Demo Workspace";
const METRIC_NAME = "README Demo Metric";
const METRIC_UNIT = "pts";
const SAMPLE_FILE_NAME = "sample.csv";
const DECISION_VISIBILITY_MARKER = "data-decision-visibility";
const [USER_A, USER_B] = LOCAL_DEMO_USERS;
const USER_C = {
  email: "demo-c@local.statrumble.test",
  password: "StatRumbleLocalC!2026",
  displayName: "Demo User C",
};
const IS_CI = Boolean(process.env.CI);
// README smoke only needs the local gateway, Auth, and PostgREST over Postgres.
const CI_SUPABASE_EXCLUDED_SERVICES = [
  "studio",
  "mailpit",
  "logflare",
  "vector",
  "imgproxy",
  "storage-api",
  "realtime",
  "postgres-meta",
  "edge-runtime",
  "supavisor",
];

const appDir = process.cwd();
const repoRoot = path.resolve(appDir, "..");
const sampleCsvPath = path.join(repoRoot, "docs", "sample.csv");

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function encodeSessionCookieValue(session) {
  return `base64-${Buffer.from(JSON.stringify(session), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;
}

function buildSessionCookies(supabaseUrl, session) {
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const encoded = encodeSessionCookieValue(session);
  const maxCookieValueLength = 3180;

  if (encoded.length <= maxCookieValueLength) {
    return [{ name: storageKey, value: encoded }];
  }

  const cookies = [];

  for (let index = 0; index < encoded.length; index += maxCookieValueLength) {
    cookies.push({
      name: `${storageKey}.${Math.floor(index / maxCookieValueLength)}`,
      value: encoded.slice(index, index + maxCookieValueLength),
    });
  }

  return cookies;
}

class CookieJar {
  constructor(initialCookies = []) {
    this.cookies = new Map(initialCookies.map((item) => [item.name, item.value]));
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  apply(response) {
    const setCookieHeaders =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    for (const header of setCookieHeaders) {
      const firstPart = header.split(";")[0] ?? "";
      const separatorIndex = firstPart.indexOf("=");

      if (separatorIndex < 0) {
        continue;
      }

      const name = firstPart.slice(0, separatorIndex).trim();
      const value = firstPart.slice(separatorIndex + 1).trim();

      if (!name) {
        continue;
      }

      if (!value) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }
}

function startLoggedProcess(command, args, options = {}) {
  const logFile = path.join(
    os.tmpdir(),
    `statrumble-readme-demo-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
  );
  const logStream = createWriteStream(logFile, { flags: "a" });
  const child = spawn(command, args, {
    cwd: options.cwd ?? appDir,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  return { child, logFile, logStream };
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    processHandle.child.once("exit", finish);
    processHandle.child.kill("SIGTERM");

    void delay(10_000).then(() => {
      if (settled) {
        return;
      }

      processHandle.child.kill("SIGKILL");
    });
  });

  await new Promise((resolve) => {
    processHandle.logStream.end(resolve);
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "Timed out waiting for server.";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });

      if (response.status >= 200 && response.status < 500) {
        return;
      }

      lastError = `Unexpected status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(1_000);
  }

  fail(lastError);
}

function getSupabaseStartArgs() {
  const args = ["exec", "supabase", "start"];

  if (!IS_CI) {
    return args;
  }

  args.push("--debug");

  for (const service of CI_SUPABASE_EXCLUDED_SERVICES) {
    args.push("-x", service);
  }

  return args;
}

async function startLocalSupabase() {
  const attempts = IS_CI ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (IS_CI) {
        console.log(
          `CI smoke: supabase start attempt ${attempt}/${attempts} excluding ${CI_SUPABASE_EXCLUDED_SERVICES.join(", ")}`,
        );
      }

      await runCommand("pnpm", getSupabaseStartArgs(), {
        cwd: appDir,
        streamOutput: IS_CI,
      });
      return;
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }

      console.error(error instanceof Error ? error.message : String(error));
      console.error("CI smoke: supabase start failed once; retrying after cleanup.");

      await runCommand("pnpm", ["exec", "supabase", "stop"], {
        cwd: appDir,
        allowFailure: true,
        streamOutput: true,
      });
      await delay(2_000);
    }
  }
}

async function request(baseUrl, jar, pathName, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (jar) {
    const cookieHeader = jar.header();

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }
  }

  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
    redirect: "manual",
  });

  if (jar) {
    jar.apply(response);
  }

  return response;
}

async function requestJson(baseUrl, jar, method, pathName, body) {
  const response = await request(baseUrl, jar, pathName, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;

  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      fail(`Expected JSON from ${method} ${pathName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    response,
    payload,
  };
}

async function requestText(baseUrl, jar, pathName) {
  const response = await request(baseUrl, jar, pathName);
  const text = await response.text();

  return {
    response,
    text,
  };
}

function htmlPreview(text, maxLength = 320) {
  const normalized = text.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function assertPageContainsMarker(page, marker, message) {
  if (page.text.includes(marker)) {
    return;
  }

  fail(
    `${message}\nstatus=${page.response.status}\nurl=${page.response.url}\nexpected=${marker}\nhtml_preview=${htmlPreview(page.text)}`,
  );
}

function assertPageOmitsText(page, unexpected, message) {
  if (!page.text.includes(unexpected)) {
    return;
  }

  fail(
    `${message}\nstatus=${page.response.status}\nurl=${page.response.url}\nunexpected=${unexpected}\nhtml_preview=${htmlPreview(page.text)}`,
  );
}

async function signInUser(supabaseUrl, anonKey, user) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    fail(`Failed to sign in ${user.email}: ${error?.message ?? "Missing session."}`);
  }

  return data.session;
}

async function createUserScopedClient(supabaseUrl, anonKey, session) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    fail(`Failed to prime user-scoped Supabase client: ${error.message}`);
  }

  return client;
}

function createThreadWindow(points) {
  assert(points.length >= 60, "sample.csv should provide enough points for range selection");

  const startIndex = 20;
  const endExclusiveIndex = 46;
  const startTs = points[startIndex]?.ts;
  const endTs = points[endExclusiveIndex]?.ts;

  assert.equal(typeof startTs, "string", "thread start timestamp should exist");
  assert.equal(typeof endTs, "string", "thread end timestamp should exist");

  return {
    startTs,
    endTs,
  };
}

async function main() {
  let nextProcess = null;
  let supabaseStarted = false;

  try {
    await startLocalSupabase();
    supabaseStarted = true;
    pass("Local Supabase started.");

    await runCommand("pnpm", ["exec", "supabase", "db", "reset", "--yes"], {
      cwd: appDir,
    });
    pass("Local Supabase reset.");

    const status = await runCommand("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      cwd: appDir,
    });
    const localEnv = parseEnvOutput(status.stdout);
    const supabaseUrl = localEnv.API_URL ?? localEnv.SUPABASE_URL;
    const anonKey = localEnv.ANON_KEY ?? localEnv.SUPABASE_ANON_KEY;
    const serviceRoleKey = localEnv.SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;

    assert(supabaseUrl, "Supabase status output must include API_URL.");
    assert(anonKey, "Supabase status output must include ANON_KEY.");
    assert(serviceRoleKey, "Supabase status output must include SERVICE_ROLE_KEY.");

    nextProcess = startLoggedProcess(
      "pnpm",
      ["exec", "next", "dev", "--hostname", APP_HOST, "--port", `${APP_PORT}`],
      {
        cwd: appDir,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
          OPENAI_API_KEY: "",
          DEMO_MODE: "1",
          NEXT_PUBLIC_DEMO_MODE: "1",
          NEXT_PUBLIC_DEV_PASSWORD_LOGIN: "1",
        },
      },
    );
    await waitForServer(`${BASE_URL}/login`);
    pass(`Next app responded at ${BASE_URL}.`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    await ensureDemoUser(adminClient, USER_A);
    await ensureDemoUser(adminClient, USER_B);
    await ensureDemoUser(adminClient, USER_C);
    pass("Deterministic demo users are ready.");

    const sessionA = await signInUser(supabaseUrl, anonKey, USER_A);
    const sessionB = await signInUser(supabaseUrl, anonKey, USER_B);
    const sessionC = await signInUser(supabaseUrl, anonKey, USER_C);
    const jarA = new CookieJar(buildSessionCookies(supabaseUrl, sessionA));
    const jarB = new CookieJar(buildSessionCookies(supabaseUrl, sessionB));
    const jarC = new CookieJar(buildSessionCookies(supabaseUrl, sessionC));

    const createWorkspace = await requestJson(BASE_URL, jarA, "POST", "/api/workspaces/create", {
      name: WORKSPACE_NAME,
    });
    assert.equal(createWorkspace.response.status, 200, "User A should create a workspace");
    assert.equal(createWorkspace.payload?.ok, true, "User A workspace create payload should be ok");
    assert.equal(typeof createWorkspace.payload?.workspace_id, "string", "workspace_id should exist");
    assert.equal(typeof createWorkspace.payload?.invite_code, "string", "invite_code should exist");
    pass("User A created a workspace.");

    const workspaceId = createWorkspace.payload.workspace_id;
    const inviteCode = createWorkspace.payload.invite_code;

    const joinWorkspace = await requestJson(BASE_URL, jarB, "POST", "/api/workspaces/join", {
      code: inviteCode,
    });
    assert.equal(joinWorkspace.response.status, 200, "User B should join by invite code");
    assert.equal(joinWorkspace.payload?.ok, true, "User B join payload should be ok");
    assert.equal(joinWorkspace.payload?.workspace_id, workspaceId, "User B should join User A workspace");
    pass("User B joined by invite code.");

    const createWorkspaceC = await requestJson(BASE_URL, jarC, "POST", "/api/workspaces/create", {
      name: "User C Workspace",
    });
    assert.equal(createWorkspaceC.response.status, 200, "User C should create an isolated workspace");
    assert.equal(createWorkspaceC.payload?.ok, true, "User C workspace create payload should be ok");
    pass("User C has an unrelated active workspace.");

    const csvText = await readFile(sampleCsvPath, "utf8");
    const parsedCsv = parseCsvRows(csvText);
    assert.equal(parsedCsv.error, null, "sample.csv should parse");
    const userAClient = await createUserScopedClient(supabaseUrl, anonKey, sessionA);
    const importedCsv = await persistCsvImportToWorkspace({
      supabase: userAClient,
      workspaceId,
      metricName: METRIC_NAME,
      unit: METRIC_UNIT,
      fileName: SAMPLE_FILE_NAME,
      rows: parsedCsv.rows,
    });
    assert(importedCsv.rowCount > 0, "CSV import should insert rows");
    pass("CSV import completed via shared upload parser and persistence path.");

    const arenaHome = await requestText(BASE_URL, jarA, "/");
    assert.equal(arenaHome.response.status, 200, "Arena page should render for User A");
    assert(arenaHome.text.includes(METRIC_NAME), "Arena page should mention the imported metric");
    assert(arenaHome.text.includes(SAMPLE_FILE_NAME), "Arena page should mention the imported file");
    pass("Arena page renders the imported metric and file.");

    const pointsResponse = await requestJson(
      BASE_URL,
      jarA,
      "GET",
      `/api/imports/${importedCsv.importId}/points`,
    );
    assert.equal(pointsResponse.response.status, 200, "Import points should load");
    assert.equal(pointsResponse.payload?.ok, true, "Import points payload should be ok");
    assert(Array.isArray(pointsResponse.payload?.points), "Import points payload should include points");

    const windowSelection = createThreadWindow(pointsResponse.payload.points);
    const createThread = await requestJson(BASE_URL, jarA, "POST", "/api/threads/create", {
      import_id: importedCsv.importId,
      start_ts: windowSelection.startTs,
      end_ts: windowSelection.endTs,
    });
    assert.equal(createThread.response.status, 200, "Thread creation should succeed");
    assert.equal(createThread.payload?.ok, true, "Thread creation payload should be ok");
    assert.equal(typeof createThread.payload?.thread_id, "string", "thread_id should exist");
    const threadId = createThread.payload.thread_id;
    pass("Chart segment produced a discussion thread.");

    const createWorkspaceB2 = await requestJson(BASE_URL, jarB, "POST", "/api/workspaces/create", {
      name: "User B Secondary Workspace",
    });
    assert.equal(createWorkspaceB2.response.status, 200, "User B should create a secondary workspace");
    assert.equal(createWorkspaceB2.payload?.ok, true, "User B secondary workspace payload should be ok");

    const threadPageBWithWrongWorkspace = await requestText(BASE_URL, jarB, `/threads/${threadId}`);
    assert.equal(
      threadPageBWithWrongWorkspace.response.status,
      200,
      "Thread page should render even when another workspace is active",
    );
    assert(
      threadPageBWithWrongWorkspace.text.includes("Workspace context mismatch"),
      "Thread page should explain that the active workspace is being corrected",
    );
    pass("Valid thread links render while another workspace is active.");

    const createWorkspaceA2 = await requestJson(BASE_URL, jarA, "POST", "/api/workspaces/create", {
      name: "User A Secondary Workspace",
    });
    assert.equal(createWorkspaceA2.response.status, 200, "User A should create a secondary workspace");
    assert.equal(createWorkspaceA2.payload?.ok, true, "User A secondary workspace payload should be ok");

    const retitleThread = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/title`, {
      title: "README Demo Thread",
    });
    assert.equal(retitleThread.response.status, 200, "Thread title update should succeed across workspace context mismatch");
    assert.equal(retitleThread.payload?.ok, true, "Thread title payload should be ok");
    pass("Thread title updates scope to the thread workspace.");

    const promoteBeforeJudge = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/promote`);
    assert.equal(promoteBeforeJudge.response.status, 400, "Promote should be blocked before judge");
    assert.equal(
      promoteBeforeJudge.payload?.error,
      "Run Judge before promoting this thread.",
      "Promote should explain that judge is required first",
    );
    const decisionCardsBeforeJudge = await adminClient
      .from("decision_cards")
      .select("id")
      .eq("thread_id", threadId)
      .eq("workspace_id", workspaceId);
    assert.equal(decisionCardsBeforeJudge.error, null, "Decision lookup before judge should succeed");
    assert.equal(
      decisionCardsBeforeJudge.data?.length ?? 0,
      0,
      "Promote before judge should not create a decision card",
    );
    pass("Promote is blocked before judge and no decision is created.");

    const threadPageA = await requestText(BASE_URL, jarA, `/threads/${threadId}`);
    assert.equal(threadPageA.response.status, 200, "Thread page should render for User A");
    assert(threadPageA.text.includes("Snapshot Summary"), "Thread page should render snapshot summary");
    pass("Thread page remains reachable for User A after workspace drift.");

    const messageA = "User A: segment looks meaningfully elevated.";
    const messageB = "User B: watch the outlier and baseline window.";

    const postMessageA = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/messages`, {
      content: messageA,
    });
    assert.equal(postMessageA.response.status, 200, "User A message should succeed");
    const postMessageB = await requestJson(BASE_URL, jarB, "POST", `/api/threads/${threadId}/messages`, {
      content: messageB,
    });
    assert.equal(postMessageB.response.status, 200, "User B message should succeed");
    pass("Both users posted comments.");

    const voteA = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/votes`, {
      stance: "A",
    });
    assert.equal(voteA.response.status, 200, "User A vote should succeed");
    const voteB = await requestJson(BASE_URL, jarB, "POST", `/api/threads/${threadId}/votes`, {
      stance: "B",
    });
    assert.equal(voteB.response.status, 200, "User B vote should succeed");
    pass("Both users voted.");

    const refreshedThread = await requestJson(BASE_URL, jarA, "GET", `/api/threads/${threadId}/refresh`);
    assert.equal(refreshedThread.response.status, 200, "Thread refresh should succeed");
    assert.equal(refreshedThread.payload?.ok, true, "Thread refresh payload should be ok");
    assert.equal(refreshedThread.payload?.counts?.A, 1, "Vote count A should be 1");
    assert.equal(refreshedThread.payload?.counts?.B, 1, "Vote count B should be 1");
    assert.equal(refreshedThread.payload?.counts?.C, 0, "Vote count C should be 0");
    assert(
      refreshedThread.payload?.messages?.some((message) => message.content === messageA),
      "Thread refresh should include User A message",
    );
    assert(
      refreshedThread.payload?.messages?.some((message) => message.content === messageB),
      "Thread refresh should include User B message",
    );
    pass("Thread refresh shows both comments and both votes.");

    const judgeThread = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/judge`);
    assert.equal(judgeThread.response.status, 200, "Judge route should succeed in demo mode");
    assert.equal(judgeThread.payload?.ok, true, "Judge payload should be ok");
    assert.equal(typeof judgeThread.payload?.report?.tldr, "string", "Judge payload should include tldr");
    assert.equal(
      typeof judgeThread.payload?.report?.demo_note,
      "string",
      "Judge payload should include demo note in demo mode",
    );
    pass("Judge/referee ran in demo mode.");

    const promoteDecision = await requestJson(BASE_URL, jarA, "POST", `/api/threads/${threadId}/promote`);
    assert.equal(promoteDecision.response.status, 200, "Promote route should succeed across workspace context mismatch");
    assert.equal(promoteDecision.payload?.ok, true, "Promote payload should be ok");
    assert.equal(typeof promoteDecision.payload?.decisionId, "string", "Promote payload should include decisionId");
    const decisionId = promoteDecision.payload.decisionId;
    pass("Thread promoted to a decision even when another workspace is active.");

    const decisionRowBeforePublish = await adminClient
      .from("decision_cards")
      .select("is_public, public_id")
      .eq("id", decisionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    assert.equal(decisionRowBeforePublish.error, null, "Pre-publish decision lookup should succeed");
    assert.equal(decisionRowBeforePublish.data?.is_public, false, "Decision should remain private before publish");
    assert.equal(decisionRowBeforePublish.data?.public_id ?? null, null, "Decision should not have a public id before publish");

    const decisionPageBeforePublish = await requestText(BASE_URL, jarB, `/decisions/${decisionId}`);
    assert.equal(decisionPageBeforePublish.response.status, 200, "Decision page should render before publish");
    assertPageContainsMarker(
      decisionPageBeforePublish,
      `${DECISION_VISIBILITY_MARKER}="private"`,
      "Decision page should expose a private visibility marker before publish",
    );
    assertPageContainsMarker(
      decisionPageBeforePublish,
      "Workspace context mismatch",
      "Decision page should explain the workspace correction when another workspace is active",
    );
    assertPageOmitsText(
      decisionPageBeforePublish,
      "Public Portal",
      "Decision page should not show owner-only publish controls to non-owners from another active workspace",
    );

    const unauthorizedThreadPage = await requestText(BASE_URL, jarC, `/threads/${threadId}`);
    assert.equal(
      unauthorizedThreadPage.response.status,
      404,
      "Users outside the thread workspace should not load the thread page",
    );
    const unauthorizedPromote = await requestJson(BASE_URL, jarC, "POST", `/api/threads/${threadId}/promote`);
    assert.equal(
      unauthorizedPromote.response.status,
      404,
      "Users outside the thread workspace should not promote its thread",
    );
    pass("Unauthorized cross-workspace access still fails.");

    const publishDecision = await requestJson(BASE_URL, jarA, "POST", `/api/decisions/${decisionId}/publish`, {
      public: true,
    });
    assert.equal(publishDecision.response.status, 200, "Publish route should succeed");
    assert.equal(publishDecision.payload?.ok, true, "Publish payload should be ok");
    assert.equal(typeof publishDecision.payload?.publicId, "string", "Publish payload should include publicId");
    assert.equal(publishDecision.payload?.isPublic, true, "Decision should be public after publish");
    assert.equal(typeof publishDecision.payload?.publicUrl, "string", "Publish payload should include publicUrl");
    pass("Decision published.");

    const decisionPageAfterPublish = await requestText(BASE_URL, jarA, `/decisions/${decisionId}`);
    assert.equal(decisionPageAfterPublish.response.status, 200, "Decision page should render after publish");
    assertPageContainsMarker(
      decisionPageAfterPublish,
      `${DECISION_VISIBILITY_MARKER}="public"`,
      "Decision page should expose a public visibility marker after publish",
    );

    const unauthorizedPublishedDecisionPage = await requestText(BASE_URL, jarC, `/decisions/${decisionId}`);
    assert.equal(
      unauthorizedPublishedDecisionPage.response.status,
      404,
      "Published decisions should still stay private on the authenticated decision route for non-members",
    );

    const publicDecisionPage = await requestText(BASE_URL, null, publishDecision.payload.publicUrl);
    assert.equal(publicDecisionPage.response.status, 200, "Public decision page should render anonymously");
    assert(publicDecisionPage.text.includes("Public Decision"), "Public decision page should show heading");
    assert(publicDecisionPage.text.includes(METRIC_NAME), "Public decision page should show the metric title");
    assert(
      publicDecisionPage.text.includes(judgeThread.payload.report.tldr),
      "Public decision page should render the referee summary",
    );
    pass("Public decision page renders.");

    console.log("\nREADME demo smoke suite passed.");
  } catch (error) {
    if (nextProcess?.logFile) {
      console.error(`Next log: ${nextProcess.logFile}`);
    }

    throw error;
  } finally {
    await stopProcess(nextProcess);

    if (supabaseStarted) {
      await runCommand("pnpm", ["exec", "supabase", "stop"], {
        cwd: appDir,
        allowFailure: true,
      });
    }
  }
}

await main();
