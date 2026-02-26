#!/usr/bin/env bash

set -euo pipefail

# StatRumble demo smoke test (API-level).
#
# Usage:
#   SUPABASE_URL="<supabase_url>" \
#   SUPABASE_ANON_KEY="<anon_key>" \
#   TEST_EMAIL="<user_email>" \
#   TEST_PASSWORD="<user_password>" \
#   IMPORT_ID="<metric_import_uuid>" \
#   BASE_URL="http://localhost:3000" \
#   bash scripts/demo-smoke.sh
#
# Optional:
#   COOKIE="sb-<project>-auth-token=..."
#   PARENT_THREAD_ID="<existing_transform_proposal_thread_uuid>"
#   SMOKE_API_ONLY=1
#
# Notes:
# - Full mode (default): requires SUPABASE_SERVICE_ROLE_KEY and runs membership seeding + DB assertions.
# - API-only mode (SMOKE_API_ONLY=1): does not require service role and skips DB assertions + membership seeding.
# - If COOKIE is empty, script logs in with password grant and generates app cookie.

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE="${COOKIE:-}"
IMPORT_ID="${IMPORT_ID:-}"
PARENT_THREAD_ID="${PARENT_THREAD_ID:-}"
SMOKE_API_ONLY="${SMOKE_API_ONLY:-0}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
TEST_EMAIL="${TEST_EMAIL:-}"
TEST_PASSWORD="${TEST_PASSWORD:-}"
ACCESS_TOKEN=""
REFRESH_TOKEN=""
TEST_USER_ID=""
WORKSPACE_ID=""

ROOT_PROMPT="Smoke test root proposal ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
FORK_PROMPT="Smoke test fork proposal ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
NEGATIVE_PROMPT="Smoke test invalid parent proposal ($(date -u +%Y-%m-%dT%H:%M:%SZ))"

RESP_STATUS=""
RESP_BODY=""
API_ONLY_MODE=0
NEEDS_PASSWORD_LOGIN=1

mask_sensitive() {
  local input="${1:-}"
  if [[ -z "$input" ]]; then
    echo ""
    return 0
  fi

  INPUT="$input" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}" \
  ACCESS_TOKEN="${ACCESS_TOKEN:-}" \
  REFRESH_TOKEN="${REFRESH_TOKEN:-}" \
  COOKIE_VALUE="${COOKIE:-}" \
  node -e '
    const replacements = [
      [process.env.SUPABASE_SERVICE_ROLE_KEY, "[REDACTED_SERVICE_ROLE_KEY]"],
      [process.env.SUPABASE_ANON_KEY, "[REDACTED_ANON_KEY]"],
      [process.env.ACCESS_TOKEN, "[REDACTED_ACCESS_TOKEN]"],
      [process.env.REFRESH_TOKEN, "[REDACTED_REFRESH_TOKEN]"],
      [process.env.COOKIE_VALUE, "[REDACTED_COOKIE]"],
    ];

    let text = process.env.INPUT ?? "";
    for (const [needle, replacement] of replacements) {
      if (needle) text = text.split(needle).join(replacement);
    }

    text = text.replace(/([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{20,})/g, "[REDACTED_JWT]");
    text = text.replace(/("?(?:access_token|refresh_token)"?\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3");
    text = text.replace(/("?(?:apikey|authorization)"?\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3");

    process.stdout.write(text);
  '
}

fail() {
  echo "FAIL: $(mask_sensitive "$1")" >&2
  exit 1
}

pass() {
  echo "PASS: $1"
}

require_env() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    fail "$key is required."
  fi
}

is_truthy() {
  local value="${1:-}"
  local normalized="${value,,}"
  [[ "$normalized" == "1" || "$normalized" == "true" || "$normalized" == "yes" || "$normalized" == "y" ]]
}

derive_supabase_project_ref() {
  local url="$1"
  local host
  host="$(echo "$url" | sed -E 's|^https?://||; s|/.*$||')"
  if [[ -z "$host" ]]; then
    return 1
  fi
  echo "${host%%.*}"
}

decode_jwt_sub() {
  local token="$1"
  node -e '
    const token = process.argv[1] ?? "";
    const parts = token.split(".");
    if (parts.length < 2) {
      console.error("JWT payload missing.");
      process.exit(1);
    }

    const payloadPart = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadPart + pad, "base64").toString("utf8"));
    } catch (error) {
      console.error("JWT payload decode failed.");
      process.exit(1);
    }

    if (typeof payload?.sub !== "string" || payload.sub.length === 0) {
      console.error("JWT sub missing.");
      process.exit(1);
    }

    process.stdout.write(payload.sub);
  ' "$token"
}

supabase_rest_get() {
  local path="$1"
  local use_service_role="${2:-1}"
  local api_key="$SUPABASE_SERVICE_ROLE_KEY"
  local auth_header="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

  if [[ "$use_service_role" != "1" ]]; then
    api_key="$SUPABASE_ANON_KEY"
    auth_header="Authorization: Bearer $SUPABASE_ANON_KEY"
  fi

  local body_file
  body_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$body_file" -w "%{http_code}" \
      -H "apikey: $api_key" \
      -H "$auth_header" \
      -H "Accept: application/json" \
      "${SUPABASE_URL%/}${path}"
  )"
  local body
  body="$(cat "$body_file")"
  rm -f "$body_file"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    fail "Supabase GET ${path} failed (HTTP $status): $body"
  fi

  echo "$body"
}

supabase_rest_post() {
  local path="$1"
  local body="$2"
  local use_service_role="${3:-1}"
  local api_key="$SUPABASE_SERVICE_ROLE_KEY"
  local auth_header="Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

  if [[ "$use_service_role" != "1" ]]; then
    api_key="$SUPABASE_ANON_KEY"
    auth_header="Authorization: Bearer $SUPABASE_ANON_KEY"
  fi

  local body_file
  body_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$body_file" -w "%{http_code}" \
      -X POST \
      -H "apikey: $api_key" \
      -H "$auth_header" \
      -H "Accept: application/json" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates,return=representation" \
      --data "$body" \
      "${SUPABASE_URL%/}${path}"
  )"
  local response
  response="$(cat "$body_file")"
  rm -f "$body_file"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    fail "Supabase POST ${path} failed (HTTP $status): $response"
  fi

  echo "$response"
}

api_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local body_file
  body_file="$(mktemp)"

  local status
  if [[ -n "$body" ]]; then
    status="$(
      curl -sS -o "$body_file" -w "%{http_code}" \
        -X "$method" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        --data "$body" \
        "${BASE_URL}${path}"
    )"
  else
    status="$(
      curl -sS -o "$body_file" -w "%{http_code}" \
        -X "$method" \
        -b "$COOKIE" \
        "${BASE_URL}${path}"
    )"
  fi

  RESP_STATUS="$status"
  RESP_BODY="$(cat "$body_file")"
  rm -f "$body_file"
}

extract_thread_id() {
  local json="$1"

  node -e '
    const input = process.argv[1];
    let payload;
    try {
      payload = JSON.parse(input);
    } catch (error) {
      console.error("Invalid JSON:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    if (typeof payload?.thread_id !== "string" || payload.thread_id.length === 0) {
      console.error("thread_id missing in response.");
      process.exit(1);
    }

    process.stdout.write(payload.thread_id);
  ' "$json"
}

extract_access_tokens() {
  local json="$1"

  node -e '
    let payload;
    try {
      payload = JSON.parse(process.argv[1]);
    } catch (error) {
      console.error("Login response JSON parse failed.");
      process.exit(1);
    }

    if (typeof payload?.access_token !== "string" || payload.access_token.length === 0) {
      console.error("Login response missing access_token.");
      process.exit(1);
    }

    if (typeof payload?.refresh_token !== "string" || payload.refresh_token.length === 0) {
      console.error("Login response missing refresh_token.");
      process.exit(1);
    }

    process.stdout.write(`${payload.access_token}\n${payload.refresh_token}`);
  ' "$json"
}

extract_workspace_id() {
  local json="$1"

  node -e '
    let rows;
    try {
      rows = JSON.parse(process.argv[1]);
    } catch (error) {
      console.error("Workspace response JSON parse failed.");
      process.exit(1);
    }

    if (!Array.isArray(rows) || rows.length !== 1) {
      console.error("Expected exactly one metric_import row.");
      process.exit(1);
    }

    const workspaceId = rows[0]?.workspace_id;
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      console.error("metric_imports.workspace_id missing.");
      process.exit(1);
    }

    process.stdout.write(workspaceId);
  ' "$json"
}

assert_workspace_membership_exists() {
  local json="$1"

  node -e '
    let rows;
    try {
      rows = JSON.parse(process.argv[1]);
    } catch (error) {
      console.error("Membership response JSON parse failed.");
      process.exit(1);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.error("No workspace membership row found.");
      process.exit(1);
    }
  ' "$json" || fail "workspace_members row assert failed."
}

query_thread_row() {
  local thread_id="$1"
  supabase_rest_get "/rest/v1/arena_threads?id=eq.${thread_id}&select=id,kind,parent_thread_id,transform_spec,transform_sql_preview,transform_stats,transform_diff_report" "1"
}

assert_root_transform_thread() {
  local json="$1"
  local expected_id="$2"

  node -e '
    const rows = JSON.parse(process.argv[1]);
    const expectedId = process.argv[2];

    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("Expected exactly one row for root transform thread.");
    }

    const row = rows[0];

    if (row.id !== expectedId) {
      throw new Error(`Unexpected root thread id: ${row.id}`);
    }

    if (row.kind !== "transform_proposal") {
      throw new Error(`Expected kind=transform_proposal, got ${String(row.kind)}`);
    }

    if (row.transform_spec == null) {
      throw new Error("transform_spec is null.");
    }

    if (typeof row.transform_sql_preview !== "string" || row.transform_sql_preview.trim().length === 0) {
      throw new Error("transform_sql_preview is missing.");
    }

    if (row.transform_stats == null) {
      throw new Error("transform_stats is null.");
    }
  ' "$json" "$expected_id" || fail "Root thread DB assertions failed."
}

assert_child_transform_thread() {
  local json="$1"
  local expected_id="$2"
  local expected_parent_id="$3"

  node -e '
    const rows = JSON.parse(process.argv[1]);
    const expectedId = process.argv[2];
    const expectedParentId = process.argv[3];

    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("Expected exactly one row for child transform thread.");
    }

    const row = rows[0];

    if (row.id !== expectedId) {
      throw new Error(`Unexpected child thread id: ${row.id}`);
    }

    if (row.kind !== "transform_proposal") {
      throw new Error(`Expected child kind=transform_proposal, got ${String(row.kind)}`);
    }

    if (row.parent_thread_id !== expectedParentId) {
      throw new Error(`Expected parent_thread_id=${expectedParentId}, got ${String(row.parent_thread_id)}`);
    }

    if (row.transform_diff_report == null || typeof row.transform_diff_report !== "object" || Array.isArray(row.transform_diff_report)) {
      throw new Error("transform_diff_report is missing.");
    }

    const report = row.transform_diff_report;
    const hasError = typeof report.error === "string" && report.error.length > 0;
    const hasDeltas = report.deltas != null;

    if (!hasError && !hasDeltas) {
      throw new Error("transform_diff_report must include deltas or an error.");
    }
  ' "$json" "$expected_id" "$expected_parent_id" || fail "Child thread DB assertions failed."
}

build_range_payload_from_points() {
  local json="$1"

  node -e '
    const payload = JSON.parse(process.argv[1]);

    if (!payload?.ok || !Array.isArray(payload.points) || payload.points.length === 0) {
      throw new Error("Import points are missing.");
    }

    const first = new Date(payload.points[0].ts);
    const last = new Date(payload.points[payload.points.length - 1].ts);

    if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime())) {
      throw new Error("Import points have invalid timestamps.");
    }

    const start = first.toISOString();
    const endMs = Math.max(last.getTime() + 1000, first.getTime() + 1000);
    const end = new Date(endMs).toISOString();
    process.stdout.write(JSON.stringify({ start_ts: start, end_ts: end }));
  ' "$json"
}

require_env "SUPABASE_URL" "$SUPABASE_URL"
require_env "SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY"
require_env "IMPORT_ID" "$IMPORT_ID"

if is_truthy "$SMOKE_API_ONLY"; then
  API_ONLY_MODE=1
  NEEDS_PASSWORD_LOGIN=0
fi

if [[ "$API_ONLY_MODE" != "1" ]]; then
  require_env "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"
fi

if [[ "$API_ONLY_MODE" != "1" || -z "$COOKIE" ]]; then
  NEEDS_PASSWORD_LOGIN=1
  require_env "TEST_EMAIL" "$TEST_EMAIL"
  require_env "TEST_PASSWORD" "$TEST_PASSWORD"
fi

if [[ "$NEEDS_PASSWORD_LOGIN" == "1" ]] && ! command -v jq >/dev/null 2>&1; then
  fail "jq is required for password grant login."
fi

if [[ "$NEEDS_PASSWORD_LOGIN" == "1" ]]; then
  echo "==> Step 0: password grant login"
  LOGIN_BODY_FILE="$(mktemp)"
  LOGIN_PAYLOAD="$(jq -n --arg email "$TEST_EMAIL" --arg password "$TEST_PASSWORD" '{email:$email, password:$password}')"
  LOGIN_STATUS="$(
    curl -sS -o "$LOGIN_BODY_FILE" -w "%{http_code}" \
      -X POST \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Content-Type: application/json" \
      --data "$LOGIN_PAYLOAD" \
      "${SUPABASE_URL%/}/auth/v1/token?grant_type=password"
  )"
  LOGIN_BODY="$(cat "$LOGIN_BODY_FILE")"
  rm -f "$LOGIN_BODY_FILE"

  if [[ "$LOGIN_STATUS" != "200" ]]; then
    fail "Supabase login failed (HTTP $LOGIN_STATUS): $LOGIN_BODY"
  fi

  TOKENS="$(extract_access_tokens "$LOGIN_BODY")"
  ACCESS_TOKEN="$(echo "$TOKENS" | sed -n '1p')"
  REFRESH_TOKEN="$(echo "$TOKENS" | sed -n '2p')"
  if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
    fail "Supabase login response missing access_token/refresh_token."
  fi

  TEST_USER_ID="$(decode_jwt_sub "$ACCESS_TOKEN")"
  if [[ -z "$TEST_USER_ID" ]]; then
    fail "Unable to decode user id from access token."
  fi
  pass "Resolved test user id from access_token JWT sub."

  if [[ -z "$COOKIE" ]]; then
    PROJECT_REF="$(derive_supabase_project_ref "$SUPABASE_URL")"
    if [[ -z "$PROJECT_REF" ]]; then
      fail "Unable to derive Supabase project ref from SUPABASE_URL."
    fi

    COOKIE_NAME="sb-${PROJECT_REF}-auth-token"
    SESSION_JSON="$(echo "$LOGIN_BODY" | jq -c '.')"
    COOKIE="$(
      SESSION_JSON="$SESSION_JSON" COOKIE_NAME="$COOKIE_NAME" node -e '
        const sessionJson = process.env.SESSION_JSON;
        const cookieName = process.env.COOKIE_NAME;
        if (!sessionJson || !cookieName) {
          console.error("Missing session or cookie name.");
          process.exit(1);
        }

        let session;
        try {
          session = JSON.parse(sessionJson);
        } catch (error) {
          console.error("Invalid session JSON.");
          process.exit(1);
        }

        const raw = JSON.stringify(session);
        const base64url = Buffer.from(raw, "utf8")
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "");
        const encoded = `base64-${base64url}`;
        const max = 3180;
        const parts = [];

        if (encoded.length <= max) {
          parts.push({ name: cookieName, value: encoded });
        } else {
          for (let i = 0; i < encoded.length; i += max) {
            parts.push({
              name: `${cookieName}.${Math.floor(i / max)}`,
              value: encoded.slice(i, i + max),
            });
          }
        }

        process.stdout.write(parts.map(({ name, value }) => `${name}=${value}`).join("; "));
      '
    )"

    if [[ -z "$COOKIE" ]]; then
      fail "Failed to generate auth cookie."
    fi
    pass "Generated COOKIE via Supabase login."
  else
    pass "Using provided COOKIE for app requests."
  fi
else
  pass "Using provided COOKIE for app requests."
fi

if [[ "$API_ONLY_MODE" == "1" ]]; then
  echo "API-only mode: skipping DB asserts and membership seeding."
else
  echo "==> Step 0.5: seed workspace membership via service role"
  WORKSPACE_LOOKUP_JSON="$(supabase_rest_get "/rest/v1/metric_imports?id=eq.${IMPORT_ID}&select=workspace_id" "1")"
  WORKSPACE_ID="$(extract_workspace_id "$WORKSPACE_LOOKUP_JSON")"
  if [[ -z "$WORKSPACE_ID" ]]; then
    fail "Failed to resolve workspace_id from metric_imports."
  fi
  pass "Resolved workspace_id from metric_imports."

  MEMBERSHIP_UPSERT_PAYLOAD="$(
    WORKSPACE_ID="$WORKSPACE_ID" TEST_USER_ID="$TEST_USER_ID" node -e '
      const payload = [
        {
          workspace_id: process.env.WORKSPACE_ID,
          user_id: process.env.TEST_USER_ID,
          role: "member",
        },
      ];
      process.stdout.write(JSON.stringify(payload));
    '
  )"
  supabase_rest_post "/rest/v1/workspace_members?on_conflict=workspace_id,user_id" "$MEMBERSHIP_UPSERT_PAYLOAD" "1" >/dev/null

  MEMBERSHIP_ASSERT_JSON="$(supabase_rest_get "/rest/v1/workspace_members?workspace_id=eq.${WORKSPACE_ID}&user_id=eq.${TEST_USER_ID}&select=id" "1")"
  assert_workspace_membership_exists "$MEMBERSHIP_ASSERT_JSON"
  pass "workspace_members row exists before propose-transform."
fi

echo "==> Step 1: create transform proposal"
ROOT_PAYLOAD="$(
  IMPORT_ID="$IMPORT_ID" ROOT_PROMPT="$ROOT_PROMPT" PARENT_THREAD_ID="$PARENT_THREAD_ID" node -e '
  const payload = {
    import_id: process.env.IMPORT_ID,
    prompt: process.env.ROOT_PROMPT,
  };
  const parent = (process.env.PARENT_THREAD_ID ?? "").trim();
  if (parent) payload.parent_thread_id = parent;
  process.stdout.write(JSON.stringify(payload));
'
)"
api_call "POST" "/api/threads/propose-transform" "$ROOT_PAYLOAD"
if [[ "$RESP_STATUS" != "200" ]]; then
  fail "Root proposal request failed (HTTP $RESP_STATUS): $RESP_BODY"
fi
ROOT_THREAD_ID="$(extract_thread_id "$RESP_BODY")"
pass "Root proposal created: $ROOT_THREAD_ID"

if [[ "$API_ONLY_MODE" == "1" ]]; then
  echo "==> Step 2: API-only mode, skipping root DB assertions"
else
  echo "==> Step 2: verify root thread persisted fields"
  ROOT_THREAD_ROW_JSON="$(query_thread_row "$ROOT_THREAD_ID")"
  assert_root_transform_thread "$ROOT_THREAD_ROW_JSON" "$ROOT_THREAD_ID"
  pass "Root thread has kind=transform_proposal and transform fields persisted."
fi

echo "==> Step 3: create fork proposal"
FORK_PAYLOAD="$(
  IMPORT_ID="$IMPORT_ID" FORK_PROMPT="$FORK_PROMPT" ROOT_THREAD_ID="$ROOT_THREAD_ID" node -e '
  const payload = {
    import_id: process.env.IMPORT_ID,
    prompt: process.env.FORK_PROMPT,
    parent_thread_id: process.env.ROOT_THREAD_ID,
  };
  process.stdout.write(JSON.stringify(payload));
'
)"
api_call "POST" "/api/threads/propose-transform" "$FORK_PAYLOAD"
if [[ "$RESP_STATUS" != "200" ]]; then
  fail "Fork proposal request failed (HTTP $RESP_STATUS): $RESP_BODY"
fi
CHILD_THREAD_ID="$(extract_thread_id "$RESP_BODY")"
pass "Fork proposal created: $CHILD_THREAD_ID"

if [[ "$API_ONLY_MODE" == "1" ]]; then
  echo "==> Step 4: API-only mode, skipping child DB assertions"
else
  echo "==> Step 4: verify child diff report"
  CHILD_THREAD_ROW_JSON="$(query_thread_row "$CHILD_THREAD_ID")"
  assert_child_transform_thread "$CHILD_THREAD_ROW_JSON" "$CHILD_THREAD_ID" "$ROOT_THREAD_ID"
  pass "Child thread has transform_diff_report with deltas/error."
fi

echo "==> Step 5: negative test (non-transform parent must fail with HTTP 400)"
api_call "GET" "/api/imports/${IMPORT_ID}/points"
if [[ "$RESP_STATUS" != "200" ]]; then
  fail "Failed to load import points for negative test (HTTP $RESP_STATUS): $RESP_BODY"
fi
RANGE_JSON="$(build_range_payload_from_points "$RESP_BODY")"

DISCUSSION_PAYLOAD="$(
  IMPORT_ID="$IMPORT_ID" RANGE_JSON="$RANGE_JSON" node -e '
  const range = JSON.parse(process.env.RANGE_JSON);
  const payload = {
    import_id: process.env.IMPORT_ID,
    start_ts: range.start_ts,
    end_ts: range.end_ts,
  };
  process.stdout.write(JSON.stringify(payload));
'
)"
api_call "POST" "/api/threads/create" "$DISCUSSION_PAYLOAD"
if [[ "$RESP_STATUS" != "200" ]]; then
  fail "Failed to create discussion thread for negative test (HTTP $RESP_STATUS): $RESP_BODY"
fi
DISCUSSION_THREAD_ID="$(extract_thread_id "$RESP_BODY")"
pass "Discussion thread created for negative test: $DISCUSSION_THREAD_ID"

NEGATIVE_PAYLOAD="$(
  IMPORT_ID="$IMPORT_ID" NEGATIVE_PROMPT="$NEGATIVE_PROMPT" DISCUSSION_THREAD_ID="$DISCUSSION_THREAD_ID" node -e '
  const payload = {
    import_id: process.env.IMPORT_ID,
    prompt: process.env.NEGATIVE_PROMPT,
    parent_thread_id: process.env.DISCUSSION_THREAD_ID,
  };
  process.stdout.write(JSON.stringify(payload));
'
)"
api_call "POST" "/api/threads/propose-transform" "$NEGATIVE_PAYLOAD"
if [[ "$RESP_STATUS" != "400" ]]; then
  fail "Expected HTTP 400 for non-transform parent, got HTTP $RESP_STATUS: $RESP_BODY"
fi
pass "Negative test passed: non-transform parent_thread_id rejected with HTTP 400."

echo
echo "Demo smoke test completed successfully."
echo "Root thread:  $ROOT_THREAD_ID"
echo "Child thread: $CHILD_THREAD_ID"
