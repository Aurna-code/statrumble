# CODEX_LOG

## Entry Template
### Prompt ID: <prompt-id> (commit: TODO)
#### Prompt
```text
<original prompt>
```
#### Result
- <what changed>
- <verification summary>
#### Commit Link
- TODO

### Prompt ID: Normalize transform_spec + show validation issues (commit: TODO)
#### Prompt
```text
We are getting UI error: "Invalid transform_spec from model."
This is coming from propose-transform route when TransformSpecSchema (zod) validation fails.

Goal:
1) Normalize/repair the model-produced transform_spec BEFORE Zod validation to handle nullable strict-schema outputs.
2) Improve UI to display validation issues (details.issues) on 422 errors.

Tasks:

A) Server-side normalization
1) Open: statrumble/app/api/threads/propose-transform/route.ts
2) Find the code path:
   - parsed = JSON.parse(outputText)
   - cleanedSpec = pruneNullsDeep(parsed.transform_spec)
   - validatedSpec = TransformSpecSchema.safeParse(cleanedSpec)
3) Insert a normalization step between pruneNullsDeep and safeParse:
   - Implement normalizeTransformSpecFromModel(spec: unknown): unknown
   - It should:
     - Ensure spec is an object with version and ops array
     - For each op object:
       * If op.op === "filter_outliers":
         - Keep ONLY: op, method, mode, k, z
         - Delete: window, center, outputColumn, and any other keys
         - Defaults:
           method default "iqr" (or infer: if z is number -> "zscore" else "iqr")
           mode default "clip"
           if method==="iqr": ensure k is number else set 1.5; delete z
           if method==="zscore": ensure z is number else set 2.5; delete k
       * If op.op === "moving_average":
         - Keep ONLY: op, window, center, outputColumn
         - Delete: method, mode, k, z, and any other keys
         - Defaults:
           window: if not positive integer -> 7
           center: if not boolean -> false
     - Return normalized spec
4) Then validate:
   const normalizedSpec = normalizeTransformSpecFromModel(cleanedSpec);
   const validatedSpec = TransformSpecSchema.safeParse(normalizedSpec);
   Use validatedSpec.data for applyTransform and DB storage.
5) If validation still fails, keep returning 422 with issues.

B) UI: show 422 issues
6) Open:
   - statrumble/app/components/TransformProposalCreateForm.tsx
   - statrumble/app/components/TransformProposalForkForm.tsx
7) When fetch returns non-2xx, parse JSON and render:
   - error message
   - if details.issues exists (array), display a small list of issue.path + issue.message
   This will make debugging visible in the UI.

Verification:
- npm run lint
- npm run typecheck
- ./scripts/verify.sh
- Manual UI: Create Proposal should stop failing for common prompts; if it fails, issues should be visible.

Output:
- Patch diff
- Short note explaining normalization rules.
Suggested commit:
fix(ai): normalize model transform_spec + show validation issues in proposal forms
```
#### Result
- Added `normalizeTransformSpecFromModel` to coerce model output into valid TransformSpec shape (defaults for filter_outliers and moving_average; removes irrelevant keys) before Zod validation in `statrumble/app/api/threads/propose-transform/route.ts`.
- Normalization now runs after `pruneNullsDeep` and before `TransformSpecSchema.safeParse`, using the validated spec for applyTransform and DB storage.
- Updated `TransformProposalCreateForm` and `TransformProposalForkForm` to display validation issues from `details.issues` on 422 responses.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Manual UI test: invalid proposals show issue paths/messages; typical prompts succeed
#### Commit Link
- TODO

### Prompt ID: Fix codex-mini verbosity 400 (commit: TODO)
#### Prompt
```text
Fix 400 error:
"Unsupported value: 'low' is not supported with the 'gpt-5.1-codex-mini' model. Supported values are: 'medium'."

Context:
- Route: statrumble/app/api/threads/propose-transform/route.ts
- OpenAI request sets: text: { verbosity: "low", format: { type:"json_schema", strict:true, ... } }

Goal:
Make the request compatible with gpt-5.1-codex-mini (and robust across models).

Tasks:
1) In propose-transform/route.ts, change the OpenAI request to NOT send text.verbosity at all.
   - Keep text.format json_schema strict unchanged.
   - Remove any retry/fallback logic related to verbosity if it becomes unnecessary.
2) Alternatively (only if you strongly prefer), set verbosity dynamically:
   - if model === "gpt-5.1-codex-mini" -> "medium"
   - else omit verbosity
   But simplest is to omit verbosity entirely.

3) Run:
- npm run lint
- npm run typecheck
- ./scripts/verify.sh

Output:
- Patch diff
- Note: gpt-5.1-codex-mini only supports verbosity 'medium'; we omit verbosity for compatibility.
Suggested commit:
fix(ai): remove text.verbosity for codex-mini compatibility
```
#### Result
- Removed `text.verbosity` from the propose-transform OpenAI request while keeping strict `text.format` json_schema unchanged.
- Removed verbosity-specific error fallback helpers and retry path (`getErrorStatus` / `isVerbosityUnsupportedError` + retry branch), simplifying to a single compatible request.
- Added compatibility note in request comment explaining why verbosity is omitted.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Manual test: create proposal no longer fails on unsupported verbosity
#### Commit Link
- TODO

### Prompt ID: Fix strict required rule for transform proposal schema (commit: TODO)
#### Prompt
```text
Fix OpenAI Structured Outputs schema error:
"Invalid schema ... ops.items ... 'required' is required to be supplied and to be an array including every key in properties. Missing 'method'."

Context:
- propose-transform route uses Responses API with text.format json_schema strict.
- We replaced oneOf with a flat op schema, but still only required ["op"].
- OpenAI strict requires ALL fields to be required; optional must be emulated via union with null (official docs).

Tasks:
1) Open: statrumble/app/api/threads/propose-transform/route.ts
2) Locate opSchemaForModel / transformSpecSchemaForModel / transformProposalSchemaForModel.

3) Update opSchemaForModel:
- Ensure `required` includes EVERY key in `properties`.
- Keep additionalProperties: false.
- For fields that are not always applicable, allow null via union type:
  - method: type ["string","null"] (enum can remain ["iqr","zscore"])
  - mode: type ["string","null"] (enum ["remove","clip"])
  - k, z: type ["number","null"]
  - window: type ["integer","null"]
  - center: type ["boolean","null"]
  - outputColumn: type ["string","null"]
  - op stays required string enum ["filter_outliers","moving_average"].
Example pattern:
  const opProps = {...};
  const opSchemaForModel = { type:"object", additionalProperties:false, properties: opProps, required: Object.keys(opProps) };

4) Ensure transformSpecSchemaForModel and transformProposalSchemaForModel also follow the same rule:
- For any object schema you define, required must include every property key.

5) Add a preprocessing step before Zod validation:
- Implement `pruneNullsDeep(value)` that removes object keys whose value is null (recursively).
- After parsing model JSON, do:
  const cleanedSpec = pruneNullsDeep(parsed.transform_spec);
  validate TransformSpecSchema.safeParse(cleanedSpec)
  applyTransform(cleanedSpec, series)
  store cleanedSpec to DB (transform_spec).

6) Keep the existing dev guard for unsupported combinators, but ALSO add a dev-time check that required covers all keys:
- assertRequiredCoversAllProperties(schema) that verifies for each object schema:
  required includes every Object.keys(properties).

7) Run:
- npm run lint
- npm run typecheck
- ./scripts/verify.sh
Then manual UI test: Create Proposal should no longer 400.

Output:
- Patch diff
- Short note: strict schema requires all fields required; optional via null; prune nulls before zod.
Suggested commit:
fix(ai): satisfy strict required rule for transform proposal schema
```
#### Result
- Updated `opSchemaForModel` to require every property key and represent optional operator fields as nullable (`type: ["...","null"]`), while keeping `additionalProperties: false`.
- Updated `transformSpecSchemaForModel` and `transformProposalSchemaForModel` to derive `required` from all property keys.
- Added `pruneNullsDeep` and now validate cleaned `transform_spec` (`TransformSpecSchema.safeParse(cleanedSpec)`), preserving existing zod guardrails and persisted spec behavior.
- Added dev-time `assertRequiredCoversAllProperties` in addition to the combinator guard to catch strict-schema violations early.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Manual UI test: Create Proposal no longer returns schema 400
#### Commit Link
- TODO

### Prompt ID: Fix transform proposal schema oneOf 400 (commit: TODO)
#### Prompt
```text
Fix the 400 error when creating transform proposals:
"Invalid schema for response_format 'transform_proposal' ... ops.items ... 'oneOf' is not permitted."

Cause:
The Structured Outputs JSON schema we send to OpenAI contains `oneOf` under transform_spec.ops.items
(usually from zod union/discriminatedUnion -> JSON Schema conversion).
OpenAI json_schema strict does NOT permit oneOf there.

Goal:
Replace the model-output JSON schema for transform_spec.ops.items with a flat object schema (no oneOf/anyOf/allOf),
while keeping server-side Zod validation (TransformSpecSchema) as the real guardrail.

Tasks:
1) Open: statrumble/app/api/threads/propose-transform/route.ts
2) Find where the OpenAI Responses API request is built:
   - openai.responses.create({ ... text: { format: { type:"json_schema", ... schema: ... } } ... })
   - Look for the schema named "transform_proposal" (or similar) that includes transform_spec and ops.

3) Replace ONLY the schema used for Structured Outputs with a manually-defined JSON schema that does NOT use oneOf.

   Use a flat op schema like:

   const OpSchemaForModel = {
     type: "object",
     additionalProperties: false,
     properties: {
       op: { type: "string", enum: ["filter_outliers", "moving_average"] },

       // filter_outliers fields (optional)
       method: { type: "string", enum: ["iqr", "zscore"] },
       k: { type: "number" },
       z: { type: "number" },
       mode: { type: "string", enum: ["remove", "clip"] },

       // moving_average fields (optional)
       window: { type: "integer", minimum: 1 },
       center: { type: "boolean" },
       outputColumn: { type: "string" }
     },
     required: ["op"]
   };

   const TransformSpecSchemaForModel = {
     type: "object",
     additionalProperties: false,
     properties: {
       version: { type: "integer", enum: [1] },
       ops: { type: "array", minItems: 1, maxItems: 20, items: OpSchemaForModel }
     },
     required: ["version", "ops"]
   };

   And then proposal schema:

   const ProposalSchemaForModel = {
     type: "object",
     additionalProperties: false,
     properties: {
       title: { type: "string" },
       explanation: { type: "string" },
       transform_spec: TransformSpecSchemaForModel,
       sql_preview: { type: "string" }
     },
     required: ["title", "explanation", "transform_spec", "sql_preview"]
   };

4) Keep the existing server-side validation:
   - Parse model JSON
   - Validate parsed.transform_spec via TransformSpecSchema (zod)
   - If invalid, return 422 with issues (already implemented)

5) Add a quick guard/assertion in code (dev-only comment is fine):
   - Ensure the schema object does not contain "oneOf" anywhere.
   (Optional: a small helper that JSON.stringify(schema).includes("oneOf") and throws in dev.)

6) Verification:
   - npm run lint
   - npm run typecheck
   - ./scripts/verify.sh
   - Manual UI test: create proposal should no longer return 400.

Output:
- Patch diff
- Brief explanation: removed oneOf from structured output schema by using flat op schema.
Suggested commit:
fix(ai): remove oneOf from structured output schema for transform proposals
```
#### Result
- Replaced the Structured Outputs schema in `statrumble/app/api/threads/propose-transform/route.ts` with a flat `opSchemaForModel` (no `oneOf`/`anyOf`/`allOf`) and composed `transformSpecSchemaForModel` + `transformProposalSchemaForModel`.
- Kept server-side `TransformSpecSchema` zod validation unchanged as the authoritative guardrail for parsed `transform_spec`.
- Added a development-time assertion helper to fail fast if unsupported combinators appear in the schema object.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Manual UI test: create proposal no longer returns 400 for schema
#### Commit Link
- TODO

### Prompt ID: Main page transform proposal UI entrypoint (commit: TODO)
#### Prompt
```text
Add an obvious UI entrypoint to create a transform proposal thread (transform_proposal) without using curl.

Context:
- API exists: POST /api/threads/propose-transform
  Body: { import_id: string, prompt: string, parent_thread_id?: string|null }
  Response: { thread_id: string }
- The main page already lets users select an import/chart range and click "Create Thread" (discussion thread).

Goal:
Make it intuitive to create a proposal thread:
- Add a "Propose Transform (AI)" button next to the existing "Create Thread" button on the main chart section (statrumble/app/page.tsx).
- Clicking opens a small form (modal or inline) to enter a prompt and submit.
- On success, redirect to /threads/<thread_id>.
- Show loading + error message if request fails.

Tasks:
1) Locate the existing "Create Thread" UI in statrumble/app/page.tsx (the button under the chart selection).
2) Add a second button labeled "Propose Transform (AI)" (or "Create Proposal") beside it, matching existing styling.
3) Implement a small client component similar to TransformProposalForkForm:
   - New file e.g. statrumble/app/components/TransformProposalCreateForm.tsx
   - Props: importId: string (and optionally disabled if missing)
   - UI:
     - textarea for prompt
     - submit button (disabled while loading)
     - small helper text with 2 example prompts
     - render error message under form if API returns { ok:false } or non-2xx
4) Wire it:
   - When user submits, POST /api/threads/propose-transform with { import_id, prompt, parent_thread_id: null }
   - On success, use next/navigation router.push(`/threads/${thread_id}`)
5) Edge cases:
   - If no import is selected / importId is not available, disable the button and show tooltip text like "Select an import first".
   - Preserve existing Create Thread flow unchanged.
6) Keep UI language consistent (currently mixed English/Korean). Don’t do a full i18n refactor—just match existing tone.

Verification:
- npm run lint
- npm run typecheck
- ./scripts/verify.sh

Output:
- Patch (diff)
- Brief notes on where the entrypoint was added
Suggested commit message:
feat(ui): add entrypoint to create transform proposals
```
#### Result
- Added `statrumble/app/components/TransformProposalCreateForm.tsx` with inline prompt form, loading/error states, helper example prompts, disabled handling, and redirect to `/threads/<thread_id>`.
- Wired the new entrypoint in `statrumble/app/components/ImportChart.tsx` beside the existing `Create Thread` button as `Propose Transform (AI)`.
- Existing discussion-thread create flow remains unchanged.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Open main chart section, create proposal from new button, confirm redirect to created thread
#### Commit Link
- TODO

### Prompt ID: Demo smoke test script for transform proposals (commit: TODO)
#### Prompt
```text
Create a minimal demo smoke test script for StatRumble.

Goal: verify the transform proposal demo flow is working end-to-end (API level).

Tasks:
1) Add scripts/demo-smoke.sh (or .ts) that:
   - takes env vars: BASE_URL (default http://localhost:3000), COOKIE (auth cookie string), IMPORT_ID, PARENT_THREAD_ID(optional)
   - calls POST /api/threads/propose-transform with IMPORT_ID and a prompt
   - asserts response contains thread_id
   - fetches the created thread via existing getThread/read API or direct supabase query helper (whichever is available) and asserts:
     kind == 'transform_proposal'
     transform_spec, transform_sql_preview, transform_stats are non-null
   - calls POST /api/threads/propose-transform again with parent_thread_id = first thread_id (fork)
   - asserts child thread has transform_diff_report with deltas (or error field if expected)
2) Add a negative test:
   - call with parent_thread_id pointing to a non-transform discussion thread and assert HTTP 400
3) Print clear PASS/FAIL messages.

Do not add new dependencies unless already present.
Include instructions in comments on how to run it.
```
#### Result
- Added `scripts/demo-smoke.sh` as an API-level smoke test with clear PASS/FAIL output and run instructions in comments.
- Script covers: root proposal create, root DB assertions (`kind`, `transform_spec`, `transform_sql_preview`, `transform_stats`), fork proposal create, child diff assertion (`transform_diff_report.deltas` or `error`), and negative parent-kind test expecting HTTP 400.
- Negative path auto-creates a discussion thread via `/api/threads/create` using import range derived from `/api/imports/{id}/points`.
- DB assertions use Supabase REST (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) without adding dependencies.
#### Manual Checklist
- [x] `bash -n scripts/demo-smoke.sh`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Run smoke script against local app with valid `COOKIE`, `IMPORT_ID`, and Supabase envs
#### Commit Link
- TODO

### Prompt ID: Prompt 01 (commit: TODO)
#### Prompt
```text
[Prompt 01] Supabase 초기 스키마 + RLS + snapshot RPC (statrumble/ 구조 반영, idempotent)

현재 레포 구조:
- Next.js 앱이 statrumble/ 디렉토리 아래에 있다.
- Supabase 관련 파일은 기본적으로 statrumble/supabase/ 아래에 둔다.
  (만약 이미 repo root에 supabase/가 존재한다면, 한 군데로 통일해라. 중복 금지.)

요구사항:
1) Migration 파일 생성/정리
- statrumble/supabase/migrations/000_init.sql 생성 (또는 이미 있으면 요구사항에 맞게 수정)
- extension: pgcrypto (gen_random_uuid 사용)

2) 테이블 생성 (모든 테이블 공통: id uuid pk default gen_random_uuid(), workspace_id uuid not null, created_at timestamptz default now())
- workspaces:
  - id uuid pk
  - name text not null default 'Default'
  - created_at
- workspace_members:
  - id uuid pk
  - workspace_id uuid references public.workspaces(id) on delete cascade
  - user_id uuid references auth.users(id) on delete cascade
  - role text not null default 'member'
  - created_at
  - unique(workspace_id, user_id)

- metrics:
  - id, workspace_id, created_at
  - name text not null
  - unit text
  - unique(workspace_id, name)

- metric_imports:
  - id, workspace_id, created_at
  - metric_id uuid references public.metrics(id) on delete cascade
  - file_name text
  - row_count int not null default 0

- metric_points:
  - id, workspace_id, created_at
  - import_id uuid references public.metric_imports(id) on delete cascade
  - ts timestamptz not null
  - value double precision not null

- arena_threads:
  - id, workspace_id, created_at
  - metric_id uuid references public.metrics(id)
  - import_id uuid references public.metric_imports(id) on delete cascade
  - start_ts timestamptz not null
  - end_ts timestamptz not null
  - snapshot jsonb not null
  - referee_report jsonb null

- arena_messages:
  - id, workspace_id, created_at
  - thread_id uuid references public.arena_threads(id) on delete cascade
  - user_id uuid references auth.users(id) on delete cascade
  - content text not null

- arena_votes:
  - id, workspace_id, created_at
  - thread_id uuid references public.arena_threads(id) on delete cascade
  - user_id uuid references auth.users(id) on delete cascade
  - stance text not null check (stance in ('A','B','C'))
  - unique(thread_id, user_id)

- decision_cards:
  - id, workspace_id, created_at
  - thread_id uuid references public.arena_threads(id) on delete set null
  - title text not null
  - decision text not null
  - context text
  - snapshot jsonb not null

3) Default Workspace 고정 UUID 삽입
- DEFAULT_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
- workspaces에 해당 id로 insert (이미 있으면 upsert/ignore)
- .env.example의 NEXT_PUBLIC_DEFAULT_WORKSPACE_ID도 이 UUID로 맞춰라.

4) 신규 가입 유저 자동 멤버십
- public.handle_new_user() 트리거 함수 생성 (plpgsql, SECURITY DEFINER, search_path 명시)
  - auth.users에 row가 생기면 workspace_members에 (DEFAULT_WORKSPACE_ID, new.id) 삽입
  - 중복 삽입은 ON CONFLICT DO NOTHING
- trigger: after insert on auth.users for each row execute function public.handle_new_user()

5) RLS + 멤버 체크 함수
- 공통 함수:
  - public.is_workspace_member(p_workspace uuid) returns boolean
  - exists(select 1 from public.workspace_members wm where wm.workspace_id=p_workspace and wm.user_id=auth.uid())
- 모든 테이블에 ENABLE ROW LEVEL SECURITY

- workspace_members 정책:
  - select: user_id = auth.uid()
  - (insert/update/delete는 MVP에서 막아도 됨. 트리거로만 생성.)

- 나머지 테이블 정책(공통):
  - select: public.is_workspace_member(workspace_id)
  - insert: public.is_workspace_member(workspace_id)
  - update: public.is_workspace_member(workspace_id)
  - delete: public.is_workspace_member(workspace_id)
  단, 아래는 추가 제약:
  - arena_messages insert/update/delete: user_id = auth.uid()
  - arena_votes insert/update: user_id = auth.uid()

6) Snapshot RPC 함수
- create or replace function public.compute_snapshot(
    p_import_id uuid,
    p_start_ts timestamptz,
    p_end_ts timestamptz
  ) returns jsonb
- 구간 정의(일관성 있게):
  - selected: ts >= p_start_ts and ts < p_end_ts
  - before: 동일 길이 interval len = (p_end_ts - p_start_ts)
           ts >= (p_start_ts - len) and ts < p_start_ts
- 각각에 대해:
  - n, avg, min, max, stddev_pop(value)
- delta:
  - abs = selected.avg - before.avg
  - rel = case when before.avg is null or before.avg=0 then null else (selected.avg - before.avg)/abs(before.avg) end
- metric_name, unit 포함:
  - metric_imports -> metrics join으로 가져오기
- 반환 JSON 형태(예시 키):
  {
    "import_id": ...,
    "range": {"start_ts":..., "end_ts":...},
    "metric": {"id":..., "name":..., "unit":...},
    "selected": {"n":..., "avg":..., "min":..., "max":..., "stddev_pop":...},
    "before": {...},
    "delta": {"abs":..., "rel":...}
  }
- 함수는 SECURITY INVOKER(기본)로 두고, RLS에 의해 접근 제어가 걸리게 해라.

7) 인덱스
- metric_points(import_id, ts)
- arena_threads(import_id, start_ts, end_ts)

8) 문서 업데이트
- README.md에 “migration 적용 방법” 섹션 추가:
  - Supabase Dashboard SQL Editor에 000_init.sql 실행
  - (선택) supabase CLI를 쓰는 경우 기본 경로 안내
- docs/CODEX_LOG.md에 Prompt 01 기록 추가(원문 프롬프트 포함, 변경 요약, 체크리스트, commit: TODO)

DoD:
- 000_init.sql이 요구사항을 충족
- 스키마/정책/함수/인덱스 포함
- 타입체크/린트는 기존대로 통과
- 커밋 메시지 제안: "db: initial schema, rls, and snapshot rpc"

출력:
- 변경 파일 목록
- 추가한 SQL 주요 조각(테이블/정책/함수 이름)
- 다음 프롬프트(02)를 진행해도 되는지 체크리스트
```
#### Result
- `statrumble/supabase/migrations/000_init.sql`를 생성해 초기 스키마, RLS, 정책, 트리거, `compute_snapshot` RPC, 인덱스를 idempotent하게 반영했다.
- 기본 워크스페이스 UUID(`11111111-1111-1111-1111-111111111111`)를 migration insert와 `.env.example`에 동기화했다.
- README에 migration 적용 방법 섹션을 추가했다.
#### Manual Checklist
- [x] `statrumble/supabase/migrations/000_init.sql` 생성
- [x] RLS + 정책 + 함수(`is_workspace_member`, `handle_new_user`, `compute_snapshot`) 반영
- [x] 기본 워크스페이스 UUID 반영 (`.env.example`, migration)
- [x] `npm run lint` 실행
- [x] `npm run typecheck` 실행
- [x] `npm run verify` 실행
#### Commit Link
- TODO

## Entries

### Prompt ID: Prompt 00 (commit: TODO)
#### Prompt
```text
[Prompt 00] 레포 부트스트랩 + 착수 파일 세트 구성

요구사항:
1) Next.js(App Router) + TS + Tailwind + ESLint 구성이 없으면 생성해라.
   - src/ 디렉토리 X
   - import alias @/* 유지
2) 의존성 설치/추가:
   - @supabase/supabase-js, @supabase/ssr
   - openai
   - recharts
   - papaparse
   - zod (Referee JSON schema 및 타입 안정용)
3) 아래 파일을 생성/갱신해라:
   - AGENTS.md : 위 마스터 규칙을 프로젝트용으로 정리(스키마 변경 프로토콜 포함)
   - README.md : what/stack/run 방법, “Codex를 Referee로 사용 + 개발 과정 로그 남김” 명시, “No API keys in repo” 명시
   - .env.example : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY(서버용), NEXT_PUBLIC_DEFAULT_WORKSPACE_ID(고정 uuid) 자리만
   - .gitignore : .env.local 등 비밀키/로컬 파일 차단
   - docs/CODEX_LOG.md : 초기 템플릿(프롬프트/결과/커밋 링크 섹션)
   - scripts/verify.sh : npm run lint + npm run typecheck(+ 가능하면 test) 한 번에 실행
4) package.json 스크립트 추가:
   - "lint", "typecheck" (tsc --noEmit), (가능하면) "test"
   - "verify": "./scripts/verify.sh"
5) 최소 페이지 골격:
   - app/layout.tsx (간단한 nav 영역)
   - app/page.tsx (MVP 메인: “CSV 업로드 / 차트 / 스레드 목록” 자리표시)
   - app/login/page.tsx (로그인 UI 자리표시)
   - app/threads/[id]/page.tsx, app/decisions/page.tsx (자리표시)
   ※ 아직 기능 구현은 하지 말고, 라우팅 뼈대만.
6) 완료 정의(DoD):
   - npm run lint / npm run typecheck 가 통과
   - scripts/verify.sh 가 0으로 종료
   - README에 로컬 실행 방법이 적혀 있음
```
#### Result
- Prompt 00 범위에 맞게 라우팅/페이지를 자리표시 스캐폴딩으로 구성했다.
- `AGENTS.md`, 루트 `README.md`, 루트 `.env.example`, 루트 `.gitignore`, `scripts/verify.sh`를 요구사항 형식으로 갱신했다.
- `package.json`(루트/앱)에 `lint`, `typecheck`, `test`, `verify` 스크립트를 구성했다.
- Referee/차트 실제 기능 코드는 제외하고 스캐폴딩만 남겼다.
- `statrumble/` 의존성 설치 후 `npm run lint`, `npm run typecheck`, `npm run verify`를 모두 통과했다.
#### Manual Checklist
- [x] Prompt 00 파일 세트 생성/갱신
- [x] 라우팅 뼈대(`app/login`, `app/threads/[id]`, `app/decisions`) 생성
- [x] `npm run lint` 실행 통과
- [x] `npm run typecheck` 실행 통과
- [x] `npm run verify` 실행 통과
#### Commit Link
- TODO

### Prompt ID: Prompt 02 (commit: TODO)
#### Prompt
```text
[Prompt 02] Supabase SSR 세션 + 로그인/로그아웃 + 라우트 보호 (statrumble/ 기준)

레포 구조:
- Next.js 앱 루트는 statrumble/ 디렉토리다.
- 앞으로 Next 관련 파일(middleware.ts, lib 등)은 statrumble/ 아래에 둔다.

요구사항:
1) Supabase 클라이언트 유틸 생성
- statrumble/lib/supabase/server.ts
  - @supabase/ssr의 createServerClient 사용
  - cookies를 읽고/쓰는 헬퍼 포함(Next headers cookies 사용)
- statrumble/lib/supabase/client.ts
  - createBrowserClient 사용

2) middleware.ts (라우트 보호 + 세션 갱신)
- statrumble/middleware.ts 생성
- Supabase SSR 공식 패턴으로:
  - createServerClient로 auth.getUser() 호출하여 세션 갱신
  - 미로그인 + 보호경로면 /login으로 redirect
  - /login, /_next, /favicon.ico 등은 예외 처리
  - 로그인 상태로 /login 접근 시 / 로 redirect(옵션)

3) 로그인 UI
- statrumble/app/login/page.tsx
  - email OTP(magic link) 방식으로 로그인 구현
  - supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ... } })
  - 성공/실패 메시지 표시

4) 로그아웃
- statrumble/app/auth/signout/route.ts (POST)
  - 서버에서 createServerClient로 supabase.auth.signOut()
  - 완료 후 /login redirect
- statrumble/app/layout.tsx nav에서 로그아웃 버튼은 form POST로 연결

5) DoD
- 로그인 없이 / 접근 → /login redirect
- 로그인 후 / 접근 가능
- 로그아웃하면 /login으로 이동
- lint/typecheck/verify 통과

추가:
- README에 “Supabase Auth 설정(OTP 이메일)”과 env 위치(statrumble/.env.local) 짧게 명시
- docs/CODEX_LOG.md에 Prompt 02 기록(원문/요약/체크리스트/(commit: TODO))

커밋 메시지:
- "feat: supabase ssr auth and protected routes"
```
#### Result
- `statrumble/lib/supabase/server.ts`와 `statrumble/lib/supabase/client.ts`를 추가해 SSR/브라우저 Supabase 클라이언트를 분리했다.
- `statrumble/middleware.ts`에서 `auth.getUser()` 기반 세션 갱신과 보호 라우트 리다이렉트를 구현했다.
- `statrumble/app/login/page.tsx`에 Email OTP(Magic Link) 로그인 폼과 성공/실패 메시지를 구현했다.
- `statrumble/app/auth/signout/route.ts`(POST)와 `statrumble/app/auth/callback/route.ts`를 추가해 로그아웃 및 OTP 콜백 세션 확정을 연결했다.
- `statrumble/app/layout.tsx` 네비게이션에 로그인 상태 표시/로그아웃 POST 폼을 반영했다.
- `README.md`에 Supabase Auth(OTP 이메일) 설정 및 `statrumble/.env.local` 위치를 추가했다.
#### Manual Checklist
- [x] Supabase SSR/browser client 유틸 추가
- [x] middleware 라우트 보호 + 세션 갱신 구현
- [x] 로그인 UI(Email OTP) 구현
- [x] 로그아웃 POST route + layout form 연결
- [x] README Auth/env 안내 추가
- [x] `npm run lint` 실행
- [x] `npm run typecheck` 실행
- [x] `./scripts/verify.sh` 실행
#### Commit Link
- TODO

### Prompt ID: Prompt 03 (commit: TODO)
#### Prompt
```text
[Prompt 03] DB 접근 레이어 + 샘플 CSV + 메인 페이지 목록 표시 (statrumble/ 기준, pnpm workspace)

레포 구조:
- Next 앱 루트: statrumble/
- Supabase: statrumble/lib/supabase/{server,client}.ts 사용
- workspace_id는 MVP에서 NEXT_PUBLIC_DEFAULT_WORKSPACE_ID(1111...)를 기본값으로 쓴다.

요구사항:
1) DB 헬퍼 추가 (statrumble/lib/db/)
- statrumble/lib/db/metrics.ts
  - listMetrics(): metrics 목록 (workspace_id=default)
  - getOrCreateMetric(name, unit): (workspace_id, name) unique 기준 upsert로 하나 반환
- statrumble/lib/db/imports.ts
  - listImports(limit=20): metric_imports 목록 + metrics(name,unit) join해서 반환
  - createImport(metricId, fileName, rowCount): import row 반환
- statrumble/lib/db/points.ts
  - insertPointsBulk(importId, rows): rows = {ts,value}[]
    - 배치 insert(예: 500개 단위 chunk)
    - 각 row에 workspace_id, import_id, ts, value 넣기
    - MVP 안전장치: 최대 rows 50,000 제한(넘으면 에러)
  - fetchPoints(importId, range?): range는 start/end timestamptz optional
    - ts 오름차순 정렬로 반환
- statrumble/lib/db/index.ts 에서 export 정리

구현 규칙:
- 서버에서 실행되는 함수는 createServerClient를 사용(= statrumble/lib/supabase/server.ts)
- default workspace id는 process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID에서 읽고, 없으면 에러 throw
- 각 함수는 Supabase 에러를 throw로 올리고, 호출자가 사용자 메시지로 처리할 수 있게 메시지 포함

2) 샘플 CSV 추가
- docs/sample.csv 생성(최소 200행)
  - header: ts,value
  - ts는 ISO8601, 1분 간격 정도로 생성
  - value는 적당히 변동 있는 숫자

3) 메인 페이지(app/page.tsx) 개선(아직 업로드 구현은 X)
- “CSV 업로드/차트/스레드” 자리표시는 유지하되,
- 아래에 현재 DB의:
  - Metrics 목록(빈 상태면 “아직 없음”)
  - Imports 최신 10개 목록(파일명/row_count/metric 이름/created_at)
  을 표시해라.
- 이 목록 조회는 서버 컴포넌트에서 listMetrics/listImports로 가져와도 되고,
  또는 간단한 server action을 써도 된다. (클라이언트 호출은 아직 하지 말 것)

4) docs/CODEX_LOG.md에 Prompt 03 기록 추가(원문/요약/체크리스트/(commit: TODO))

DoD:
- pnpm -C statrumble lint / typecheck / verify 통과
- docs/sample.csv 존재
- 로그인 후 / 에서 metrics/imports 목록 섹션이 보임(없으면 empty state)

커밋 메시지 제안:
- "feat: db helpers and sample csv"
```
#### Result
- `statrumble/lib/db/metrics.ts`, `statrumble/lib/db/imports.ts`, `statrumble/lib/db/points.ts`, `statrumble/lib/db/index.ts`를 추가해 기본 workspace 기준 DB 접근 레이어를 구현했다.
- `statrumble/app/page.tsx`에서 서버 컴포넌트로 metrics/imports 목록(빈 상태/에러 상태 포함)을 렌더링하도록 확장했다.
- `docs/sample.csv`를 `ts,value` 헤더와 1분 간격 ISO8601 데이터 240행으로 생성했다.
#### Manual Checklist
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
- [x] `docs/sample.csv` 생성
- [x] `/` 페이지에 Metrics/Imports 목록 섹션 반영
#### Commit Link
- TODO

### Prompt ID: Prompt 04 (commit: TODO)
#### Prompt
```text
[Prompt 04] CSV 업로드 플로우 구현 (server action + FormData, statrumble/ 기준)

목표:
- 메인 페이지에서 CSV 파일을 업로드하면
  metrics/metric_imports/metric_points가 저장되고,
  업로드 후 메인(/)으로 돌아와 Imports 목록에서 방금 import가 보이게 한다.

요구사항:
1) 업로드 서버 액션 추가
- 파일: statrumble/app/actions/uploadCsv.ts (또는 uploadCsvAction.ts)
- 'use server'
- export async function uploadCsvAction(prevState, formData)

입력(FormData):
- metric_name: string (필수)
- unit: string (옵션)
- file: File (필수)

동작:
- file.text()로 CSV 문자열 읽기
- papaparse로 header 기반 파싱
  - header: true, skipEmptyLines: true
  - 컬럼: ts,value
- 유효성 검사:
  - ts: Date로 파싱 가능해야 함
  - value: number로 파싱 가능해야 함
  - rows <= 50,000 (초과 시 에러)
- 저장:
  - getOrCreateMetric(metric_name, unit) 호출
  - createImport(metric.id, file.name, rows.length) 호출
  - insertPointsBulk(import.id, rows) 호출
    - rows는 { ts: string, value: number }[]
    - ts는 new Date(ts).toISOString() 형태로 정규화해서 넣기
- 성공 시:
  - revalidatePath('/') 호출
  - redirect('/') (또는 redirect('/?uploaded=1') 같은 방식)
- 실패 시:
  - { ok:false, error:'...' } 형태로 state 반환

2) 메인 페이지 UI(app/page.tsx)에서 업로드 폼 구현
- statrumble/app/components/UploadCsvForm.tsx (클라이언트 컴포넌트) 생성 권장
  - 'use client'
  - useFormState + useFormStatus 사용해서 서버 액션 연결
  - 입력:
    - metric_name (text)
    - unit (text)
    - file (input type="file" accept=".csv,text/csv")
  - 제출 버튼은 pending일 때 disabled + “Uploading...” 표시
  - state.error 있으면 화면에 표시
- app/page.tsx에는 기존 자리표시 유지 + 상단에 UploadCsvForm 렌더링

3) UX/제약
- file이 없거나 metric_name이 비면 즉시 에러 표시
- parse errors(잘못된 행)는:
  - MVP에서는 “첫 N개만 보고 전체 실패”로 처리해도 OK
  - 에러 메시지에 문제 예시(행 번호/값)를 간단히 포함

4) 로그
- docs/CODEX_LOG.md에 Prompt 04 기록 추가(원문/요약/체크리스트/(commit: TODO))

DoD:
- 로그인 후 / 에서 CSV 업로드 가능
- 업로드 성공 시 Imports 최신 10개 목록에 새 import가 보임
- pnpm -C statrumble lint/typecheck/verify 통과

커밋 메시지 제안:
- "feat: csv upload to metric imports and points"
```
#### Result
- `statrumble/app/actions/uploadCsv.ts` 서버 액션을 추가해 CSV 파싱/검증/저장(`metrics`, `metric_imports`, `metric_points`) 후 `revalidatePath('/')` + `redirect('/')` 흐름을 구현했다.
- `statrumble/app/components/UploadCsvForm.tsx`를 추가해 `useFormState + useFormStatus` 기반 업로드 폼, pending 상태, 즉시 입력 검증, 서버 에러 표시를 구현했다.
- `statrumble/app/page.tsx`의 CSV 업로드 섹션에 업로드 폼을 연결했다.
#### Manual Checklist
- [ ] 로그인 후 `/` 에서 CSV 업로드 가능
- [ ] 업로드 성공 시 Imports 최신 10개 목록에 신규 import 표시
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Hotfix 04a (commit: TODO)
#### Prompt
```text
[Hotfix 04a] Fix server action export rule + React hook rename + ensure list refresh

문제:
1) Next runtime error:
   "A 'use server' file can only export async functions, found object."
   in statrumble/app/actions/uploadCsv.ts
2) Console error:
   "ReactDOM.useFormState has been renamed to React.useActionState."
   in statrumble/app/components/UploadCsvForm.tsx
3) 업로드 후 Imports 목록이 즉시 갱신되지 않는 듯함(캐시/리렌더 영향 가능)

작업:
A) statrumble/app/actions/uploadCsv.ts
- 파일 최상단의 "use server" 디렉티브를 제거한다.
- 대신 export async function uploadCsvAction(...) 함수 바디 첫 줄에 'use server'를 넣는다.
- 이렇게 하면 이 파일에서 state 타입/초기 state 객체(상수)를 export 해도 Next 규칙 위반이 아니다.
- upload 성공 시 revalidatePath("/", "page") 호출 후 redirect("/") 유지.
- (옵션) 업로드된 import_id를 redirect query로 붙여도 됨: redirect("/?uploaded=1")

B) statrumble/app/components/UploadCsvForm.tsx
- useFormState 사용을 중단하고, React에서 useActionState를 사용한다.
  예:
    import React, { useActionState, useState } from "react";
    const [state, formAction, pending] = useActionState(uploadCsvAction, initialState);
- 기존 useFormStatus 로직이 있으면, pending(3번째 반환값)로 대체하거나 useFormStatus를 유지해도 됨.
- 에러 메시지 출력/버튼 disable이 정상 동작하게 한다.

C) statrumble/app/page.tsx
- 업로드 직후 목록 갱신이 안 될 수 있으니, 안전하게 페이지를 dynamic으로 만든다.
  파일 상단에:
    export const dynamic = "force-dynamic";
  또는 Home() 안에서 noStore()를 호출해도 됨.
- Metrics/Imports 섹션은 그대로 유지.

D) docs/CODEX_LOG.md에 Hotfix 04a 기록 추가

DoD:
- 페이지 로드 시 위 2개 에러가 더 이상 뜨지 않는다.
- 업로드 성공 후 / 로 돌아오면 Imports 최신 목록에 방금 업로드가 보인다(또는 새로고침 없이도 보임).
- pnpm -C statrumble lint/typecheck/verify 통과

커밋 메시지:
- "fix: server actions and upload form hooks"
```
#### Result
- `statrumble/app/actions/uploadCsv.ts`에서 파일 레벨 `"use server"`를 제거하고, `uploadCsvAction` 함수 내부로 이동해 Next 서버 액션 export 규칙 오류를 해결했다.
- 업로드 성공 시 `revalidatePath("/", "page")` 후 `redirect("/")`를 수행하도록 갱신했다.
- `statrumble/app/components/UploadCsvForm.tsx`를 `useFormState/useFormStatus`에서 `useActionState` 기반으로 전환해 React 훅 rename 경고를 제거했다.
- `statrumble/app/page.tsx`에 `export const dynamic = "force-dynamic";`를 추가해 업로드 직후 목록 갱신을 보수적으로 보장했다.
#### Manual Checklist
- [ ] 페이지 로드 시 server action export/runtime 에러 미발생 확인
- [ ] 페이지 로드 시 React 훅 rename 콘솔 에러 미발생 확인
- [ ] 업로드 성공 후 `/` Imports 최신 목록 즉시 갱신 확인
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Hotfix 04b (commit: TODO)
#### Prompt
```text
[Hotfix 04b] Fix server action placement + split types/state + useActionState

문제:
- build error: inline "use server" in uploadCsvAction inside file imported by client component
- 이전 에러 방지: "use server" 파일은 async 함수만 export 가능

작업:
1) 새 파일 생성: statrumble/app/actions/uploadCsv.types.ts
- 여기에는 클라이언트에서도 안전한 것만 둔다(서버 import 금지)
- export type UploadCsvActionState = { ok: boolean; error?: string };
- export const initialUploadCsvActionState: UploadCsvActionState = { ok: true };

2) statrumble/app/actions/uploadCsv.ts 수정
- 파일 최상단에 "use server"; 를 둔다.
- export는 async function uploadCsvAction(...) 단 하나만 한다.
- 함수 바디 안의 "use server" 문자열은 제거한다.
- UploadCsvActionState 타입은 uploadCsv.types.ts에서 import type으로 가져온다.
- revalidatePath("/") + redirect("/") 유지

3) statrumble/app/components/UploadCsvForm.tsx 수정
- useFormState를 쓰지 말고 react의 useActionState로 변경
- import { useActionState, useState } from "react";
- import { uploadCsvAction } from "../actions/uploadCsv";
- import { initialUploadCsvActionState } from "../actions/uploadCsv.types";
- const [state, formAction, pending] = useActionState(uploadCsvAction, initialUploadCsvActionState);
- <form action={formAction}> 형태 유지
- pending으로 버튼 disable + "Uploading..." 표시
- state.error 렌더 유지

4) statrumble/app/page.tsx
- 업로드 후 목록 갱신 이슈 방지로 파일 상단에:
  export const dynamic = "force-dynamic";
  추가(이미 있으면 중복 금지)

5) docs/CODEX_LOG.md에 Hotfix 04b 기록 추가

DoD:
- 빌드 에러 사라짐
- 업로드 후 /로 돌아오면 Imports 최신 목록에 새 import가 보임
- pnpm -C statrumble lint/typecheck/verify 통과

커밋 메시지:
- "fix: server action module boundaries and hooks"
```
#### Result
- `statrumble/app/actions/uploadCsv.types.ts`를 추가해 업로드 액션 상태 타입/초기 상태를 서버 액션 파일에서 분리했다.
- `statrumble/app/actions/uploadCsv.ts`를 파일 레벨 `"use server"` + `uploadCsvAction` 단일 async export 구조로 정리하고, 함수 내부 `"use server"`를 제거했다.
- `statrumble/app/components/UploadCsvForm.tsx`에서 `useActionState`를 유지하되 액션/초기 상태 import를 `../actions/*` 경계로 분리했다.
- `statrumble/app/page.tsx`의 `export const dynamic = "force-dynamic";`는 이미 존재하여 유지했다.
#### Manual Checklist
- [ ] 빌드 에러(서버 액션 배치/exports) 미발생 확인
- [ ] 업로드 후 `/` Imports 최신 목록에 신규 import 반영 확인
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Hotfix 04c (commit: TODO)
#### Prompt
```text
[Hotfix 04c] Remove encType/method from Server Action form

- statrumble/app/components/UploadCsvForm.tsx에서
  <form action={formAction} ... encType="multipart/form-data"> 를
  encType 속성 없이 사용하도록 수정한다.
- 혹시 method="post"도 있으면 같이 제거한다.
- lint/typecheck/verify 통과 확인
- docs/CODEX_LOG.md에 Hotfix 04c 기록 추가

커밋 메시지: "fix: remove encType from server action form"
```
#### Result
- `statrumble/app/components/UploadCsvForm.tsx`의 서버 액션 form에서 `encType="multipart/form-data"`를 제거했다.
- `method="post"` 속성은 기존 코드에 없어서 추가 변경 없이 유지했다.
#### Manual Checklist
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Hotfix 04d (commit: TODO)
#### Prompt
```text
[Hotfix 04d] Remove npm usage from verify script; standardize on pnpm workspace

상황:
- pnpm workspace로 통일했는데 verify.sh가 npm을 호출해서 "npm warn Unknown env config..." 같은 잡음이 뜬다.

작업:
1) scripts/verify.sh 수정
- set -euo pipefail
- 기본 실행은 pnpm으로 고정:
  - pnpm -C statrumble lint
  - pnpm -C statrumble typecheck
  - pnpm -C statrumble test (없으면 existing behavior 유지: "No tests configured"면 0)
- (옵션) pnpm이 없을 때만 npm fallback:
  - npm --prefix statrumble run lint 등
- 출력은 지금처럼 단계별로 보이게.

2) package.json(루트) 스크립트도 pnpm 기준으로 정리
- "lint": "pnpm -C statrumble lint"
- "typecheck": "pnpm -C statrumble typecheck"
- "test": "pnpm -C statrumble test"
- "verify": "./scripts/verify.sh"
(이미 비슷하면 최소 diff)

3) docs/CODEX_LOG.md에 Hotfix 04d 기록 추가

DoD:
- pnpm -C statrumble verify 실행 시 npm warn 문구가 더 이상 안 뜬다.
- 종료코드 0 유지
- lint/typecheck/verify 통과

커밋 메시지:
- "chore: run verify via pnpm"
```
#### Result
- `scripts/verify.sh`를 pnpm 우선 실행(`lint/typecheck/test`)으로 변경하고, pnpm 미설치 환경에서만 npm fallback 하도록 정리했다.
- 루트 `package.json`의 `lint/typecheck/test` 스크립트를 `pnpm -C statrumble ...` 형태로 통일했다.
#### Manual Checklist
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
- [x] `pnpm -C statrumble verify` 출력에서 npm warn 문구 없음 확인
#### Commit Link
- TODO

### Prompt ID: Prompt 05 (commit: TODO)
#### Prompt
```text
[Prompt 05] 차트 + 구간 선택 + Arena 스레드 생성 (snapshot 고정) — statrumble/ 기준

목표:
- 로그인 후 / 에서 import를 선택하고,
- 해당 import의 points를 차트로 보고,
- Brush(또는 간단 선택 UI)로 구간을 선택한 뒤,
- "Create Thread"를 누르면:
  - 서버에서 compute_snapshot RPC 실행
  - arena_threads에 snapshot 포함 insert
  - /threads/{id}로 이동

요구사항 A) API: points 조회
1) Route 생성:
- statrumble/app/api/imports/[importId]/points/route.ts (GET)
- 인증: 현재 세션 쿠키 기반(기존 supabase server client util 사용)
- 입력:
  - importId: params
  - (옵션) query: start_ts, end_ts
- 동작:
  - metric_points에서 import_id=importId 필터, ts ASC 정렬
  - (옵션) range 있으면 ts 범위 필터
  - 반환 형태:
    { ok: true, points: Array<{ ts: string; value: number }>, total?: number, sampled?: boolean }
  - 차트 성능을 위해:
    - points가 5000개 초과면 downsample해서 최대 5000개만 반환(예: stride)
    - total, sampled 플래그 포함
- 에러 시:
  { ok:false, error:"..." }

요구사항 B) API: thread 생성 + snapshot 고정
2) Route 생성:
- statrumble/app/api/threads/create/route.ts (POST, JSON)
- 입력 body:
  { import_id: string, start_ts: string, end_ts: string }
- 검증:
  - start_ts/end_ts가 Date 파싱 가능
  - end_ts > start_ts
- 서버 동작:
  1) metric_imports에서 import_id로 row 조회하여 metric_id + workspace_id 확보
  2) RPC 호출:
     supabase.rpc("compute_snapshot", {
       p_import_id: import_id,
       p_start_ts: start_ts,
       p_end_ts: end_ts
     })
  3) arena_threads insert:
     { workspace_id, metric_id, import_id, start_ts, end_ts, snapshot: rpcResult }
     반환: inserted id
- 반환:
  { ok:true, thread_id:"uuid" }
- 실패:
  { ok:false, error:"..." }

요구사항 C) UI: 차트 + 구간 선택 + Create Thread
3) Client component 추가:
- statrumble/app/components/ImportChart.tsx (또는 ChartThreadCreator.tsx)
- 'use client'
- props로 imports(최신 10개 정도)를 app/page.tsx에서 내려받아 사용(서버 컴포넌트에서 listImports 호출)
- UI 구성:
  - Import 선택 dropdown(파일명 + created_at)
  - 선택되면 /api/imports/{id}/points GET으로 points 로딩
  - Recharts LineChart로 렌더
  - 구간 선택은 우선 Recharts <Brush> 사용 추천:
    - startIndex/endIndex 상태 유지
    - onChange로 선택된 index 업데이트
  - 선택 구간 start_ts/end_ts 표시
  - "Create Thread" 버튼:
    - 선택된 인덱스 기준으로 start_ts/end_ts 계산
    - 주의: DB 함수는 ts < end_ts 이므로, endIndex를 포함하려면:
      - end_ts = points[endIndex+1].ts (가능하면)
      - 마지막이면 end_ts = new Date(points[endIndex].ts).getTime()+1ms 로 ISO 생성
    - POST /api/threads/create 호출
    - 성공 시 next/navigation의 useRouter로 router.push(`/threads/${thread_id}`)
  - 로딩/에러 표시(포인트 로딩, 스레드 생성 중)

4) app/page.tsx 업데이트
- 이미 Upload 폼/목록이 있는 상태에서:
  - chart 섹션에 ImportChart 컴포넌트 렌더
  - imports는 서버에서 listImports(10) 호출한 결과를 props로 내려줘
- 캐시 문제 방지:
  - 이미 force-dynamic을 넣어뒀으면 유지
  - 없으면 상단에 export const dynamic="force-dynamic" 추가

요구사항 D) threads/[id] 최소 표시
5) statrumble/app/threads/[id]/page.tsx 업데이트(최소)
- thread id로 arena_threads 조회해서 snapshot/start/end를 화면에 간단히 표시
- snapshot은 <pre>{JSON.stringify(snapshot,null,2)}</pre> 정도면 충분
(메시지/투표는 Prompt 06에서 함)

6) 로그/검증
- docs/CODEX_LOG.md에 Prompt 05 기록 추가(원문/요약/체크리스트/(commit: TODO))
- pnpm -C statrumble lint/typecheck/verify 통과

DoD:
- /에서 sample.csv import 선택 → 차트가 뜬다
- Brush로 구간 선택 → Create Thread → /threads/{id} 이동
- DB의 arena_threads에 snapshot jsonb가 저장되어 있다(그리고 화면에 보여진다)

커밋 메시지:
- "feat: chart interval selection and thread creation with snapshot"
```
#### Result
- `statrumble/app/api/imports/[importId]/points/route.ts`를 추가해 세션 인증 기반 points 조회, optional `start_ts`/`end_ts` 필터, 최대 5000개 stride downsample(`total`, `sampled`) 응답을 구현했다.
- `statrumble/app/api/threads/create/route.ts`를 추가해 입력 검증 후 `metric_imports` 조회, `compute_snapshot` RPC 호출, `arena_threads` insert, `thread_id` 반환까지 구현했다.
- `statrumble/app/components/ImportChart.tsx`를 추가해 import 선택, points 로딩, Recharts `LineChart + Brush` 구간 선택, `Create Thread` 생성/이동(`router.push`) 흐름과 로딩/에러 표시를 구현했다.
- `statrumble/app/page.tsx`의 차트 섹션을 `ImportChart`로 연결하고 서버에서 받은 imports를 props로 전달하도록 업데이트했다(`dynamic = "force-dynamic"` 유지).
- `statrumble/app/threads/[id]/page.tsx`를 업데이트해 `arena_threads` 조회 후 `start_ts`, `end_ts`, `snapshot` JSON을 최소 표시하도록 구현했다.
#### Manual Checklist
- [ ] `/`에서 import 선택 시 차트 노출 동작 확인
- [ ] Brush 선택 후 `Create Thread`로 `/threads/{id}` 이동 확인
- [ ] `arena_threads.snapshot` DB 저장 및 상세 페이지 표시 확인
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Prompt 06 (commit: TODO)
#### Prompt
```text
[Prompt 06] Arena 스레드: 메시지/투표/Quote stats (statrumble/ 기준)

목표:
- /threads/[id] 페이지에서
  1) snapshot 요약 카드(선택구간/직전구간/변화) 표시
  2) 메시지 목록 + 작성(enter 전송)
  3) A/B/C 투표(1인 1표, 변경 가능) + 카운트
  4) Quote stats 버튼: snapshot 기반 문장 자동 생성 → 입력창에 삽입

요구사항 A) DB 헬퍼 추가 (statrumble/lib/db/)
1) statrumble/lib/db/threads.ts 생성
- getThread(threadId): arena_threads 단건 + snapshot/referee_report + metric(name,unit) join해서 반환

2) statrumble/lib/db/messages.ts 생성
- listMessages(threadId, limit=50): arena_messages 최신순 50개를 created_at ASC로 반환
- createMessage(threadId, content): 현재 user_id(auth.uid)로 insert
  - workspace_id는 thread에서 가져오거나(권장) thread row를 먼저 조회해서 사용

3) statrumble/lib/db/votes.ts 생성
- getVoteSummary(threadId):
  - A/B/C 각각 count 반환
  - 현재 유저의 내 투표(없으면 null)도 같이 반환
- upsertVote(threadId, stance):
  - (thread_id, user_id) unique 기반 upsert
  - workspace_id는 thread에서 가져오거나 thread row를 먼저 조회해서 사용

4) statrumble/lib/db/index.ts에 export 추가

구현 규칙:
- 서버에서만 실행. createServerClient 사용.
- workspace_id는 항상 thread의 workspace_id를 신뢰해서 사용(클라 입력 금지).

요구사항 B) API 라우트 (클라에서 호출할 부분만)
5) GET /api/threads/[id]/messages
- query: limit optional
- 응답: { ok:true, messages:[{id,user_id,content,created_at}] }

6) POST /api/threads/[id]/messages
- body: { content: string }
- 응답: { ok:true }

7) GET /api/threads/[id]/votes
- 응답: { ok:true, counts:{A:number,B:number,C:number}, my_stance: "A"|"B"|"C"|null }

8) POST /api/threads/[id]/votes
- body: { stance:"A"|"B"|"C" }
- 응답: { ok:true, my_stance:"A"|"B"|"C" }

(모든 라우트는 세션 필요. 에러는 {ok:false,error:"..."})

요구사항 C) /threads/[id] UI 완성
9) statrumble/app/threads/[id]/page.tsx
- 서버 컴포넌트로 thread 기본 정보(snapshot 포함) 로드해서 상단에 표시:
  - metric name/unit
  - 선택구간 avg, 직전 avg, delta.abs, delta.rel(%) , n
  - start/end 표시
- 아래에 클라이언트 컴포넌트 <ThreadArena threadId=... snapshot=... /> 렌더

10) statrumble/app/components/ThreadArena.tsx ('use client') 생성
- 상태:
  - messages, loadingMessages
  - voteCounts, myStance, voting
  - draft(입력창)
  - sending
- mount 시:
  - /api/threads/{id}/messages GET
  - /api/threads/{id}/votes GET
- 메시지 UI:
  - 메시지 목록(간단 카드)
  - 입력창(textarea 또는 input)
  - Enter 전송(shift+enter는 줄바꿈)
  - 전송 성공 시 메시지 다시 fetch (또는 optimistic append)
- 투표 UI:
  - A/B/C 버튼 3개 + 카운트 표시
  - 내 선택(myStance)은 강조
  - 클릭 시 POST /votes → 성공하면 counts 재fetch 또는 응답으로 업데이트
- Quote stats 버튼:
  - snapshot으로 문장 생성 후 draft 앞/뒤에 삽입
  - 예시 문장(국문/영문 아무거나 일관성 있게):
    "선택 구간 평균은 {sel.avg}({sel.n}개), 직전 구간 평균은 {bef.avg}({bef.n}개), 변화는 {delta.abs} / {delta.rel*100}%."
  - 숫자 포맷은 소수 2자리 정도로 정리
  - snapshot에 before.avg가 null이면 그에 맞게 문장 조정
- 에러 처리:
  - 메시지/투표 API 실패 시 사용자에게 간단히 표시

요구사항 D) 새로고침/갱신
11) 메시지 전송/투표 후:
- 간단하게는 fetch 재호출로 갱신(초기 MVP OK)
- 서버 캐시 문제 있으면 fetch에 cache:"no-store" 옵션

요구사항 E) 로그/검증
12) docs/CODEX_LOG.md에 Prompt 06 기록 추가(원문/요약/체크리스트/(commit: TODO))
13) pnpm -C statrumble lint/typecheck/verify 통과

DoD:
- /threads/[id]에서 snapshot 요약이 보인다
- 메시지 작성/표시가 된다(새로고침 후에도 유지)
- A/B/C 투표가 된다(카운트/내 선택 표시)
- Quote stats 버튼이 draft에 문장을 삽입한다

커밋 메시지:
- "feat: arena thread messaging, voting, and quote stats"
```
#### Result
- `statrumble/lib/db/threads.ts`, `statrumble/lib/db/messages.ts`, `statrumble/lib/db/votes.ts`를 추가해 thread 조회, 메시지 조회/작성, 투표 요약/업서트를 서버 전용 헬퍼로 구현했다.
- `statrumble/lib/db/index.ts`에 신규 DB 헬퍼 export를 추가했다.
- `statrumble/app/api/threads/[id]/messages/route.ts`, `statrumble/app/api/threads/[id]/votes/route.ts`를 추가해 세션 필수 API(GET/POST)와 `{ ok:false, error }` 응답 형식을 구현했다.
- `statrumble/app/threads/[id]/page.tsx`를 업데이트해 snapshot 요약 카드(선택/직전/변화/기간/metric)를 서버 렌더링하고 `ThreadArena`를 연결했다.
- `statrumble/app/components/ThreadArena.tsx`를 신규 생성해 메시지 목록/작성(Enter 전송), A/B/C 투표(1인 1표 변경), Quote stats 문장 삽입, 실패 메시지 표시를 구현했다.
#### Manual Checklist
- [x] `/threads/[id]` snapshot 요약 카드 표시 구현
- [x] 메시지 작성/표시 및 전송 후 재조회 구현
- [x] A/B/C 투표/카운트/내 선택 표시 구현
- [x] Quote stats 문장 삽입 구현
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Prompt 07 (commit: TODO)
#### Prompt
```text
[Prompt 07] Referee 버튼: OpenAI Responses + Structured Outputs(JSON Schema) + DB 저장 + UI 렌더

목표:
- /threads/[id]에서 "Referee" 버튼 클릭 시:
  1) thread snapshot + vote counts + 최근 메시지 N개를 서버에서 모아서
  2) OpenAI Responses API 호출(Structured Outputs로 JSON schema 강제)
  3) arena_threads.referee_report(jsonb)에 저장
  4) 화면에 보기 좋게 렌더링

참고(공식 스펙):
- Responses API에서 Structured Outputs는 text.format(type:"json_schema", strict:true, schema:...)를 사용한다.
- SDK에는 response.output_text(문자열) 헬퍼가 있다. (JSON이면 JSON.parse 가능)
(문서: developers.openai.com)

요구사항 A) Referee JSON Schema 정의
1) 파일 추가:
- statrumble/lib/referee/schema.ts
- export const refereeJsonSchema = { ... } (JSON Schema object literal)
- 스키마 요구:
  - 최상위 type: object, additionalProperties:false
  - required: ["tldr","data_facts","stances","confounders","next_checks","verdict"]
  - tldr: string (1문단 요약)
  - data_facts: array of { fact: string, support: string } (additionalProperties:false)
  - stances: object with required keys A,B,C
    - A/B/C 각각 { steelman: string, weakness: string } (additionalProperties:false)
  - confounders: string[]
  - next_checks: array of { what: string, why: string } (additionalProperties:false)
  - verdict:
    - leading: enum ["A","B","C","unclear"]
    - confidence_0_100: number [0..100]
    - reason: string
    - additionalProperties:false

요구사항 B) API: POST /api/threads/[id]/judge
2) 라우트 생성:
- statrumble/app/api/threads/[id]/judge/route.ts (POST)

동작:
- 세션 필수. supabase.auth.getUser()로 미로그인 401.
- thread 로드: lib/db/threads.getThread(threadId) 사용(없으면 404)
- vote 요약: lib/db/votes.getVoteSummary(threadId)
- 최근 메시지: lib/db/messages.listMessages(threadId, 30) (너무 길면 마지막 20개만 모델에 전달)
- OPENAI_API_KEY 없으면:
  - 500 + { ok:false, error:"OPENAI_API_KEY not set" }

OpenAI 호출:
- openai 패키지 사용
  - import OpenAI from "openai";
  - const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
- 모델:
  - 기본값 "gpt-5-mini"
  - env로 override 가능: process.env.OPENAI_REFEREE_MODEL
- 요청 형태(Responses API):
  await openai.responses.create({
    model,
    input: [
      { role:"system", content: "<Referee 역할/출력 규칙/금지사항>" },
      { role:"user", content: "<snapshot/votes/messages를 구조적으로 제공>" }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "referee_report",
        strict: true,
        schema: refereeJsonSchema
      }
    },
    temperature: 0.2,
    max_output_tokens: 1200,
    store: false
  })

- system content 지침(요지):
  - 너는 논쟁/데이터 해석의 Referee다.
  - 주어진 데이터(스냅샷/투표/메시지)만 근거로 쓴다. 모르면 confounders/next_checks에 적고 verdict는 unclear 가능.
  - 출력은 반드시 JSON만(스키마 준수). 모든 문자열은 가능한 한 한국어로.
  - 데이터 사실(data_facts)은 snapshot 수치/메시지에서 “직접” 뽑아라.

- user content에는 아래를 넣어라(가능하면 JSON-like로):
  - metric: {name, unit}
  - range: {start_ts, end_ts}
  - snapshot.selected/before/delta 전부
  - votes: {A,B,C, my_stance?}
  - messages: [{created_at, user_id, content}] (최근 N개)

응답 처리:
- const raw = response.output_text;
- const report = JSON.parse(raw);
- DB 저장:
  - supabase.from("arena_threads").update({ referee_report: report }).eq("id", threadId)
- 반환:
  { ok:true, report }

에러:
- OpenAI 호출 실패/JSON parse 실패/DB 실패는 { ok:false, error:"..." }로 통일

요구사항 C) UI: ThreadArena에 Referee 버튼 + 렌더
3) statrumble/app/components/ThreadArena.tsx 수정
- props에 initialRefereeReport(없으면 null) 추가
- state: refereeReport, judging(boolean), judgeError
- UI:
  - 투표 영역 근처에 "Run Referee" 버튼 추가
  - 클릭 시 POST /api/threads/{id}/judge
  - 로딩 표시
  - 성공 시 refereeReport state 업데이트
  - 실패 시 에러 표시

4) report 렌더 컴포넌트 추가(선택이지만 권장)
- statrumble/app/components/RefereeReportView.tsx ('use client' 아니어도 됨)
- report를 섹션별로 보기 좋게 렌더:
  - TL;DR
  - Data facts (bullet)
  - Stances A/B/C (steelman/weakness)
  - Confounders
  - Next checks
  - Verdict(leading/confidence/reason)

요구사항 D) /threads/[id] 서버 페이지에서 report 전달
5) statrumble/app/threads/[id]/page.tsx 수정
- getThread 결과에 referee_report가 있으니 ThreadArena에 initialRefereeReport로 넘긴다.
- 캐시 이슈 방지:
  - 페이지 상단에 export const dynamic = "force-dynamic" 추가(없으면)

요구사항 E) 문서/검증
6) README에 Referee 설정 한 줄 추가:
- statrumble/.env.local에 OPENAI_API_KEY 필요
- (선택) OPENAI_REFEREE_MODEL로 모델 변경 가능

7) docs/CODEX_LOG.md에 Prompt 07 기록 추가(원문/요약/체크리스트/(commit: TODO))

DoD:
- 스레드 화면에서 Referee 버튼 클릭 → 수 초 내 report 생성/표시
- 새로고침 후에도 referee_report가 DB에서 로드되어 그대로 보임
- pnpm -C statrumble lint/typecheck/verify 통과

커밋 메시지:
- "feat: referee judge via openai responses structured outputs"
```
#### Result
- `statrumble/lib/referee/schema.ts`를 추가해 Structured Outputs용 Referee JSON Schema와 `RefereeReport` 타입을 정의했다.
- `statrumble/app/api/threads/[id]/judge/route.ts`를 추가해 세션 검증, thread/votes/messages 수집, OpenAI Responses(`json_schema`, `strict:true`) 호출, `arena_threads.referee_report` 저장, 에러 일관 응답을 구현했다.
- `statrumble/app/components/RefereeReportView.tsx`를 추가해 Referee report를 TL;DR/Data facts/Stances/Confounders/Next checks/Verdict 섹션으로 렌더하도록 구현했다.
- `statrumble/app/components/ThreadArena.tsx`에 `initialRefereeReport`, `Run Referee` 버튼, `judging/judgeError/refereeReport` 상태 및 API 연동을 추가했다.
- `statrumble/app/threads/[id]/page.tsx`에 `export const dynamic = "force-dynamic"`를 추가하고 `initialRefereeReport`를 전달하도록 수정했다.
- `README.md`에 `.env.local`의 `OPENAI_API_KEY` 필요 및 `OPENAI_REFEREE_MODEL` 선택 설정 문구를 추가했다.
#### Manual Checklist
- [x] Referee JSON Schema 파일 추가
- [x] `/api/threads/[id]/judge` 구현 (OpenAI 호출 + DB 저장)
- [x] ThreadArena Referee 버튼/로딩/에러/결과 반영 구현
- [x] `/threads/[id]` 초기 report 전달 + force-dynamic 반영
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
#### Commit Link
- TODO

### Prompt ID: Hotfix 07a (commit: TODO)
#### Prompt
```text
[Hotfix 07a] Fix 400: remove unsupported temperature for gpt-5-mini (Responses API)

증상:
- Run Referee 시 400: Unsupported parameter "temperature" is not supported with this model.

원인:
- /api/threads/[id]/judge에서 openai.responses.create 호출에 temperature를 넣고 있음.
- 현재 모델(기본 gpt-5-mini)이 temperature를 지원하지 않아 400 발생.

작업:
1) statrumble/app/api/threads/[id]/judge/route.ts 수정
- openai.responses.create({...}) payload에서 temperature 필드를 제거한다.
- top_p를 쓰고 있으면 그것도 제거한다(혹시 같은 계열 제한일 수 있음).
- max_output_tokens, text.format(json_schema/strict/schema) 등은 유지한다.
- 나머지 로직(DB 저장/응답)은 그대로.

2) (선택) README에 "일부 모델은 temperature 미지원" 짧게 메모 추가.

3) docs/CODEX_LOG.md에 Hotfix 07a 기록 추가.

DoD:
- Run Referee 버튼 클릭 시 더 이상 400이 나지 않고 report가 생성/저장/표시된다.
- pnpm -C statrumble lint/typecheck/verify 통과.

커밋 메시지:
- "fix: remove unsupported temperature from referee request"
```
#### Result
- `statrumble/app/api/threads/[id]/judge/route.ts`의 `openai.responses.create` payload에서 `temperature`를 제거했다 (`top_p`는 기존에도 사용하지 않음).
- `README.md` Run Locally env 안내에 일부 모델의 샘플링 파라미터 미지원 가능성을 메모로 추가했다.
#### Manual Checklist
- [x] Referee 요청 payload에서 `temperature` 제거
- [x] (`top_p` 미사용 확인)
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
- [ ] Run Referee 400 해소 및 report 생성/저장/표시 동작 확인
#### Commit Link
- TODO

### Prompt ID: Hotfix 07b (commit: TODO)
#### Prompt
```text
[Hotfix 07b] Make Referee JSON parsing robust + minimize reasoning noise

증상:
- Run Referee → "Failed to parse referee JSON: Unterminated string ..."

원인 후보:
- 모델 출력에 JSON 외 텍스트가 섞이거나(예: Reasoning prefix), 줄바꿈/잡문이 끼어서 JSON.parse 실패
- 출력이 중간에 잘려 JSON이 닫히지 않음

작업:
1) statrumble/app/api/threads/[id]/judge/route.ts 수정 (핵심)
A) OpenAI 요청 파라미터 보강
- text는 format만 주지 말고 verbosity도 낮게:
  text: {
    verbosity: "low",
    format: { type:"json_schema", name:"referee_report", strict:true, schema: refereeJsonSchema }
  }
- GPT-5 계열 minimal reasoning 적용:
  reasoning: { effort: "minimal" }
- max_output_tokens는 너무 낮으면 잘리니 1800~2500으로 올려라(예: 2000)

B) JSON 파싱 방어 로직 추가
- const raw = (response.output_text ?? "").trim();
- JSON 후보만 추출:
  - const first = raw.indexOf("{");
  - const last = raw.lastIndexOf("}");
  - const candidate = (first !== -1 && last !== -1 && last > first) ? raw.slice(first, last + 1) : raw;
- JSON.parse(candidate)를 시도
- 실패하면:
  - 서버 로그에 raw 앞부분/뒷부분 일부(예: 300자씩)만 찍고(키/민감정보는 없음)
  - { ok:false, error:"Failed to parse referee JSON: ..." } 반환

C) (선택) 1회 재시도(fallback)
- 첫 파싱 실패 시에만 1번 더 호출:
  - 모델을 fallback으로 바꿔서 재시도 (기본: "gpt-4o-mini" 또는 env OPENAI_REFEREE_FALLBACK_MODEL)
  - 두 번째도 실패하면 최종 실패 반환

2) system prompt에 한 줄 추가(안전장치)
- "모든 string 필드는 줄바꿈 없이 한 줄로 작성(필요하면 \\n 사용)" 정도 추가

3) docs/CODEX_LOG.md에 Hotfix 07b 기록 추가

DoD:
- Run Referee가 성공해서 report 생성/저장/표시된다
- pnpm -C statrumble lint/typecheck/verify 통과

커밋 메시지:
- "fix: harden referee structured output parsing"
```
#### Result
- `statrumble/app/api/threads/[id]/judge/route.ts`에 `text.verbosity: "low"`, GPT-5 계열 `reasoning.effort: "minimal"`, `max_output_tokens: 2000`을 반영했다.
- JSON 파싱을 `output_text` 직접 parse에서 `raw trim -> JSON candidate 추출 -> parse` 방식으로 강화하고, 실패 시 raw/candidate 앞뒤 300자 스니펫을 서버 로그로 남기도록 추가했다.
- 1차 파싱 실패 시 fallback 모델(`OPENAI_REFEREE_FALLBACK_MODEL` 또는 기본 `gpt-4o-mini`)로 1회 재시도하도록 구현했다.
- system prompt에 "모든 string 필드는 줄바꿈 없이 한 줄" 제약을 추가했다.
#### Manual Checklist
- [x] low verbosity + minimal reasoning + max_output_tokens 상향 반영
- [x] JSON candidate 추출/파싱 방어 로직 반영
- [x] 파싱 실패 시 서버 로그 스니펫 추가
- [x] 1회 fallback 재시도 구현
- [x] `pnpm -C statrumble lint` 실행
- [x] `pnpm -C statrumble typecheck` 실행
- [x] `pnpm -C statrumble verify` 실행
- [ ] Run Referee 성공(생성/저장/표시) 수동 확인
#### Commit Link
- TODO

### Prompt ID: Prompt Hotfix (commit: TODO)
#### Prompt
```text
[Hotfix] Fix "Maximum update depth exceeded" right after OTP login

OTP 로그인 후 화면에서 "Maximum update depth exceeded"가 발생함. 원인 후보 탐색 및 정적 수정.
```
#### Result
- `app/components/ImportChart.tsx`에서 `useEffect`의 셋업 루프 위험 구간을 정리.
  - `useEffect`의 deps에서 상태값(`selectedImportId`)를 제거해 자기 참조 재평가를 최소화.
  - 포인트/메타 상태 업데이트를 `prev/next` 비교 가드로 감싸서 동일 데이터에 대한 불필요한 setState를 제거.
- 런타임 브라우저 재현은 현재 환경에서 `pnpm -C statrumble dev`가 포트 바인딩(`EPERM 0.0.0.0:3000`)으로 실행되지 않아 직접 확인 불가.
- 원인 후보로는 로그인 직후 Landing(`/`)에 마운트되는 `ImportChart`의 초기 `useEffect`/상태 갱신 경로를 우선 후보로 기록.
#### Manual Checklist
- [x] `rg -n "Maximum update depth"`, `router.(refresh|push|replace)`, `onAuthStateChange|getSession|getUser`, `useEffect\(` 패턴 탐색
- [x] 로그인 후 무한 루프 패턴으로 보이는 `useEffect` 상태 갱신 구간에서 prev/next 가드 적용
- [x] `pnpm -C statrumble lint`
- [x] `pnpm -C statrumble typecheck`
- [x] `bash scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Follow-up Hotfix (commit: TODO)
#### Prompt
```text
[Follow-up Hotfix] Validate max update-depth fix + enable reproduction

- loopback bind로 dev 재현 시도
- ImportChart/ThreadArena의 max update-depth 패턴 점검
- 필요 시 dev-only render loop detector 추가
```
#### Result
- 런타임 재현 시도 결과:
  - `pnpm -C statrumble dev -- --hostname 127.0.0.1 --port 3000` 실패 (Next CLI 인자 파싱으로 `--hostname`을 프로젝트 경로로 해석)
  - `HOSTNAME=127.0.0.1 PORT=3000 pnpm -C statrumble dev`도 `listen EPERM ... 0.0.0.0:3000` 실패
  - 현재 sandbox는 소켓 listen이 제한되어 브라우저 런타임 재현 불가
- 의심 원인/패턴:
  - 로그인 직후 landing에서 마운트되는 `ImportChart`의 props->state 동기화 effect + 연속 setState 경로에서 반복 렌더 유발 가능성
- 수정 전략:
  - `ImportChart`:
    - props 기반 선택 ID 동기화 effect를 ID primitive(`firstImportId`, `importIdsKey`) 의존으로 고정
    - 선택 ID는 `prev/next` 가드로 값이 달라질 때만 업데이트
  - `ThreadArena`:
    - 메시지/투표 응답 반영 시 `prev/next` 비교 가드로 동일 payload 재설정 방지
  - `ImportChart`/`ThreadArena` 공통:
    - `NEXT_PUBLIC_DEBUG_RENDER_LOOP=1`일 때만 동작하는 render counter 추가(60회 초과 시 `console.error`)
- 실제 브라우저 검증 방법(OTP 로그인 후):
  1. `NEXT_PUBLIC_DEBUG_RENDER_LOOP=1 pnpm -C statrumble dev` 실행
  2. OTP 로그인 완료 후 `/` 또는 next 리다이렉트 페이지 진입
  3. 화면 정상 렌더 확인 + 콘솔에 `render count exceeded 60` 에러 미발생 확인
  4. Import 변경, Brush 드래그, Thread 생성 버튼 동작 확인
#### Manual Checklist
- [x] loopback/hostname 기반 dev 실행 시도
- [x] `rg -n "useEffect\(" statrumble/app/components`로 effect 전수 점검
- [x] `ImportChart`/`ThreadArena`에 deps/prev-next 가드 적용
- [x] env-gated render loop detector 추가
- [ ] 실제 OTP 브라우저 재현(샌드박스 제한으로 미실행)
#### Commit Link
- TODO

### Prompt ID: Prompt Auth Rate Limit UX (commit: TODO)
#### Prompt
```text
Auth email rate limit 대응 UX 추가:
- Send Magic Link 버튼 클릭 후 60초 쿨다운(버튼 disable + 카운트다운)
- Supabase 429/“email rate limit exceeded” 에러를 친절하게 표시:
  "Too many login emails. Use the last email you received or try again later."
- 네트워크 응답에서 endpoint(/auth/v1/otp vs /signup 등) 로그로 남기기
```
#### Result
- `statrumble/app/login/page.tsx`에 Magic Link 제출 후 60초 쿨다운(`disabled` + 초 단위 카운트다운)을 추가했다.
- Supabase OTP 요청 오류에서 `status === 429` 또는 `email rate limit exceeded` 메시지를 감지해 친화적인 문구로 치환했다.
- `statrumble/lib/supabase/client.ts`에 브라우저 Supabase 클라이언트용 `fetch` 래퍼를 추가해 auth 응답의 endpoint(`pathname`)와 상태코드를 콘솔 로그로 남기도록 했다.
#### Manual Checklist
- [x] Send Magic Link 60초 쿨다운 UI/동작 반영
- [x] 429 / email rate limit exceeded 에러 문구 치환
- [x] auth endpoint 응답 로그 추가
- [x] `npm run lint` 실행
- [x] `npm run typecheck` 실행
- [x] `./scripts/verify.sh` 실행
#### Commit Link
- TODO

### Prompt ID: Prompt Dev Auth Unblock (commit: TODO)
#### Prompt
```text
[Dev Auth Unblock] Add password login for development only

- Goal: avoid Supabase email rate limits; keep Magic Link but add dev-only password login.

1) Login UI:
- Add email+password form and a "Sign in with password" button.
- Call supabase.auth.signInWithPassword({ email, password }).
- Show this form only when NEXT_PUBLIC_DEV_PASSWORD_LOGIN=1 (or NODE_ENV=development).

2) Magic Link UX hardening:
- Disable "Send Magic Link" for 60 seconds after click (countdown).
- If error contains "email rate limit exceeded" / 429:
  show message: "Email sending is rate-limited. Use dev password login or try later."
- No auto-retry.

3) docs/CODEX_LOG.md:
- Document how to create the dev user in Supabase Dashboard and how to enable the env flag.
```
#### Result
- `statrumble/app/login/page.tsx`에 Magic Link 흐름과 분리된 dev 전용 password 로그인 폼을 추가했다.
- Password 로그인은 `NEXT_PUBLIC_DEV_PASSWORD_LOGIN=1` 또는 `NODE_ENV=development`일 때만 노출되며, `supabase.auth.signInWithPassword({ email, password })`를 사용한다.
- Magic Link는 클릭 즉시 60초 쿨다운(버튼 비활성 + 카운트다운)을 유지하고, 429 / `email rate limit exceeded` 감지 시 메시지를 `Email sending is rate-limited. Use dev password login or try later.`로 고정했다.
- `.env.example`에 `NEXT_PUBLIC_DEV_PASSWORD_LOGIN=0` 플레이스홀더를 추가했다.
- Dev user 생성/활성화 방법:
  1. Supabase Dashboard -> Authentication -> Users -> Add user.
  2. 테스트용 이메일/비밀번호를 입력하고 사용자 생성(필요 시 Email Confirmed로 설정).
  3. 로컬 `.env.local`에 `NEXT_PUBLIC_DEV_PASSWORD_LOGIN=1` 설정 후 앱 재시작.
  4. 배포/공유 환경에서는 `NEXT_PUBLIC_DEV_PASSWORD_LOGIN`을 `0` 또는 미설정으로 유지.
#### Manual Checklist
- [x] dev 전용 password 로그인 UI 추가
- [x] `signInWithPassword` 호출 추가
- [x] password 폼 노출 조건(env flag/development) 반영
- [x] Magic Link 60초 쿨다운 유지
- [x] 429/rate-limit 메시지 문구 요구사항대로 반영
- [x] `npm run lint` 실행
- [x] `npm run typecheck` 실행
- [x] `./scripts/verify.sh` 실행
#### Commit Link
- TODO

### Prompt ID: Bugfix 2026-02-22-01 (commit: TODO)
#### Prompt
```text
[Bugfix] votes fetch loop after clicking vote (ThreadArena initiator)

Symptom:
- After clicking a vote, Network shows repeated GET fetches to "votes" endpoint (200).
- Console shows render loop detector warning in ThreadArena.

Goal:
- A vote click should trigger at most:
  - 1 write request (POST/PUT)
  - optional 0~1 follow-up GET (or state update)
- No continuous polling / no request loop.

Steps:
1) Identify the exact fetch caller:
- In browser DevTools, open one repeated "votes" request → Initiator tab
- Note the exact file:line (likely app/components/ThreadArena.tsx:???)
- Fix the code at that line.

2) Fix common anti-patterns in ThreadArena.tsx:
- Ensure fetchVotes() is NOT called from:
  - component body render
  - useEffect that depends on votes state
  - useEffect that runs every render (missing deps)
  - interval/timer without proper cleanup
- fetchVotes should run ONLY on:
  - [threadId] change
  - manual Refresh click (refreshNonce)
  - optional: after successful vote submit (one-shot)

3) Implement a refreshNonce pattern:
- Add state: const [refreshNonce, setRefreshNonce] = useState(0)
- Manual refresh: setRefreshNonce(n => n + 1)
- useEffect(() => fetchVotes(), [threadId, refreshNonce])  // no votes in deps
- Guard setVotes with a stable signature compare (counts + myVote), not reference.

4) Prevent overlapping requests:
- Use AbortController or an inFlight ref so repeated triggers don’t stack:
  - if (inFlight.current) return
  - finally set inFlight.current = false

5) Verify:
- Clicking vote produces exactly 1 write request and then settles.
- No more repeated GETs.
- Keep debug render detector but switch it to time-window based (renders/sec), not total renders.
- Log root cause + fix in docs/CODEX_LOG.md
```
#### Result
- Root fetch initiator is the votes loading effect in `statrumble/app/components/ThreadArena.tsx` (now `useEffect` at `statrumble/app/components/ThreadArena.tsx:274` invoking `fetchVotes` at `statrumble/app/components/ThreadArena.tsx:230`).
- Root cause: vote refresh could be triggered through multiple paths without a dedicated nonce gate or overlap protection (`POST` path + shared data-loading effect), which allowed stacked/re-entrant votes GET calls during rapid updates.
- Added `refreshNonce` and changed vote fetching to run only from `[threadId, refreshNonce]` effect; manual vote refresh and post-vote success now increment nonce instead of directly calling fetch.
- Added in-flight guard + `AbortController` support in vote fetch, and moved vote state updates behind a stable signature compare (`A/B/C` counts + `my_stance`).
- Updated debug render detector from total render count to time-window render rate (renders/sec).
- Verification: `npm run lint` (pass), `npm run typecheck` (pass), `./scripts/verify.sh` from repo root (pass).
#### Manual Checklist
- [x] Identified and fixed votes fetch caller in `ThreadArena.tsx`
- [x] Added `refreshNonce`-driven vote refresh flow
- [x] Removed direct post-vote `fetchVotes()` call and replaced with one-shot nonce trigger
- [x] Added in-flight/abort protection for vote GET
- [x] Switched render loop detector to time-window renders/sec
- [x] `npm run lint` executed
- [x] `npm run typecheck` executed
- [x] `./scripts/verify.sh` executed
#### Commit Link
- TODO

### Prompt ID: Plan-2026-02-22-Phase-1 (commit: TODO)
#### Prompt
```text
PHASE 1) SECURITY HOTFIX: enforce workspace membership (block URL access)

Goal:
- Non-members cannot read/write threads/messages/votes/imports even with direct URL.
- Do real multi-user repro via Chrome normal(User A) + Incognito(User B) (or another browser).

Tasks:
1) Repro:
- A creates thread, copy /threads/[id]
- B opens URL and tries: load thread/messages/votes, post message, cast vote
Expected: denied (404/permission) and cannot write.

2) Audit for RLS bypass:
- rg -n "SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY" statrumble
- Remove service-role usage from any user-facing page/route. Use session-based anon client.

3) RLS policy audit & enforcement:
- Ensure membership checks exist for:
  arena_threads, thread_messages, thread_votes, imports, metric_points, (future) decision_cards
- Use workspace_members exists(auth.uid()) pattern.
- If child tables lack workspace_id, join through arena_threads in policy.

4) App behavior:
- When select returns 0 rows (RLS blocked), treat as 404 (don’t leak existence).
- Writes should fail cleanly for non-members.
```
#### Result
- Added `statrumble/supabase/migrations/001_authz_workspace_membership.sql`:
  - `handle_new_user()` changed to no-op so membership is explicit (invite/join) instead of auto-added.
  - Hardened RLS policies for `metric_imports`, `metric_points`, `arena_threads`, `arena_messages`, `arena_votes`, `decision_cards` with `workspace_members` membership checks plus parent-row consistency checks.
- Updated route behavior so RLS-blocked resources return 404 and do not leak existence:
  - `statrumble/app/api/threads/[id]/messages/route.ts`
  - `statrumble/app/api/threads/[id]/votes/route.ts`
  - `statrumble/app/api/imports/[importId]/points/route.ts`
- Updated DB write helpers to treat RLS-blocked thread lookup as not found:
  - `statrumble/lib/db/messages.ts`
  - `statrumble/lib/db/votes.ts`
- RLS bypass grep audit executed with no `service_role` usage found:
  - `rg -n "SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY" statrumble` -> no matches.
- Multi-user Chrome repro status:
  - Not executable in this sandbox due local server listen restrictions (`listen EPERM`), so browser-normal/incognito validation is pending manual run in a local non-sandbox environment.
#### Manual Checklist
- [x] RLS policy hardening migration added for thread/message/vote/import/points/decision tables
- [x] `service_role` usage audit executed (no matches)
- [x] RLS-blocked thread/import reads now map to 404 in app routes
- [x] Non-member writes fail cleanly without existence leak
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Chrome normal/incognito multi-user repro (blocked in sandbox; pending manual)
#### Commit Link
- TODO

### Prompt ID: Plan-2026-02-22-Phase-2 (commit: TODO)
#### Prompt
```text
PHASE 2) SCHEMA PREP (NO BEHAVIOR CHANGE): thread visibility flag

Goal:
- Prepare for separating public vs invite/work threads later.
- Keep current behavior unchanged: all threads effectively workspace-private.

Tasks:
1) Migration:
- Add arena_threads.visibility: 'workspace'|'invite'|'public' default 'workspace' not null
- Add index (workspace_id, visibility, created_at) for future listing

2) Types/UI:
- Update TS types if any
- Thread creation sets visibility='workspace' (or rely on default)

3) Docs:
- Note: public threads require public-data policy (do not expose private imports/snapshots yet)
```
#### Result
- Added `statrumble/supabase/migrations/002_arena_threads_visibility.sql`:
  - `arena_threads.visibility` text column with default `'workspace'`, backfill for null rows, `NOT NULL`, and check constraint for `workspace|invite|public`.
  - Added index: `idx_arena_threads_workspace_visibility_created_at` on `(workspace_id, visibility, created_at)`.
- Updated thread typing and select projection:
  - `statrumble/lib/db/threads.ts` now includes `visibility` in the selected row shape.
- Updated thread creation to be explicit and behavior-stable:
  - `statrumble/app/api/threads/create/route.ts` inserts `visibility: 'workspace'`.
- Added docs note for future public-thread policy requirements:
  - `README.md` Notes section now states that public visibility still requires separate public-data policies.
#### Manual Checklist
- [x] visibility schema migration added (default + not null + constrained values)
- [x] listing index `(workspace_id, visibility, created_at)` added
- [x] TS thread row type/select updated
- [x] thread create path sets `visibility='workspace'`
- [x] docs note added for future public-data policy requirements
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Plan-2026-02-22-Phase-3 (commit: TODO)
#### Prompt
```text
PHASE 3) COLLAB MVP: workspace invite_code + /join flow

Goal:
- Provide a legitimate way for other users to join and see threads/imports.

Tasks:
1) DB:
- workspaces.invite_code unique + optional invite_enabled
- RPC/API join by code -> insert workspace_members(workspace_id, auth.uid())

2) UI:
- /workspace (or /settings/workspace): show invite code + copy
- /join: enter code -> join -> redirect to imports/threads list

DoD:
- User B joins via code and can access A’s workspace threads/imports
- Non-member C still cannot access via URL
```
#### Result
- Added `statrumble/supabase/migrations/003_workspace_invite_code_join.sql`:
  - `workspaces.invite_code` + unique index, `invite_enabled` flag.
  - `generate_workspace_invite_code()` helper.
  - `join_workspace_by_code(p_invite_code text)` SECURITY DEFINER RPC inserting `workspace_members(workspace_id, auth.uid())`.
- Added workspace invite data helper:
  - `statrumble/lib/db/workspaces.ts` (`getDefaultWorkspaceInvite`).
- Added API join endpoint:
  - `statrumble/app/api/workspaces/join/route.ts`.
- Added UI pages/components:
  - `statrumble/app/workspace/page.tsx` (invite code display + copy button).
  - `statrumble/app/join/page.tsx` (code input + join submit + redirect to `/`).
  - `statrumble/app/components/InviteCodeCopyButton.tsx`.
  - Navigation links in `statrumble/app/layout.tsx` for `/workspace` and `/join`.
- Non-member access model after Phase 1 + Phase 3:
  - Non-members remain blocked by RLS/404 on direct URLs.
  - Users can now become members only via invite-code join flow.
- Multi-user browser DoD status:
  - Not executable in this sandbox due local server listen restriction (`listen EPERM`).
  - Functional validation of SQL/API flow completed via static/code-path verification; browser A/B/C scenario is pending manual run locally.
#### Manual Checklist
- [x] `invite_code` + `invite_enabled` schema changes added
- [x] secure join RPC added and granted to authenticated users
- [x] join API route added
- [x] `/workspace` invite UI added (show + copy)
- [x] `/join` form flow added (join + redirect)
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Real browser multi-user A/B/C repro (blocked in sandbox; pending manual)
#### Commit Link
- TODO

### Prompt ID: Next-2026-02-22-Workspace-Auth-Active-Onboarding (commit: TODO)
#### Prompt
```text
[Next] Fix workspace page auth + add active-workspace selection

1) /workspace must only show workspaces the user is a member of
- Query workspaces via workspace_members filter (user_id = auth.uid()).
- If none, show "No workspace membership" + link to /join.
- Ensure invite_code is not visible to non-members.

2) Implement active workspace
- Load list of member workspaces
- Store selected workspace_id in localStorage/cookie
- Add nav dropdown switcher
- Make imports/threads list + create use active workspace_id

3) Onboarding
- If user has 0 workspaces, provide "Create workspace" flow OR auto-create personal workspace on first login.
- Do NOT auto-join all users into a shared Default workspace.

Commit(s) separated:
- fix(workspace): restrict workspace page to members
- feat(workspace): active workspace selector
- feat(onboarding): create personal workspace when none
```
#### Result
- Unrelated dirty changes were inspected first and reconciled:
  - Reverted `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `statrumble/package.json` (out-of-scope dependency/CLI changes).
  - Removed untracked `statrumble/supabase/.temp/`.
- Member-restricted workspace page commit:
  - `/workspace` now queries membership via `workspace_members` + `auth.uid()` and only renders workspaces the user belongs to.
  - If none, shows `No workspace membership` and `/join` link.
- Active workspace selector commit:
  - Added active workspace cookie/localStorage keys and `/api/workspaces/active` setter route.
  - Added nav dropdown workspace switcher in layout.
  - Active workspace is resolved from cookie + membership validation.
  - Metrics/imports/points/thread listing/thread creation now scope to active workspace.
  - Home now shows active-workspace threads list.
  - Join flow sets active workspace cookie/localStorage on success.
- Onboarding commit:
  - Added `ensure_personal_workspace()` migration RPC to create a personal workspace + owner membership when user has zero memberships.
  - Layout invokes onboarding ensure step for authenticated users before loading workspace selection.
#### Manual Checklist
- [x] Inspected and reverted unrelated `pnpm`/package/workspace changes
- [x] Removed `statrumble/supabase/.temp/` from working tree
- [x] `/workspace` access/listing restricted to member workspaces
- [x] Active workspace selector added (cookie + localStorage)
- [x] imports/threads listing + thread create use active workspace
- [x] Personal workspace auto-create onboarding added for zero-membership users
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- 9740066 (`fix(workspace): restrict workspace page to members`)
- 8001d02 (`feat(workspace): active workspace selector`)
- TODO (`feat(onboarding): create personal workspace when none`)

### Prompt ID: UX-Onboarding-2026-02-22 (commit: TODO)
#### Prompt
```text
[UX/Onboarding] Make "no workspace membership" non-scary + add Create Workspace

Goal:
- If user has no workspace membership, do NOT render the dashboard components that error.
- Show a clean onboarding view with:
  1) Join workspace (invite code)
  2) Create workspace (personal/work)

Phase A) UI gating (no behavior change in DB yet)
1) Detect membership once at the top-level page (server component preferred):
- If no membership:
  - Render only an OnboardingCard (Join + Create buttons)
  - Hide/skip CSV upload, imports list, chart, thread list, metrics cards.
  - Remove red "조회 실패" blocks; replace with friendly copy.

2) Workspace page:
- If no membership, show only "Go to Join" + "Create workspace" CTA
- Do not attempt to load invite_code (avoid extra errors).

Phase B) Create workspace flow (bootstrap)
1) Add RPC (security definer) to create a workspace + membership in one call:
- create_workspace(name text) returns workspace_id + invite_code
- Implementation:
  - insert into workspaces (name, invite_code, invite_enabled=true)
  - insert into workspace_members (workspace_id, auth.uid(), role='owner')
- Ensure it works even when user has 0 memberships.

2) Add API route /api/workspaces/create calling the RPC with session-based client.
3) Add /create-workspace page or modal:
- input workspace name
- call create
- redirect to /workspace and/or set active workspace.

Phase C) Optional polish
- After successful join/create, redirect to main dashboard.
- Add a “Switch workspace” dropdown later (active workspace), but not required for MVP unblock.

Commit separation:
- fix(ux): gate dashboard when no workspace membership
- feat(workspace): create workspace bootstrap flow
```
#### Result
- Phase A UI gating:
  - Added `statrumble/app/components/OnboardingCard.tsx` with Join/Create CTA.
  - Updated `statrumble/app/page.tsx` to detect membership once (`listMemberWorkspaceSummaries`) and short-circuit render to onboarding when membership is empty.
  - Dashboard sections (CSV/chart/threads/metrics/imports) are skipped entirely when no membership.
  - Updated `statrumble/app/workspace/page.tsx` to avoid invite-code loading path when membership is empty and show onboarding + `Go to Join` + `Create workspace` CTA.
  - Removed layout auto-bootstrap call so zero-membership users can actually see onboarding (`statrumble/app/layout.tsx`).
- Phase B create flow:
  - Added migration `statrumble/supabase/migrations/005_create_workspace_rpc.sql` with `create_workspace(p_name text)` SECURITY DEFINER RPC returning `(workspace_id, invite_code)` and creating owner membership.
  - Added API route `statrumble/app/api/workspaces/create/route.ts` to call RPC via session client and set active workspace cookie.
  - Added page `statrumble/app/create-workspace/page.tsx` (name input -> create -> store localStorage active workspace -> redirect `/`).
#### Manual Checklist
- [x] No-membership dashboard gating applied
- [x] Friendly onboarding card shown instead of red dashboard errors
- [x] Workspace page no-membership CTA path added (Join + Create)
- [x] `create_workspace` RPC migration added
- [x] `/api/workspaces/create` added
- [x] `/create-workspace` UI added
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- 3c5c5f4 (`fix(ux): gate dashboard when no workspace membership`)
- TODO (`feat(workspace): create workspace bootstrap flow`)

### Prompt ID: Onboarding-Unblock-2026-02-22 (commit: TODO)
#### Prompt
```text
[Unblock onboarding] Make new users land in a workspace after Join/Create

Goal:
- A brand-new account can:
  1) Create workspace (no invite needed) OR Join by invite code
  2) Immediately see that workspace and proceed to dashboard (imports/threads)
- No dead-end "No workspace membership" after successful join/create.

Phase 1) Fix create_workspace RPC not found
1) Verify DB has the function signature expected by client:
- If client calls rpc('create_workspace', { p_name }), then DB function must be:
  create_workspace(p_name text) returns workspace_id + invite_code
- If DB uses (name text), then change client to pass { name } instead of { p_name }.

2) Ensure migration exists and is applied:
- Add/verify migration that creates public.create_workspace(...)
- User will run `npx -y supabase db push` after merge; document this in CODEX_LOG/README.

Phase 2) Make Join/Create set active workspace and redirect
Option A (simplest now): no “active workspace” feature yet; just pick first membership
- On every server page load, fetch user's workspace memberships.
- If count >=1, treat the first workspace as current and render dashboard.
- If count ==0, show onboarding screen only.

Option B (better): set cookie "sr_workspace_id"
- After join/create API returns workspace_id, set cookie in the API response.
- Server uses cookie to select workspace; fallback to first membership if cookie missing/invalid.

Required UX:
- After successful /join:
  - redirect to /workspace and show membership list (including the joined one)
  - and/or redirect to / (dashboard) that now loads with that membership
- After successful create:
  - user becomes owner member
  - redirect to /workspace or / and dashboard loads.

Phase 3) Reduce scary screens
- If no membership: do NOT call imports/threads/metrics APIs; render only Join/Create CTA.

Commits:
- fix(workspace): restore create_workspace RPC and align rpc arg names
- fix(onboarding): after join/create, user lands in a workspace (no dead-end)
- fix(ux): gate dashboard when no membership
```
#### Result
- Phase 1 (`a8cd242`): restored and aligned `create_workspace` RPC contract.
  - Added migration `statrumble/supabase/migrations/006_restore_create_workspace_rpc.sql` with `public.create_workspace(name text)` returning `(workspace_id, invite_code)`.
  - Updated `statrumble/app/api/workspaces/create/route.ts` to call `rpc("create_workspace", { name })`.
  - Updated `README.md` migration section with `npx -y supabase db push` guidance and onboarding RPC note.
- Phase 2 (`f0d1ded`): join/create now land users in workspace view.
  - `statrumble/app/join/page.tsx` now redirects to `/workspace` after success.
  - `statrumble/app/create-workspace/page.tsx` now redirects to `/workspace` after success.
  - Active workspace cookie/localStorage behavior remains in place, preventing dead-end onboarding.
- Phase 3 (`fix(ux)` commit below): hardened no-membership gating path.
  - `statrumble/app/page.tsx` wraps membership check defensively and renders onboarding-only view on no-membership/fetch-failure.
  - `statrumble/app/workspace/page.tsx` no longer renders an empty member section when membership is zero.
#### Manual Checklist
- [x] `create_workspace` RPC signature and client arg names aligned
- [x] migration apply guidance added (`npx -y supabase db push`)
- [x] join/create success redirects land user in workspace context
- [x] no-membership path skips dashboard data APIs and shows onboarding CTA only
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- a8cd242 (`fix(workspace): restore create_workspace RPC and align rpc arg names`)
- f0d1ded (`fix(onboarding): after join/create, user lands in a workspace (no dead-end)`)
- TODO (`fix(ux): gate dashboard when no membership`)

### Prompt ID: Workspaces-Hub-2026-02-23 (commit: TODO)
#### Prompt
```text
[Codex Prompt] Add /workspaces hub page UI and redirect /workspace -> /workspaces (UI-only)

현 상태(확정):
- UI 라우트는 statrumble/app/workspace/page.tsx만 존재
- statrumble/app/workspaces/page.tsx, statrumble/app/components/WorkspacesHub.tsx 는 없음
- API는 statrumble/app/api/workspaces/* 는 존재

목표:
1) /workspaces 페이지 추가 (허브)
   - 내가 속한 workspace 목록 표시 (role, joined_at, invite_code, invite_enabled)
   - active workspace 표시 + 전환 버튼
   - leave workspace 버튼
   - Create/Join 페이지로 이동 버튼
2) /workspace(단수)는 /workspaces로 리다이렉트 처리
   - statrumble/app/workspace/page.tsx에서 redirect('/workspaces') 형태로
3) 상단 네비/링크도 가능하면 /workspaces로 통일

구현 힌트:
- 기존에 workspace 목록/active 해석 유틸이 있으면 재사용하고, 없으면 최소 구현
- 서버 컴포넌트 + 클라이언트 컴포넌트 분리:
  - app/workspaces/page.tsx: 서버에서 user + memberships 로드
  - app/components/WorkspacesHub.tsx: 전환/leave 액션(fetch to API)
- leave 후 active 폴백 처리(남은 membership 중 첫 번째 등)는 API 또는 클라이언트에서 처리

완료 조건:
- /workspaces 접속 시 허브 UI가 뜬다
- /workspace 접속 시 /workspaces로 이동된다
- pnpm run lint / pnpm run typecheck 통과
- 변경사항은 커밋 1개로 정리
```
#### Result
- `/workspaces` 허브 서버 페이지와 `WorkspacesHub` 클라이언트 컴포넌트를 추가해 멤버십 목록/활성/전환/Leave UI를 구성했다.
- `/workspace`는 `/workspaces`로 리다이렉트하도록 변경하고, 상단 네비 및 join/create 리다이렉트를 `/workspaces`로 통일했다.
- Leave 동작을 위한 API와 self-delete RLS 정책을 추가하고, 남은 멤버십 기반 활성 워크스페이스 쿠키 폴백을 처리했다.
#### Manual Checklist
- [x] `pnpm run lint`
- [x] `pnpm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Leave-RPC-2026-02-23 (commit: TODO)
#### Prompt
```text
[Codex Prompt] Refactor leave flow to use leave_workspace RPC; remove/limit self-delete RLS policy

목표:
- Leave는 반드시 DB RPC leave_workspace를 통해서만 수행되게 하여
  "마지막 owner leave 차단" 등 비즈니스 로직이 우회되지 않게 한다.
- workspace_members self-delete RLS 정책에 의존하지 않도록 만든다(또는 최소화).

해야 할 일:
1) statrumble/app/api/workspaces/leave/route.ts
   - 직접 delete를 하고 있다면 제거
   - supabase.rpc('leave_workspace', { p_workspace_id: ... }) 형태로 호출로 변경
   - 성공 시 active workspace 폴백 처리 유지
2) WorkspacesHub 클라이언트도 leave는 위 API만 호출하게 유지
3) 새로 만든 RLS policy migration(007_workspace_members_leave_policy.sql)이 불필요해지면:
   - 새 migration(다음 번호)으로 해당 policy를 drop 하거나
   - 최소한 범위를 엄격히 줄여서(본인 row delete만) 리스크를 낮춰라
4) migration 번호 충돌 가능성 점검:
   - 이미 007이 있으면 새 migration은 008/009 등으로 맞춰라
```
#### Result
- Leave API를 `leave_workspace` RPC 호출로 변경하고, 성공 시 active workspace 폴백 처리 흐름을 유지했다.
- `leave_workspace` RPC를 추가하고, `workspace_members` self-delete 정책을 드롭하는 migration을 추가했다.
#### Manual Checklist
- [x] `pnpm run lint`
- [x] `pnpm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Fix-Workspace-Create-2026-02-23 (commit: TODO)
#### Prompt
```text
Fix app/api/workspaces/create/route.ts:
- workspaceName is not defined causing 500.
- Parse req.json() and derive workspaceName from body.name (trim + validation).
- Call supabase.rpc("create_workspace", { p_name: workspaceName }).
- Return 400 if workspaceName empty.
Keep lint/typecheck passing.
```
#### Result
- Derived `workspaceName` from the request body, validated empty names, and used it in the `create_workspace` RPC call.
- Verified lint, typecheck, and project verify script.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Disable-Last-Owner-Leave-2026-02-23 (commit: TODO)
#### Prompt
```text
[Codex Prompt] Disable "Leave workspace" when user is last owner; show helpful message

Goal:
- In WorkspacesHub UI, if current user is the only owner of a workspace, do not allow leave.
- Instead disable the Leave button and show a Korean message:
  "마지막 owner라서 나갈 수 없습니다. 다른 owner를 지정하거나 워크스페이스를 삭제하세요."

Implementation:
- Determine last-owner status from memberships data (count owners per workspace).
- Keep server-side guard in leave_workspace RPC as-is (still enforce in DB).
- Update UI to prevent pointless POST and to show clear guidance.
```
#### Result
- Added a workspace owner-count RPC and surfaced `owner_count` on member workspace rows to detect last-owner 상태.
- Disabled Leave in the hub when the user is the only owner and displayed the requested Korean guidance.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Promote-Workspace-Owner-2026-02-23 (commit: TODO)
#### Prompt
```text
[Codex Prompt] Add minimal member role management (promote to owner) for workspace

Goal:
- Allow an existing owner to promote a member to owner so the original owner can leave.

DB:
- Add RPC: promote_workspace_member(p_workspace_id uuid, p_user_id uuid, p_role text)
  - Only current owners can call
  - p_role limited to ('member','owner')
  - Prevent demoting/removing last owner (same guard idea)

UI:
- On WorkspacesHub (or workspace settings page), show members list + promote button.
- Keep simple: only "Promote to owner" action is enough for now.
```
#### Result
- Added member list + role update RPCs with owner-only checks and last-owner guard.
- Loaded active workspace members for owners and wired a Promote to owner action in the hub UI.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Fix-Workspace-Members-Ambiguous-User-Id-2026-02-24 (commit: TODO)
#### Prompt
```text
[Codex Prompt] Fix "column reference user_id is ambiguous" in workspace members listing

Symptom:
- Workspaces page Members section fails: "column reference 'user_id' is ambiguous"

Goal:
- Make the members list query/RPC unambiguous and return members correctly.

Tasks:
1) Find the RPC/view used to load workspace members (search migrations + API routes).
2) In the SQL, qualify every user_id reference with table aliases (e.g., wm.user_id, p.user_id).
   - Avoid unqualified `user_id` in SELECT/JOIN/WHERE.
3) If the function is PL/pgSQL with RETURNS TABLE(user_id ...), either:
   - rename output column to member_user_id, OR
   - add `#variable_conflict use_column`, BUT still prefer explicit aliases.
4) Add a new migration to apply the fix (do not edit already-applied migrations).
5) Ensure UI shows at least the current owner as a member after fix.

After:
- pnpm exec supabase db push
- Retest Members section loads without errors.
```
#### Result
- Replaced the members RPC with a drop + recreate migration that aliases all `user_id` references and renames the output column to `member_user_id`.
- Updated workspace member query mapping to read `member_user_id` and keep the UI contract intact.
#### Manual Checklist
- [x] `pnpm -C statrumble exec supabase db push`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Retest Members section loads without errors
#### Commit Link
- TODO

### Prompt ID: Hotfix-07c-2026-02-24 (commit: TODO)
#### Prompt
```text
[Hotfix 07c] Refresh semantics 확정 + Referee report 재사용/재판정(force) 분리

컨텍스트
- Repo root: ~/code/statrumble/
- Next app:   ~/code/statrumble/statrumble/
- 스택: Next(App Router) + Supabase(RLS/RPC) + OpenAI Responses API
- 현재 목표(문서 기반):
  - Refresh는 비용 0원 “DB 최신 동기화”
  - snapshot/start/end는 고정
  - Run Referee(기본)는 report 있으면 재사용(reused=true)
  - 강제 재판정은 별도 버튼(force=true)
  - UI에서 Run Referee / Re-run(costs) 분리
  (문서 5.2 Hotfix 07c):contentReference[oaicite:1]{index=1}

해야 할 일(구현)
1) Thread 페이지/컴포넌트에서 Refresh 의미를 “DB 재조회만”으로 고정
   - 대상: messages / votes / referee report
   - snapshot(start/end 포함)은 절대 다시 계산하거나 바꾸지 말 것
   - Refresh 클릭 시 네트워크 폭주 없이(POST 1 + GET 1 수준) 안정적으로 수렴
   - 관련 파일 후보:
     - statrumble/app/threads/[id]/page.tsx
     - statrumble/app/components/ThreadArena.tsx (있으면)
     - statrumble/lib/db/messages.ts, votes.ts 등

2) /judge route 동작을 확정
   - 파일 후보: statrumble/app/api/threads/[id]/judge/route.ts
   - Query 또는 Body로 force 플래그 지원(권장: query ?force=1 또는 body { force: true })
   - force=false(기본):
     - 기존 report가 DB에 있으면 OpenAI 호출 없이 즉시 반환
     - 응답에 reused=true 포함
   - force=true:
     - OpenAI Responses API 호출 → 결과 저장 → 반환
     - 응답에 reused=false 포함
   - 저장 방식:
     - 현재 스키마를 확인해서 “thread_id 당 report 1개 upsert”로 최소 구현(히스토리 테이블 새로 만들지 않아도 됨)
     - 단, overwritten 방식이면 updated_at 등으로 최신 여부가 명확히 남게
   - 워크스페이스 권한/스코프는 기존 active workspace/RLS 규칙 그대로 준수

3) UI: Run Referee / Re-run(costs) 버튼 분리
   - Run Referee: 기본(force=false) 호출 → 재사용이면 “Reused” 배지/텍스트로 표시
   - Re-run(costs): force=true 호출 → 가벼운 confirm(예: “비용이 발생할 수 있음”) 후 실행
   - Refresh 버튼은 judge를 자동 호출하지 말 것(오직 조회만)

4) 회귀/테스트 체크
   - 기존 스레드에 report가 있는 상태에서 Run Referee → OpenAI 호출 없이 즉시 반환(reused=true)
   - force=true 클릭 시에만 OpenAI 호출(로그/응답으로 확인)
   - Refresh는 report/messages/votes만 재조회(스냅샷 범위 변동 없음)
   - lint/typecheck/verify.sh 통과 유지

커밋 전략
- 커밋 메시지: fix: refresh semantics and reuse referee report
- docs/CODEX_LOG.md에 변경 요약 5~10줄 추가

완료 후 실행(로컬)
- pnpm -C statrumble run lint
- pnpm -C statrumble run typecheck
- ./scripts/verify.sh
```
#### Result
- Added a thread refresh API that returns messages, votes, and referee report in a single GET without touching snapshot math.
- Updated `ThreadArena` to use the refresh endpoint for initial load and all refresh actions, keeping refresh to one GET.
- Reworked `/judge` to support `force` via query/body, reuse existing reports when present, and return `reused` flags.
- Added a migration and model updates for `referee_report_updated_at` to record overwrite timestamps.
- Split Run Referee vs Re-run (costs) in the UI with a confirm step for forced reruns.
- Displayed a Reused badge when the referee report is reused.
#### Manual Checklist
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Prompt-B-2026-02-24 (commit: TODO)
#### Prompt
```text
[Prompt B] Promote to Decision + /decisions Ledger (MVP)

컨텍스트
- Repo root: ~/code/statrumble/
- Next app:   ~/code/statrumble/statrumble/
- 스택: Next(App Router) + Supabase(RLS/RPC) + workspace/active 스코프
- 이미 완료된 것:
  - /workspaces 허브 + active workspace 스코프
  - threads / messages / votes / judge / refresh(=DB requery only) 동작
  - Referee reuse/force 분리

목표
1) Thread를 “Decision Card”로 승격(Promote)
2) /decisions 페이지(목록) + /decisions/[id] 상세(읽기 전용) 제공
3) workspace 스코프/권한(RLS, active workspace) 준수
4) idempotent: 한 thread는 decision 1개(중복 생성 방지)

구현 요구사항

A) DB (필요 시 마이그레이션 추가)
- 현재 supabase/migrations에서 마지막 번호 확인 후 다음 번호로 새 migration 생성(예: 014_...).
- decision_cards 테이블이 이미 있으면 스키마를 확인하고 “MVP에 필요한 컬럼”이 없을 때만 추가.
- 최소 요구 컬럼(없으면 추가):
  - id uuid pk (있을 가능성 큼)
  - workspace_id uuid (thread의 workspace)
  - thread_id uuid (unique)
  - title text
  - summary text (nullable)
  - created_by uuid (auth.uid)
  - created_at timestamptz default now()
  - updated_at timestamptz default now()
  - snapshot_start timestamptz (thread의 start)
  - snapshot_end timestamptz (thread의 end)
  - referee_report jsonb or text (이미 thread에 저장된 report를 그대로 복사하거나 요약 텍스트 저장) — 선택
- 제약:
  - unique(thread_id)
  - index(workspace_id, created_at desc)
- RLS:
  - 읽기: workspace 멤버만 select 가능
  - 쓰기(생성): workspace owner/member 중 “thread에 접근 가능한 사람”만 insert 가능 (최소는 workspace member)
  - 업데이트/삭제는 MVP에서는 막거나 owner만 허용

B) API: Promote endpoint
- 새 API route 추가:
  - POST statrumble/app/api/threads/[id]/promote/route.ts
- 동작:
  1) active workspace를 서버에서 해석(기존 유틸 재사용)
  2) thread 조회(해당 workspace에 속하는지 검증)
  3) 이미 decision_cards에 thread_id 존재하면 기존 decision 반환 (idempotent)
  4) 없으면 decision_cards 생성:
     - title: 기본값 생성(예: `${metricName} (${start}~${end})` 또는 thread.title/없으면 "Decision")
     - summary: referee report가 있으면 거기서 1~2줄 요약(없으면 null)
     - snapshot_start/end: thread의 start/end
     - created_by: auth.uid()
     - workspace_id/thread_id: thread에서
  5) 응답: { decisionId, created: boolean }
- 에러:
  - 권한 없음: 401/403
  - thread not found or 다른 workspace: 404

C) UI: Thread → Promote 버튼
- thread 상세 페이지(또는 ThreadArena UI)에 버튼 추가:
  - "Promote to Decision"
- 클릭 시:
  - POST /api/threads/[id]/promote
  - 성공 시 /decisions/[decisionId]로 이동 또는 링크 표시
- 이미 promote된 thread면 버튼 대신:
  - "View Decision" 링크 표시

D) UI: Decisions 목록/상세
- 목록: statrumble/app/decisions/page.tsx
  - active workspace 기준 decision_cards list
  - 카드/테이블: title, created_at, created_by(가능하면), thread 링크
- 상세: statrumble/app/decisions/[id]/page.tsx
  - decision 카드 내용 표시(title, summary, 기간, 생성자)
  - 관련 thread로 이동 링크
  - (선택) referee report 원문/요약 표시
- 네비게이션:
  - layout/header에 Decisions 링크가 이미 있으면 그대로, 없으면 추가
  - /decisions는 멤버십 없으면 온보딩(기존 정책과 동일한 UX)

E) 코드 구조(권장)
- DB 접근 유틸: statrumble/lib/db/decisions.ts (또는 workspaces/threads.ts에 최소 추가)
- 기존 active workspace 유틸/권한 체크 재사용

검증 체크리스트
1) thread 생성/조회 가능 상태에서 Promote 클릭 → decision 생성되고 /decisions에 나타남
2) 같은 thread에서 Promote 2번 → 새로 생성되지 않고 기존 decision으로 이동(created=false)
3) workspace 전환 후 /decisions가 workspace별로 분리되어 보임
4) 권한 없는 workspace/thread 접근 시 404/403
5) lint/typecheck/verify.sh 통과

커밋
- 커밋 1~2개로 정리(가능하면 1개):
  - feat(decisions): promote thread to decision and add decisions pages
- docs/CODEX_LOG.md에 변경 요약 5~10줄 추가
- DB migration 추가 시: pnpm exec supabase db push (dry-run 후)

실행
- pnpm -C statrumble run lint
- pnpm -C statrumble run typecheck
- ./scripts/verify.sh
```
#### Result
- Added `014_decision_cards_mvp.sql` to extend `decision_cards` with summary/created_by/updated_at/snapshot range/referee report plus unique thread constraint and workspace index.
- Introduced `statrumble/lib/db/decisions.ts` and exports for decision list/detail lookups scoped to the active workspace.
- Added `POST /api/threads/[id]/promote` with idempotent promotion, summary extraction from referee reports, and active-workspace validation.
- Wired Thread UI to show Promote/View Decision and redirect to the decision detail on success.
- Replaced the Decisions placeholder with a workspace-scoped list page and added a read-only detail page with optional referee report view.
- Maintained onboarding UX when no workspace membership is present.
#### Manual Checklist
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
- [ ] `pnpm exec supabase db push --dry-run` (failed: supabase CLI not found)
- [ ] `pnpm exec supabase db push` (failed: supabase CLI not found)
#### Commit Link
- TODO

### Prompt ID: UI-Nav-Active-2026-02-24 (commit: TODO)
#### Prompt
```text
[UI polish] Header nav active link highlight

Goal:
- Top nav (StatRumble / Decisions / Workspaces / Join) should highlight the current page, not always StatRumble.

Task:
1) Find the header/nav code (likely statrumble/app/layout.tsx or a Header component).
2) Implement active styling using next/navigation usePathname().
3) Rules:
   - StatRumble is active only when pathname === '/'
   - Decisions active when pathname startsWith('/decisions')
   - Workspaces active when pathname startsWith('/workspaces') or pathname startsWith('/workspace')
   - Join active when pathname startsWith('/join')
4) Keep styling consistent with existing UI (use same bold/underline style currently applied to StatRumble).
5) Ensure lint/typecheck passes.
```
#### Result
- Added a client-side `HeaderNavLinks` component that derives active state from `usePathname()` and applies bold styling to the active link.
- Replaced static header links in `statrumble/app/layout.tsx` with the new active-aware nav links.
#### Manual Checklist
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Prompt-C-2026-02-24 (commit: TODO)
#### Prompt
```text
[Prompt C] Public Portal Skeleton (read-only) for Decision Cards

컨텍스트
- Repo root: ~/code/statrumble/
- Next app:   ~/code/statrumble/statrumble/
- 이미 완료:
  - /workspaces 허브 + active workspace 스코프
  - threads/judge/refresh semantics(재사용+force)
  - decisions ledger(/decisions, promote thread -> decision)

목표
1) Decision Card를 “공개(Publish)”하면, 로그인 없이 볼 수 있는 공개 URL이 생긴다.
2) 공개 페이지는 read-only. (댓글/투표/스레드 내용 노출 X)
3) 공개/비공개 토글은 워크스페이스 권한(최소 owner)으로만 가능.
4) RLS로 안전하게: 공개된 decision만 anon이 읽을 수 있다.

구현 요구사항

A) DB 마이그레이션 (새 파일, 다음 번호로 추가: 현재 014까지 있으니 015_... 권장)
- 파일: statrumble/supabase/migrations/015_public_decisions_portal.sql
- decision_cards에 아래 컬럼 추가(없으면):
  - is_public boolean not null default false
  - public_id uuid unique (nullable)  -- 공개 URL 식별자
  - public_at timestamptz nullable
- public_id 생성 규칙:
  - publish 시 public_id가 null이면 gen_random_uuid()로 생성
  - unpublish 시 is_public=false (public_id는 유지해도 되고 null로 지워도 됨; MVP에서는 “유지” 추천)
- 인덱스:
  - index on (is_public, public_at desc) 또는 (public_id)만 있어도 됨(unique면 충분)
- RLS:
  1) 기존 멤버 select policy는 유지
  2) anon/public 읽기 정책 추가:
     - decision_cards: SELECT 허용 조건 using (is_public = true and public_id is not null)
  3) UPDATE 정책:
     - publish/unpublish는 owner만 가능(최소 MVP). member는 불가.
     - 구현은 policy + RPC 둘 중 하나 선택(권장: RPC로 중앙집권)

B) RPC(권장) 또는 API-only
- RPC 권장: set_decision_public(p_decision_id uuid, p_public boolean) returns table(public_id uuid, is_public boolean)
  - auth.uid() null이면 Unauthorized
  - decision이 속한 workspace에서 caller가 owner인지 검증
  - p_public=true:
    - is_public=true, public_at=now()
    - public_id가 null이면 gen_random_uuid()로 채움
  - p_public=false:
    - is_public=false
  - 결과로 public_id/is_public 반환
- security definer + 내부에서 auth.uid()/멤버십 검증(지금까지 패턴 유지)

C) API 라우트
- POST statrumble/app/api/decisions/[id]/publish/route.ts
  - body: { public: true|false } (또는 query ?public=1)
  - 내부에서 위 RPC 호출
  - 응답: { publicId, isPublic, publicUrl }
  - publicUrl 포맷: /p/decisions/<publicId>
- 이 API는 workspace scope가 아니라 “decision_id -> workspace 검증”으로 권한 체크

D) UI (Decision detail 페이지에 Publish 컨트롤 추가)
- 파일 후보: statrumble/app/decisions/[id]/page.tsx
- owner일 때만 노출:
  - Publish toggle 버튼(또는 Publish/Unpublish)
  - Publish 후 public URL 표시 + Copy 버튼
- owner가 아니면:
  - 공개 상태는 보여줘도 되지만(선택), 토글은 숨김

E) Public 페이지 라우트(로그인 없이 접근)
- 새 페이지:
  - statrumble/app/p/decisions/[publicId]/page.tsx
  - (선택) statrumble/app/p/layout.tsx 로 공개페이지 레이아웃 분리(상단 nav 최소화)
- 동작:
  - cookies/auth 없이 supabase anon client로 decision_cards를 public_id로 조회
  - is_public=false/null이면 404
  - 보여줄 내용(MVP):
    - title, summary, snapshot_start/end, created_at, (선택) referee report 요약/일부
  - 절대 노출하지 말 것:
    - workspace 내부 멤버 목록/유저 이메일/스레드 메시지/투표 상세 등

F) QA 체크리스트
1) decision detail에서 Publish -> publicId 생성 -> /p/decisions/<id> 접속 시 로그인 없이 보임
2) Unpublish 후 same URL 접속 -> 404
3) 다른 workspace의 decision은 owner 아닌 계정이 publish 불가
4) 공개 decision이더라도 /decisions 목록은 기존처럼 로그인/멤버십 필요(변화 없음)
5) lint/typecheck/verify.sh 통과 + supabase db push 적용

커밋
- feat(public): add public decisions portal (publish + /p/decisions/[publicId])
- docs/CODEX_LOG.md에 변경 요약 5~10줄
- 마이그레이션 추가 시: pnpm exec supabase db push (dry-run 후)

실행
- pnpm -C statrumble run lint
- pnpm -C statrumble run typecheck
- ./scripts/verify.sh
```
#### Result
- Added `015_public_decisions_portal.sql` with public columns, public select policy, owner-only update/delete policy, and the `set_decision_public` RPC.
- Added publish API at `POST /api/decisions/[id]/publish` returning `publicUrl` and enforcing owner authorization via RPC.
- Added `DecisionPublishControls` client component and wired it into decision detail for owners only.
- Added public decision page at `/p/decisions/[publicId]` with read-only summary view and referee TL;DR.
- Extended decision DB helpers to include public fields and public-id lookup.
#### Manual Checklist
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
- [ ] `pnpm exec supabase db push --dry-run` (failed: supabase CLI not found)
- [ ] `pnpm exec supabase db push` (failed: supabase CLI not found)
#### Commit Link
- TODO

### Prompt ID: 2026-02-25-Hydration-01 (commit: TODO)
#### Prompt
```text
너는 statrumble(Next.js App Router) 레포에서 Hydration mismatch를 없애는 패치를 만든다.

문제:
- pnpm dev 실행 후 / 페이지에서 "Hydration failed because the server rendered text didn't match the client" 발생.
- diff를 보면 <option> 텍스트의 날짜 포맷이 서버는 "2/25/2026, 1:02:35 AM", 클라는 "2026. 2. 25. 오전 1:02:35" 처럼 locale/timeZone 기본값 차이로 달라진다.
- 에러 스택: app/components/ImportChart.tsx around line ~293의 <option> 라벨에서 formatDateLabel(item.created_at) 출력.

목표(필수):
1) 서버(SSR)와 클라이언트(초기 hydration)에서 "동일한 created_at 입력"에 대해 완전히 동일한 문자열이 렌더되게 만든다.
2) suppressHydrationWarning 같은 “숨기기”는 사용하지 말고, 포맷을 결정적으로(deterministic) 만드는 방식으로 해결한다.
3) 성능/안정성: formatter는 렌더마다 새로 만들지 말고 모듈 스코프 상수 또는 useMemo로 재사용한다.
4) created_at이 string(ISO)일 수 있으니 파싱 방어(Invalid Date 처리)도 넣는다.

구현 지시:
- app/components/ImportChart.tsx를 열고 formatDateLabel(또는 날짜 포맷 코드)을 찾아, toLocaleString()/toLocaleDateString()를 “기본값으로” 호출하는 부분이 있으면 전부 제거한다.
- Intl.DateTimeFormat를 사용해 locale과 timeZone을 명시적으로 고정한다.
  예: locale "ko-KR", timeZone "Asia/Seoul", year/month/day/hour/minute/second, hour12 등 명시.
- <option> 라벨은 기존처럼 "파일명 - 날짜" 구조를 유지하되 날짜 부분이 위 formatter를 사용하도록 수정한다.

추가 점검(가능하면):
- 레포 전체에서 toLocaleString / toLocaleDateString / toLocaleTimeString 사용처를 검색해서,
  SSR 경로(서버 렌더링 중 실행될 수 있는 컴포넌트/유틸)에서 기본값 호출이 있으면 동일하게 locale/timeZone 명시로 고친다.

검증:
- pnpm dev 후 동일 페이지를 새로고침해도 hydration 에러가 더 이상 뜨지 않아야 한다.
- 변경 파일/코드 diff를 깔끔하게 제시하고, 왜 이게 SSR/클라 동일성을 보장하는지 한 문단으로 설명한다.
```
#### Result
- Added a shared deterministic date formatter in `lib/formatDate.ts` with fixed `ko-KR` locale and `Asia/Seoul` timeZone, plus invalid-date fallback.
- Updated ImportChart option labels and chart labels to use the deterministic formatter.
- Replaced default locale date formatting in server/client-rendered pages and components with the shared formatter.
- Updated decision title formatting in the promote route to use the deterministic date-only formatter.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: 2026-02-25-Date-Format-02 (commit: TODO)
#### Prompt
```text
너는 statrumble(Next.js App Router) 레포에서 “날짜 포맷 결정화(deteministic) + 의도 복원” follow-up 패치를 만든다.

배경:
- Hydration mismatch의 원인은 SSR(서버)과 CSR(브라우저)에서 날짜 문자열이 locale/timeZone 기본값 차이로 달라졌기 때문.
- 이미 lib/formatDate.ts를 추가해 Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul", ... }) 기반으로 고정했지만,
  (A) 자정(00시) 근처 hourCycle(h23/h24) 차이로 “00 vs 24” 같은 초희귀 mismatch 가능성이 남아있고,
  (B) UI 표시 포맷이 기존 ko-KR 브라우저 스타일(예: "2026. 2. 25. 오전 1:02:35")에서
      새 포맷("2026.02.25 01:02:35")로 바뀌어 UX 의도가 흔들릴 수 있다.
- 또한 timestamp 문자열이 timezone 없는 ISO일 경우 new Date(value) 해석이 SSR/CSR에서 달라질 수 있다.
- app/api/threads/[id]/promote/route.ts의 날짜 포맷 변경은 “유저 표시용 vs 머신용” 의도에 따라 다시 점검해야 한다.

목표(필수):
1) SSR과 초기 hydration에서 동일 timestamp 입력 → 동일 문자열 출력(100%).
2) suppressHydrationWarning 같은 숨기기 금지. 진짜로 deterministic 하게 고칠 것.
3) hourCycle을 명시해서 자정 엣지케이스(00 vs 24)를 원천 차단.
4) UI 날짜 표기 “의도”를 코드 근거로 확인하고, 의도에 맞게 포맷을 조정(기존 스타일 유지가 기본 가정).
5) timezone 없는 ISO 입력은 정규화해서 SSR/CSR 파싱 차이를 없앤다.
6) API route의 날짜 포맷은 소비처를 추적해 “유저 표시용이면 UI 포맷”, “머신/로그/키면 ISO(YYYY-MM-DD 등)”로 분리.

작업 지시:

[1] statrumble/lib/formatDate.ts 개선
- DateInput은 string | null | undefined 유지 가능.
- parseDate(value: string): Date | null 유틸을 추가:
  - value가 ISO-like인데 끝에 'Z' 또는 '+09:00' 같은 TZ 정보가 없으면 'Z'를 붙여 UTC로 정규화한다.
    예: /^\d{4}-\d{2}-\d{2}T/ && !/(Z|[+\-]\d{2}:\d{2})$/ -> `${value}Z`
  - Date가 Invalid면 null 반환.

- “UI용 datetime 포맷”을 기존 브라우저 ko-KR 표시와 최대한 유사하게 만든다(의도 복원):
  - 목표 예시: "2026. 2. 25. 오전 1:02:35"
  - 구현은 Intl.DateTimeFormat + formatToParts로 숫자/오전오후 파트를 뽑아 직접 조립.
  - ko-KR, Asia/Seoul 고정.
  - hourCycle은 12시간 표시 의도면 hourCycle: "h12" + hour12: true,
    24시간 표시 의도면 hourCycle: "h23" + hour12: false 로 명시.
  - month/day/hour은 numeric(leading zero 제거), minute/second는 2-digit 유지.
  - dayPeriod(오전/오후)가 필요하니 DatePartKey에 "dayPeriod" 추가하고 parts에서 추출.

- “로그/정렬/기계친화” 포맷이 필요하면 별도 함수로 유지:
  - 예: formatDateTimeLabel24 -> "YYYY.MM.DD HH:mm:ss" (hourCycle: "h23" 명시)
  - 단, UI에서 어디에 쓰는지 명확히 구분.

- 기존 export 함수명(formatDateLabel, formatDateTimeLabel)이 이미 여러 군데에서 쓰이면
  - UI용이 기본이면 formatDateTimeLabel은 UI 스타일로,
  - 24h 버전은 formatDateTimeLabel24 같은 이름으로 추가하는 쪽을 우선.

[2] “의도 확인” (코드 기반 판단)
- 레포 전체에서 toLocaleString/toLocaleDateString 사용 이력/현존 사용처를 검색.
- 사용자에게 직접 보여주는 라벨(옵션 텍스트, 리스트, 카드)은 “ko-KR 로컬 스타일(오전/오후)”로 보여주려 했던 흔적이 강하면
  -> UI 기본 포맷을 그 스타일로 복원한다.
- 그래프 축/툴팁 등은 24h가 더 명확할 수 있으나, 화면 일관성을 최우선으로 결정하고 이유를 CODEX_LOG.md에 남긴다.

[3] 변경 파일 반영
- ImportChart.tsx의 <option> 라벨과 차트 라벨은 “의도에 맞게” UI용 formatter를 사용.
- 이번 패치에서 함께 바뀐 컴포넌트들(ThreadArena.tsx, WorkspacesHub.tsx, app/page.tsx, threads/decisions 관련 page들)도
  동일 원칙으로 정리(무조건 한 가지 기준으로).

[4] app/api/threads/[id]/promote/route.ts 재점검
- 이 route가 반환/생성하는 날짜 문자열의 소비처(call-site)를 찾아서 목적을 판단:
  - 유저에게 보여지는 문장/라벨이면 UI formatter 사용(ko-KR 스타일).
  - 머신/로그/키/슬러그/프롬프트 파이프라인이면 locale 비의존 ISO 포맷(YYYY-MM-DD 또는 RFC3339)으로 변경.
- “왜 그렇게 결정했는지”를 CODEX_LOG.md에 2~5줄로 기록.

[5] 회귀 방지(필수)
- 테스트 러너가 있으면 유닛 테스트 추가, 없으면 node 스크립트라도 추가:
  - scripts/verify-date-format.mjs (또는 .ts)
  - 케이스 최소 2개:
    1) 자정 경계: "2026-02-25T15:00:00Z" (KST 2026-02-26 00:00:00) 같은 케이스 포함
    2) 일반 시간: "2026-02-25T00:02:35Z"
  - 출력 문자열이 기대값과 정확히 일치하는지 assert.
  - verify.sh(또는 기존 검증 스크립트)에 이 스크립트를 연결 가능하면 연결.

검증:
- pnpm dev에서 해당 페이지 강력 새로고침 여러 번 → hydration error 재현 안 됨.
- pnpm build && pnpm start에서도 동일.
- 변경 diff + CODEX_LOG.md에 “의도 판단 근거/결정”이 남아 있어야 함.

커밋 메시지 예:
- fix(hydration): stabilize hourCycle and restore intended ko-KR datetime labels
```
#### Result
- Added ISO-without-timezone normalization (`parseDate`) and dayPeriod-aware UI formatting that matches ko-KR browser style while locking locale/timeZone/hourCycle.
- Introduced a 24h formatter with explicit hourCycle and normalization for rare “24:00:00” outputs at midnight.
- Added a date-format verification script wired into `scripts/verify.sh` using a local TS loader.
- Kept chart and list labels on the same ko-KR UI datetime style for consistency with prior `toLocaleString` intent.
- Confirmed promote route uses date-only labels for user-visible decision titles (UI intent), not machine keys.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: 2026-02-25-Date-Format-03 (commit: TODO)
#### Prompt
```text
너는 statrumble(Next.js App Router) 레포에서 “날짜 포맷 결정화(deterministic) + 의미 보존” 최종 봉합 패치를 만든다.
이번 패치 목적은 (A) hydration mismatch 재발 가능성을 더 낮추고, (B) timezone 없는 문자열 처리에서 “의미(시간대 가정)”를 임의로 바꾸지 않게 하는 것이다.

현재 상태 요약(전제):
- lib/formatDate.ts에서 Intl.DateTimeFormat("ko-KR",{ timeZone:"Asia/Seoul", ... })로 SSR/CSR 일치를 해결하려 했음.
- 다만 두 리스크가 남아있음:
  1) TZ 없는 ISO-like 문자열을 parseDate에서 `${value}Z`로 강제 정규화하면, 원래 로컬(KST) 의미였을 때 시간이 9시간 이동할 수 있음(의미 훼손).
  2) UI용 “오전/오후(dayPeriod)”를 Intl 결과에 의존하면(드물지만) Node ICU/로케일 차이로 서버가 AM/PM, 브라우저가 오전/오후를 뱉어 hydration mismatch가 재발할 수 있음.

필수 목표:
1) SSR/CSR 초기 hydration에서 동일 입력 -> 동일 출력 문자열(결정적).
2) timezone 없는 ISO 입력에 대해 “UTC 가정(Z 붙이기)” 같은 의미 변경을 기본값으로 하지 않는다.
3) UI용 날짜 표기는 기존 의도(ko-KR 스타일 “YYYY. M. D. 오전/오후 h:mm:ss”)를 유지하되,
   “오전/오후”는 Intl에서 가져오지 말고 코드로 직접 계산한다(AM/PM/오전/오후 불일치 원천봉쇄).
4) suppressHydrationWarning 같은 숨기기 금지.

구현 지시:
[1] parseDate 정책 변경 (TZ 없는 ISO는 파싱 거부)
[2] UI dayPeriod 계산을 코드로 직접 처리
[3] TZ 없는 입력은 원문 반환
[4] verify-date-format.mjs 갱신
```
#### Result
- TZ 없는 ISO-like 문자열은 파싱을 거부하고 원문 그대로 반환하도록 변경해 시간대 의미를 임의로 바꾸지 않게 했습니다.
- UI용 “오전/오후”는 Intl 결과가 아니라 24h 숫자(hour24)에서 직접 계산해 ICU/로케일 차이로 인한 mismatch 가능성을 차단했습니다.
- UI 포맷은 기존 ko-KR 스타일(“YYYY. M. D. 오전/오후 h:mm:ss”)을 유지하면서도 hourCycle을 명시해 자정 엣지를 안정화했습니다.
- 24h 포맷은 hourCycle h23 + 24→00 보정으로 결정적이고 기계 친화적인 표기를 유지했습니다.
- TZ 없는 입력에 대한 정책(원문 유지)과 dayPeriod 계산 원칙을 verify-date-format 스크립트로 고정해 회귀를 방지했습니다.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Prompt D (commit: TODO)
#### Prompt
```text
[Prompt D] Public Workspace Portal (workspace publish + /portal + /p/w/[slug])

컨텍스트
- Repo root: ~/code/statrumble/
- Next app:   ~/code/statrumble/statrumble/
- 완료된 것:
  - Decision publish/unpublish + /p/decisions/[publicId]
  - workspace membership/RLS + /workspaces hub
- 목표: 공개 워크스페이스를 “포털 형태”로 묶어서 탐색/공유 가능하게 만들기
- 주의: workspaces 테이블에는 invite_code 같은 민감정보가 있을 수 있으니, anon에 workspaces row를 직접 열지 말 것.

목표
1) 워크스페이스를 Publish 하면 public slug가 생기고, 로그인 없이 볼 수 있는 공개 페이지가 생긴다.
2) /portal 에서 공개 워크스페이스 목록을 보여준다.
3) /p/w/[slug] 에서 해당 워크스페이스의 공개 decision 목록을 보여준다.
4) 공개 페이지는 read-only. (멤버/이메일/초대코드/내부 스레드 메시지/투표 등은 절대 노출 X)
5) Publish/Unpublish는 workspace owner만 가능.

구현 요구사항

A) DB (새 migration, 번호 충돌 방지: migrations 폴더 스캔해서 max+1로 생성)
- 파일 예: statrumble/supabase/migrations/0XX_public_workspaces_portal.sql

A1) 새 테이블 추가: public.workspace_public_profiles
- workspace_id uuid primary key references public.workspaces(id) on delete cascade
- slug text unique not null
- display_name text not null
- description text null
- is_public boolean not null default false
- public_at timestamptz null
- updated_at timestamptz not null default now()

A2) RLS
- enable rls on workspace_public_profiles
- SELECT:
  - anon/public 읽기 허용: using (is_public = true)
  - authenticated 멤버 읽기 허용은 굳이 안 넣어도 되지만, owner/member가 관리 UI에서 읽을 수 있게 하려면 “workspace member면 select 허용” 정책 추가 가능
- UPDATE/INSERT:
  - owner만 허용 (RPC로만 처리할 거면 policy는 막아도 됨)
- workspaces 테이블에는 “anon select” 정책을 추가하지 말 것(초대코드 누출 방지)

A3) slug 생성 규칙 (MVP)
- publish 시 slug가 없으면 생성:
  - base := lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))
  - slug := base || '-' || substr(gen_random_uuid()::text, 1, 8)
- 충돌 가능성 낮게 만들고, conflict 나면 suffix 재생성(또는 그냥 unique 위반 에러로 돌려도 MVP는 OK)

B) RPC: set_workspace_public
- create or replace function public.set_workspace_public(
    p_workspace_id uuid,
    p_public boolean,
    p_display_name text default null,
    p_description text default null
  )
  returns table(slug text, is_public boolean, public_at timestamptz)
- security definer + auth.uid() 검증
- owner 검증:
  - public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid() and wm.role='owner'
- 동작:
  - ensure row exists in workspace_public_profiles (upsert)
  - p_public=true:
     - is_public=true, public_at=now()
     - display_name := coalesce(p_display_name, workspaces.name)
     - description := p_description
     - slug가 비었으면 규칙에 따라 생성
  - p_public=false:
     - is_public=false, public_at=null (slug 유지)
- returning slug, is_public, public_at

C) API
C1) POST /api/workspaces/[id]/publish
- 파일: statrumble/app/api/workspaces/[id]/publish/route.ts
- body: { public: boolean, displayName?: string, description?: string }
- 내부에서 set_workspace_public RPC 호출
- 응답: { slug, isPublic, publicAt, publicUrl: `/p/w/${slug}` }

D) UI (authenticated, owner만)
D1) /workspaces 허브 또는 workspace settings 영역에 “Workspace Public Portal” 섹션 추가
- owner일 때만 Publish/Unpublish 토글 표시
- Publish 후 public URL 표시 + copy 버튼
- Unpublish 후 안내(공개 URL은 404)

E) Public pages (anon 접근)
E1) /portal
- 파일: statrumble/app/portal/page.tsx
- anon client로 workspace_public_profiles where is_public=true order by public_at desc
- 목록 카드: display_name, description(있으면), “View” 링크 -> /p/w/[slug]
- Pagination/검색은 MVP에서 생략 가능

E2) /p/w/[slug]
- 파일: statrumble/app/p/w/[slug]/page.tsx
- 1) workspace_public_profiles에서 slug로 조회 (is_public=true 아니면 404)
- 2) 해당 workspace_id의 “공개 decision 목록” 조회:
     - decision_cards where is_public=true and workspace_id=<workspace_id> order by public_at/updated_at desc
     - 각 항목은 /p/decisions/[publicId] 링크 제공
- 노출 제한:
  - created_by email, 멤버 목록, invite_code 등 금지
  - 보여줄 것: title, summary, snapshot_start/end, created_at 정도

F) lib/db 정리
- statrumble/lib/db/publicPortal.ts (또는 workspaces.ts/decisions.ts 확장)
- public용 조회 함수는 “anon client”를 쓰는 경로로 분리(쿠키/세션 없이)

G) QA 체크
1) owner가 workspace publish -> /portal에 노출
2) /p/w/[slug]가 로그인 없이 열림
3) /p/w/[slug]에서 공개 decision들만 보임 (비공개 decision은 안 보임)
4) unpublish 후 /portal에서 사라지고 /p/w/[slug]는 404
5) owner 아닌 계정이 publish API 호출 -> 403/Forbidden

커밋
- feat(portal): add public workspace portal (/portal + /p/w/[slug])
- docs/CODEX_LOG.md 요약 추가
- migration 추가 시: pnpm exec supabase db push (dry-run 후)

실행
- pnpm -C statrumble run lint
- pnpm -C statrumble run typecheck
- ./scripts/verify.sh
```
#### Result
- `statrumble/supabase/migrations/017_public_workspaces_portal.sql`로 공개 워크스페이스 프로필 테이블/정책/RPC를 추가했다.
- anon 전용 조회 경로(`createAnonClient`, `lib/db/publicPortal.ts`)와 `/portal`, `/p/w/[slug]` 공개 페이지를 구현했다.
- `/api/workspaces/[id]/publish`와 워크스페이스 허브의 공개 포털 토글 UI를 추가했다.
#### Manual Checklist
- [ ] `pnpm exec supabase db push --dry-run` (failed: `supabase` not found)
- [ ] `pnpm exec supabase db push` (failed: `supabase` not found)
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Hotfix Public Portal Redirect (commit: TODO)
#### Prompt
```text
[Hotfix] Public portal routes redirect to /login — find root cause and fix

Symptom
- Publishing workspace produces slug/public URL OK.
- But opening public URLs in a fresh/incognito browser redirects to /login instead of showing the public page.
- Affected routes should include:
  - /portal
  - /p/w/[slug]
  - /p/decisions/[publicId]
- These routes must be accessible without authentication.

Goal
- Make public pages truly public (no auth redirect).
- Keep all private app routes protected as before.
- Keep publish/unpublish APIs protected (owner-only). Only public READ pages bypass auth.

Task (investigate first, then fix)
1) Reproduce and capture redirect chain:
   - Open incognito and visit /portal and /p/w/<valid-slug>.
   - Use server console logs + browser network to confirm if redirect is 307/303 to /login.
2) Identify where the redirect happens:
   - Check statrumble/middleware.ts (or proxy.ts if migrated) for auth gating logic.
   - Check statrumble/app/layout.tsx (and any nested layouts) for redirect(/login) behavior.
   - Check any shared server utilities that enforce auth (e.g., createServerClient wrappers).
3) Apply the minimal fix:
   - Add an explicit allowlist bypass for public paths:
     - /portal and any /p/* should NEVER trigger auth redirect.
   - Ensure this bypass works both for server-side navigation and direct URL entry.
4) Confirm:
   - Incognito visiting /portal, /p/w/[slug], /p/decisions/[publicId] loads without redirect.
   - Private routes (/, /workspaces, /decisions, /threads/...) still redirect to login if unauthenticated.
   - Publish API remains protected:
     - POST /api/workspaces/[id]/publish requires owner.
     - POST /api/decisions/[id]/publish requires owner.
5) Add lightweight regression notes to docs/CODEX_LOG.md.

Implementation hints (do not blindly apply; confirm root cause)
- If middleware/proxy is redirecting unauthenticated users:
  - Add a public-path early return:
    - pathname === '/portal' or pathname startsWith('/portal/')
    - pathname === '/p' or pathname startsWith('/p/')
  - Return NextResponse.next() for those.
- If layout is redirecting:
  - Skip session check/redirect when pathname matches /portal or /p/*
  - You can use headers() / request URL parsing in server components if needed.
- Keep changes minimal; do not refactor auth system.

Deliverables
- Diff + files changed
- Short explanation: where redirect was enforced and how bypass works
- Ensure lint/typecheck/verify.sh still pass

Suggested commit message
- fix(public): allow /portal and /p/* routes without auth redirect
```
#### Result
- Root cause: `statrumble/middleware.ts` enforced auth for all non-excluded paths, redirecting unauthenticated users to `/login`.
- Added explicit public-path allowlist for `/portal` and `/p/*` so these routes bypass auth gating while keeping all other routes protected.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Next 16 cleanup - proxy migration (commit: TODO)
#### Prompt
```text
[Next 16 cleanup] Migrate middleware.ts -> proxy.ts (keep auth + public allowlist)

Goal:
- Remove Next.js warning: "middleware file convention is deprecated"
- Keep existing behavior:
  - Private routes still require auth redirect
  - Public routes (/portal, /p/*) bypass auth redirect (allowlist)
  - Existing excluded prefixes (/_next, favicon 등) 유지

Tasks:
1) Migrate file convention:
   - Rename statrumble/middleware.ts -> statrumble/proxy.ts
   - Rename exported function if needed per Next conventions (proxy)
   - Preserve matcher/config
   (You may use codemod: npx @next/codemod@latest middleware-to-proxy .)
2) Ensure the public allowlist logic is preserved exactly.
3) Run:
   - pnpm -C statrumble run lint
   - pnpm -C statrumble run typecheck
   - ./scripts/verify.sh
4) Verify manually:
   - Incognito: /portal and /p/* open without redirect
   - Incognito: /workspaces redirects to /login
   - No warning about middleware->proxy in dev logs

Commit:
- chore(next): migrate middleware to proxy
```
#### Result
- Migrated `statrumble/middleware.ts` to `statrumble/proxy.ts` and renamed the handler to `proxy`, preserving the auth gating and public allowlist behavior.
- Matcher/config and excluded prefixes remain unchanged.
#### Manual Checklist
- [x] `pnpm -C statrumble run lint`
- [x] `pnpm -C statrumble run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Transform Proposals - arena_threads kind (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js + Supabase repo.

Goal: implement Transform Proposals as a new type of arena_thread without breaking existing behavior.

Tasks:
1) Find the latest Supabase migration number (currently up to 017). Create a new migration (next number) that ALTERs the `arena_threads` table to add:
   - kind text NOT NULL DEFAULT 'discussion'
   - parent_thread_id uuid NULL REFERENCES arena_threads(id)
   - transform_prompt text NULL
   - transform_spec jsonb NULL
   - transform_sql_preview text NULL
   - transform_stats jsonb NULL
   - transform_diff_report jsonb NULL
2) Add indexes for (kind) and (parent_thread_id).
3) Do NOT modify existing migrations. New migration only.
4) Ensure existing inserts into arena_threads still work (because kind has a default).
5) Update any generated TypeScript DB types if the repo has them.

Output:
- The new migration SQL file
- Any updated type files
- Notes about where the thread record is read/written in the app so we can hook UI later.
```
#### Result
- Added `statrumble/supabase/migrations/018_transform_proposals_threads.sql` to extend `public.arena_threads` with transform proposal fields plus indexes on `kind` and `parent_thread_id`.
- Confirmed no Supabase-generated TypeScript DB type file exists in this repo today (DB row shapes are typed ad-hoc in `lib/db/*`).
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Transform Proposals - thread reads/types sync (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js + Supabase repo.

Context:
- Migration 018 added these columns to `public.arena_threads`:
  kind (default 'discussion'), parent_thread_id, transform_prompt, transform_spec, transform_sql_preview,
  transform_stats, transform_diff_report.
- Current thread fetch code uses explicit select lists, so new fields are NOT being returned.

Goal:
Update thread read functions to include the new fields (at least `kind`), and fix any TypeScript types so
the app can render transform proposal threads without undefined/missing properties.

Tasks:
1) Open `statrumble/lib/db/threads.ts`.
   - In `listThreads()` it currently does:
     .select("id, created_at, start_ts, end_ts, metric_id, visibility, metrics(name, unit)")
     Update it to also return:
       - kind
       - parent_thread_id
     (Keep it minimal; do NOT add all transform_* to listThreads unless it's already used in the list UI.)

   - In `getThread(threadId)` inspect its `.select(...)`.
     Prefer changing it to return all columns so transform fields are available on the thread detail page:
       .select("*, metrics(name, unit)")
     If getThread currently includes additional relations, preserve them and still include all thread columns.

2) Find TypeScript types used by these functions:
   - `ArenaThread` and `ArenaThreadListItem` (or whatever types are returned).
   Update them to include:
     - kind: string
     - parent_thread_id?: string | null
     - transform_prompt?: string | null
     - transform_spec?: any | null (jsonb)
     - transform_sql_preview?: string | null
     - transform_stats?: any | null (jsonb)
     - transform_diff_report?: any | null (jsonb)
   If there are Zod schemas or runtime validators for thread objects, update those too.

3) Ensure all API routes that rely on `getThread` keep working:
   - `statrumble/app/api/threads/[id]/messages/route.ts`
   - `statrumble/app/api/threads/[id]/votes/route.ts`
   - `statrumble/app/api/threads/[id]/refresh/route.ts`
   - `statrumble/app/api/threads/[id]/promote/route.ts`
   (No behavior changes needed—just ensure the thread object shape is consistent.)

4) Run checks and fix any fallout:
   - `npm run lint`
   - `npm run typecheck`
   - `./scripts/verify.sh`
   If a check fails, include the exact fix in the patch.

Output:
- A clean patch (diff) with the changes.
- Brief notes: what was changed and why (missing fields due to explicit selects).
- Suggested commit message, e.g.:
  "fix(db): include transform proposal fields in thread queries"
```
#### Result
- Updated `statrumble/lib/db/threads.ts` query selects so `listThreads()` returns `kind` and `parent_thread_id`, and `getThread()` now loads all thread columns via `select("*, metrics(name, unit)")`.
- Expanded thread row/output types with proposal-thread fields (`kind`, `parent_thread_id`, `transform_*`) and kept list output minimal with only `kind`/`parent_thread_id` selected.
- Lint fallout from `any` on JSONB fields was fixed by using `unknown | null`.
- Checked dependent API routes using `getThread`; no behavior change required.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Transform Spec DSL + execution engine (commit: TODO)
#### Prompt
```text
Implement a safe Transform Spec (JSON DSL) and an execution engine in TypeScript.

Repo context:
- Chart rendering exists in statrumble/app/components/ImportChart.tsx and thread UI in statrumble/app/threads/[id]/page.tsx.
- Inspect these files first to match the existing chart data structure (do not invent a new shape unless necessary).

Requirements:
- Create a module under statrumble/lib/transforms/
- Validate TransformSpec with zod (or the validation style used in this repo).
- Supported ops ONLY:
  1) filter_outliers: { op:"filter_outliers", method:"iqr"|"zscore", k?:number, z?:number, mode:"remove"|"clip" }
  2) moving_average: { op:"moving_average", window:number, center?:boolean, outputColumn?:string }
- Provide:
  - applyTransform(spec, series) -> { series, stats }
  - compareStats(a,b) -> diff object
- Stats must include:
  count_before, count_after, outliers_removed, mean, std, slope
  (slope can be simple linear regression over index if no time axis)

Output:
- New files
- Minimal sanity script or test
- Notes: which UI/API should call applyTransform.
```
#### Result
- Added `statrumble/lib/transforms/index.ts` with a strict zod-based TransformSpec DSL and a safe execution engine for exactly two ops (`filter_outliers`, `moving_average`).
- Added `applyTransform(spec, series)` and `compareStats(a, b)` plus typed stats (`count_before`, `count_after`, `outliers_removed`, `mean`, `std`, `slope`).
- Added `scripts/sanity-transforms.ts` as a lightweight sanity check script and executed it.
- Kept series shape aligned with existing chart usage (`{ ts: string, value: number }`).
#### Manual Checklist
- [x] `node --loader ./scripts/ts-strip-loader.mjs ./scripts/sanity-transforms.ts`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Transform engine hardening edge-cases (commit: TODO)
#### Prompt
```text
You are working in the StatRumble repo. We recently added a transform DSL/execution module:
- statrumble/lib/transforms/index.ts
- scripts/sanity-transforms.ts

Goal:
Audit and harden the transform engine for 3 edge cases before we integrate it into APIs/UI:
(1) series sorting + duplicate ts handling
(2) outlier "remove" vs "clip" behavior + sensible default
(3) moving_average when window > series length

Tasks:

A) Inspect current implementation
1) Open statrumble/lib/transforms/index.ts and locate:
   - TransformSpecSchema
   - applyTransform(spec, series)
   - filter_outliers op implementation
   - moving_average op implementation

B) Check #1: sorting & duplicate ts
2) Determine if applyTransform assumes series is sorted. If it does, implement a normalization step at the start:
   - Sort by ts ascending
   - Handle duplicate ts deterministically:
     - Choose one strategy and document it in code comments:
       (preferred) keep the LAST value for the same ts, or average them.
   - Support ts types used by the app: string ISO timestamps and/or numbers (do not break existing series shape { ts, value }).

Add a test case in scripts/sanity-transforms.ts:
- Provide an unsorted series with duplicate ts
- Ensure the output series is sorted and duplicates resolved per the chosen rule.

C) Check #2: outlier mode remove vs clip + default
3) Verify filter_outliers supports BOTH modes:
   - remove: drop outlier points
   - clip: keep points but clamp values to bounds
4) Ensure there is a sensible default if mode is missing in spec:
   - Default to "clip" (to avoid “holes” in line charts).
   - If TransformSpecSchema currently requires mode, change it to optional with default("clip") OR keep schema strict but add runtime fallback in applyTransform (prefer schema default if possible).

Add sanity tests:
- One spec without mode should behave as clip.
- One spec with mode:"remove" should reduce count_after and increase outliers_removed.

D) Check #3: moving_average window > length
5) Ensure moving_average does not produce NaN/empty series when window > series length.
Pick ONE behavior and implement it (document it clearly):
   - Option 1 (preferred for demo safety): return the series unchanged and add a warning flag in stats, e.g. stats.warnings = ["window_too_large"].
   - Option 2: treat window as min(window, length) and compute anyway.
If you add stats.warnings, keep compareStats stable (ignore warnings in numeric diffs).

Add sanity tests:
- series length 5, window 7 -> should not throw, should not produce NaN, and should follow chosen behavior.

E) Verification
6) Run:
- node --loader ./scripts/ts-strip-loader.mjs ./scripts/sanity-transforms.ts
- npm run lint
- npm run typecheck
- ./scripts/verify.sh
Fix any fallout.

Output:
- A clean patch (diff) implementing the above.
- Brief notes summarizing:
  - sorting/dedup rule chosen
  - default mode behavior
  - window>length behavior
Suggested commit message:
fix(transforms): normalize series, default clip mode, guard MA window
```
#### Result
- Hardened `statrumble/lib/transforms/index.ts` with series normalization at transform entry: timestamps are validated/sorted ascending and duplicates are resolved by keeping the last row for the same timestamp key.
- Extended timestamp support from string-only to `string | number` while preserving `{ ts, value }` point shape.
- Updated `filter_outliers` schema to default `mode` to `clip` when omitted.
- Added a guard for `moving_average` when `window > series.length`: series remains unchanged and `stats.warnings` includes `window_too_large`.
- Expanded `scripts/sanity-transforms.ts` with assertions for unsorted+duplicate handling, default clip behavior, explicit remove behavior, and oversized moving-average behavior.
#### Manual Checklist
- [x] `node --loader ./scripts/ts-strip-loader.mjs ./scripts/sanity-transforms.ts`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Transform proposal API route (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js (App Router) + Supabase repo.

We already have:
- DB migration 018 adding transform fields to public.arena_threads
- Thread queries updated (getThread uses select("*, metrics(name, unit)"), listThreads includes kind/parent_thread_id)
- Transform engine at statrumble/lib/transforms/index.ts:
  - TransformSpecSchema (zod)
  - applyTransform(spec, series) -> { series, stats }
  - compareStats(a,b)

Goal:
Implement an authenticated API route that creates a transform proposal thread using OpenAI and persists:
transform_prompt, transform_spec, transform_sql_preview, transform_stats.

Route:
- Create: statrumble/app/api/threads/propose-transform/route.ts
- Method: POST
- Request JSON:
  {
    import_id: string,
    prompt: string,
    parent_thread_id?: string | null
  }
- Response JSON:
  { thread_id: string }

Behavior:
1) Validate session and active workspace (reuse the same auth helpers used by existing thread APIs, e.g. threads/create and threads/[id]/judge).
2) Fetch the import’s chart series in the SAME SHAPE used by ImportChart: array of { ts, value }.
   - Look at statrumble/app/components/ImportChart.tsx and existing DB helpers to locate how import data is stored (imports table / snapshot / derived points).
   - Do not invent new storage; reuse existing import read path.
3) Call OpenAI to generate a transform proposal with STRICT structure:
   Output JSON:
   {
     "title": string,
     "explanation": string,
     "transform_spec": TransformSpec,
     "sql_preview": string
   }
   - Prefer using Structured Outputs if the existing OpenAI SDK in this repo supports it.
   - If not available, request JSON only and parse strictly, then validate transform_spec using TransformSpecSchema.
   - Use model from env CODEX_MODEL; fallback to a reasonable codex-capable model name already used in this project’s docs. Do NOT use deprecated model names.
4) Validate the transform_spec using TransformSpecSchema.
5) Run applyTransform(transform_spec, series) to compute stats (do NOT persist the transformed series yet).
6) Insert a new arena_threads row:
   - workspace_id = active workspace
   - kind = 'transform_proposal'
   - parent_thread_id = provided or null
   - import_id = request import_id
   - visibility = 'workspace' (default)
   - start_ts/end_ts should match current import default range or be set to full range if needed
   - snapshot can reuse existing snapshot behavior (if threads/create stores it, follow the same pattern)
   Then update this thread with:
   - transform_prompt, transform_spec, transform_sql_preview, transform_stats
7) Create an initial thread message summarizing:
   - title + explanation
   - and mention that SQL preview is for review (not executed)
   Reuse existing messages write helper so voting/comments work.
8) Return { thread_id }.

Security/robustness:
- Never execute sql_preview.
- Enforce that transform_spec only includes allowed ops (zod already does this).
- Handle edge cases: empty series, very small series, window > length.

Output:
- The full route implementation
- Any helper functions you add
- Minimal manual test instructions (curl example) and what response should look like.
- Ensure npm run lint / typecheck / scripts/verify.sh pass.
Suggested commit message:
feat(api): create transform proposal threads via codex
```
#### Result
- Added `statrumble/app/api/threads/propose-transform/route.ts` implementing authenticated `POST /api/threads/propose-transform`.
- Reused workspace/session checks, import ownership checks, and point loading in existing shape (`{ ts, value }`) from `metric_points`.
- Added Structured Outputs call via OpenAI Responses API to produce `{ title, explanation, transform_spec, sql_preview }`, then validated `transform_spec` with `TransformSpecSchema`.
- Applied transform (`applyTransform`) and stored `transform_stats` (baseline/transformed/diff), persisted proposal fields, and created initial message via `createMessage` with explicit SQL-preview-not-executed wording.
- Used `CODEX_MODEL` env with fallback `gpt-5.2-codex`.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Propose-transform hardening audit (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js + Supabase repo.

Context:
- We have a new API route:
  statrumble/app/api/threads/propose-transform/route.ts
- It creates transform proposal threads, uses OpenAI Responses API with Structured Outputs (json_schema),
  runs applyTransform/compareStats, stores transform_* fields.

Goal:
Before moving to Prompt 04, audit and fix 4 issues:
(1) Model fallback correctness + safer defaults for hackathon usage
(2) Structured Outputs extraction + refusal/error handling robustness
(3) GPT-5.2 parameter compatibility (avoid unsupported sampling params when reasoning effort != none)
(4) Parent-child diff persistence: store numeric diffs into transform_diff_report when parent_thread_id is provided

Tasks:

A) Inspect current route implementation
1) Open statrumble/app/api/threads/propose-transform/route.ts and locate:
   - model selection logic (CODEX_MODEL fallback)
   - the OpenAI Responses API request payload
   - parsing/extraction of structured output
   - DB insert/update into arena_threads
   - compareStats call site

B) Fix (1): model fallback + guard deprecated model
2) Ensure model selection behaves like this:
   - const model = process.env.CODEX_MODEL?.trim() || "gpt-5.1-codex-mini"
   - If CODEX_MODEL is set to "codex-mini-latest", reject with 400 and a clear message:
     "codex-mini-latest is removed; use gpt-5-codex-mini or gpt-5.1-codex-mini"
   - If a more capable model is desired, allow env override (no hardcoding to expensive model).
3) Update .env.example (and/or docs) to include CODEX_MODEL with recommended default.

C) Fix (2): Structured Outputs robustness
4) Verify Structured Outputs is configured correctly (json_schema strict).
5) Implement robust extraction:
   - If the response contains a refusal or no valid JSON payload, return 502 with a clear error.
   - Do NOT silently proceed with partial/empty objects.
6) Ensure transform_spec is always validated via TransformSpecSchema (zod).
   - If validation fails, return 422 with details (do not retry automatically).

D) Fix (3): GPT-5.2 parameter compatibility
7) Inspect the OpenAI request payload. Ensure:
   - Do NOT send temperature/top_p/logprobs unless reasoning effort is explicitly "none".
   - If reasoning effort is set (low/medium/high/etc.), remove those sampling fields to avoid API errors.
   - Keep the request minimal: model + input + structured outputs format.
8) Add a short inline comment explaining why those fields are omitted (compatibility).

E) Fix (4): Persist compareStats diff in transform_diff_report
9) When parent_thread_id is provided:
   - Fetch the parent thread row (must be same workspace) and read parent.transform_stats and parent.transform_spec.
   - If parent.transform_stats is missing/null, still allow creating the child thread but set transform_diff_report = null
     (or { error: "missing_parent_stats" }).
   - Compute numeric diff:
       const deltas = compareStats(parentStats, childStats)
   - Store transform_diff_report on the CHILD thread as JSON, minimally:
     {
       parent_thread_id: string,
       parent_stats: { ... } (optional: include only key numeric fields),
       child_stats: { ... } (optional),
       deltas: { ... }  // result of compareStats
     }
   - Keep it deterministic and small (avoid storing huge arrays).

F) Verification & quick manual checks
10) Run:
   - npm run lint
   - npm run typecheck
   - ./scripts/verify.sh
11) Provide 2 manual curl examples (describe expected DB fields):
   - Create without parent_thread_id -> thread.kind=transform_proposal, transform_stats set, transform_diff_report null
   - Create with parent_thread_id -> transform_diff_report contains deltas

Output:
- A clean patch (diff) implementing all of the above.
- Brief notes summarizing each fix.
Suggested commit message:
fix(api): harden propose-transform (model defaults, structured outputs, diff persistence)
```
#### Result
- Hardened `statrumble/app/api/threads/propose-transform/route.ts` model selection to `CODEX_MODEL || gpt-5.1-codex-mini` and added explicit 400 guard for removed `codex-mini-latest`.
- Added robust Structured Outputs handling: refusal detection and missing/invalid structured payload now return 502; `transform_spec` zod validation failures return 422 with issue details.
- Kept OpenAI request minimal (`model`, `input`, strict `json_schema`) and documented omission of sampling params for GPT-5 compatibility.
- Added parent-child diff persistence on child thread: reads parent `transform_stats`/`transform_spec`, computes deltas via `compareStats` when possible, otherwise stores deterministic `missing_parent_stats` report.
- Updated `.env.example` with `CODEX_MODEL=gpt-5.1-codex-mini`.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Propose-transform final pre-04 hardening (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js + Supabase repo.

Context:
- API route exists:
  statrumble/app/api/threads/propose-transform/route.ts
- It already:
  - guards removed model name "codex-mini-latest"
  - uses Responses API + Structured Outputs (json_schema strict)
  - validates TransformSpecSchema
  - computes stats and stores transform_* fields
  - stores transform_diff_report with parent_stats, child_stats, deltas (compareStats)

Goal:
Do the final pre-Prompt-04 hardening checks:
(Required) 1) Ensure transform_diff_report stores child_stats in the SAME "comparable stats" shape as parent_stats.
(Optional) 2) Make text.verbosity safe: keep it, but add a fallback path that retries WITHOUT verbosity only if the API rejects the field.
(Optional) 3) Validate parent_thread_id semantics: parent must be kind='transform_proposal' (and ideally same import_id) or return 400.

Tasks:

A) Required: normalize child_stats in transform_diff_report
1) In propose-transform route, locate where transformDiffReport is built.
2) Today it uses extractComparableStats() for parent_stats but stores child_stats raw.
   Change it so BOTH parent_stats and child_stats are comparable stats with consistent shape:
   - const childComparableStats = extractComparableStats(childStats) ?? null
   - Store child_stats: childComparableStats
3) If childComparableStats is null (should not happen unless stats format changes), store:
   { parent_thread_id, error: "missing_child_stats" } or set child_stats: null + error field.
4) Keep transform_diff_report deterministic and compact.

B) Optional: safe verbosity fallback
5) The request currently sets: text: { verbosity: "low", format: { type:"json_schema", strict:true, ... } }.
6) Keep verbosity by default, BUT add a retry mechanism ONLY for "verbosity unsupported" style errors:
   - Attempt OpenAI call with verbosity.
   - If it fails with a 400-like error message mentioning "verbosity" / "Unknown parameter" / "unrecognized" etc,
     retry ONCE with the same request but WITHOUT text.verbosity.
   - Do NOT retry for other errors.
7) Add a short inline comment explaining why this exists (demo robustness across SDK/API changes).

C) Optional: validate parent_thread_id semantics
8) When parent_thread_id is provided:
   - Fetch parent thread (already done).
   - If parent is missing => 404.
   - If parent.kind !== 'transform_proposal' => 400 with clear message.
   - (Recommended) If parent.import_id !== request import_id => 400 (diff comparisons across different datasets are meaningless).
   - Keep the existing same-workspace/ownership checks.

D) Verification
9) Run:
   - npm run lint
   - npm run typecheck
   - ./scripts/verify.sh
10) Provide 2 manual curl examples and what to inspect in DB:
   - With parent_thread_id: verify transform_diff_report.child_stats exists and matches parent_stats shape; verify deltas exist.
   - With parent_thread_id pointing to a non-transform thread: verify 400.

Output:
- A clean patch (diff).
- Brief notes summarizing the three changes.
Suggested commit message:
fix(api): stabilize diff report + verbosity fallback + parent validation
```
#### Result
- Updated `propose-transform` diff persistence so `transform_diff_report.child_stats` is normalized via `extractComparableStats` (same comparable shape as `parent_stats`); stores deterministic `missing_child_stats` error when unavailable.
- Added one-time OpenAI retry path that drops `text.verbosity` only for verbosity/unknown-parameter style request errors, while keeping verbosity by default.
- Added parent-thread semantic validation: `parent.kind` must be `transform_proposal` and `parent.import_id` must match request `import_id` (400 otherwise).
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
#### Commit Link
- TODO

### Prompt ID: Prompt 04 UI fork and compare transform proposals (commit: TODO)
#### Prompt
```text
You are working in the StatRumble Next.js + Supabase repo.

Context:
- Transform proposal API exists:
  POST /api/threads/propose-transform
  Creates arena_threads with kind='transform_proposal' and stores:
  transform_prompt, transform_spec, transform_sql_preview, transform_stats, transform_diff_report
- Thread fetching functions include these fields:
  getThread uses select("*, metrics(name, unit)")
  listThreads includes kind and parent_thread_id

Goal (Prompt 04):
Make transform proposals feel collaborative:
- Add a Fork flow (create a child proposal from a parent)
- Render parent-vs-child diffs when parent_thread_id exists
- Minimal list badge so users can recognize proposal threads

Tasks:

A) Thread list UI: show proposal badge
1) Find the threads list UI entry point (statrumble/app/page.tsx or wherever listThreads is rendered).
2) If item.kind === 'transform_proposal', show a small badge/tag "Proposal" (or "Transform") next to the thread item.
   Keep styling minimal (Tailwind classes if used).

B) Thread detail UI: render proposal panel + Fork action
3) Open statrumble/app/threads/[id]/page.tsx (thread detail).
4) If thread.kind !== 'transform_proposal', keep the page unchanged.
5) If thread.kind === 'transform_proposal', render a top panel containing:
   - Title (use existing thread title if any; otherwise a fallback like "Transform Proposal")
   - transform_prompt (if present)
   - A short "SQL Preview (not executed)" section with a code block showing transform_sql_preview
   - Stats summary (transform_stats): count_before/count_after/outliers_removed/mean/std/slope
   - Warnings if present (transform_stats.warnings)
   Keep this panel above the existing messages/votes UI so collaboration stays intact.

6) Add a "Fork" button in the proposal panel:
   - On click, open a modal (or a simple inline form) asking for a new prompt text.
   - Submit calls POST /api/threads/propose-transform with:
     { import_id: thread.import_id, prompt: <new prompt>, parent_thread_id: thread.id }
   - On success, redirect user to /threads/<new_thread_id>.

C) Diff UI: render transform_diff_report if present
7) If thread.parent_thread_id exists OR transform_diff_report exists, render a "Compare to parent" section:
   - If transform_diff_report.error exists, display it gently (e.g., "Parent stats missing")
   - Else render deltas (transform_diff_report.deltas) as a small table/list:
     - mean delta
     - std delta
     - slope delta
     - count_after delta (if present)
   Keep it deterministic and compact.

D) Verification
8) Ensure npm run lint / npm run typecheck / ./scripts/verify.sh pass.
9) Provide a short manual test checklist:
   - Create a proposal from import page or via curl
   - Open proposal thread page: panel shows SQL preview + stats
   - Click Fork: child proposal thread is created and shows Compare section

Output:
- A clean patch (diff) with UI changes.
- Brief notes on where UI was wired.
Suggested commit message:
feat(ui): fork and compare transform proposals
```
#### Result
- Added proposal badge in thread list UI for `thread.kind === "transform_proposal"` in `statrumble/app/page.tsx`.
- Added proposal detail panel in `statrumble/app/threads/[id]/page.tsx` with prompt, SQL preview (not executed), stats summary, warnings, and parent diff rendering from `transform_diff_report`.
- Added fork UI component `statrumble/app/components/TransformProposalForkForm.tsx`; it opens an inline prompt form, posts to `/api/threads/propose-transform` with `parent_thread_id`, and redirects to the new child thread.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Create proposal thread and verify panel contents on `/threads/<id>`
- [ ] Click `Fork`, submit prompt, verify redirect to child proposal and compare section
#### Commit Link
- TODO

### Prompt ID: Auto-login demo smoke test (commit: TODO)
#### Prompt
```text
Update scripts/demo-smoke.sh to support automatic login so we don’t have to manually copy browser cookies.

Goal:
If COOKIE is not provided, the script should obtain a valid auth cookie string automatically and proceed.

Tasks:
1) In scripts/demo-smoke.sh, add env vars:
   - BASE_URL (default http://localhost:3000)
   - IMPORT_ID (required)
   - COOKIE (optional)
   - TEST_EMAIL, TEST_PASSWORD (required if COOKIE missing)
   - SUPABASE_URL, SUPABASE_ANON_KEY (required if COOKIE missing)

2) If COOKIE is empty:
   - Call Supabase Auth password grant to get access_token + refresh_token.
   - Use curl:
     POST ${SUPABASE_URL}/auth/v1/token?grant_type=password
     Headers:
       apikey: ${SUPABASE_ANON_KEY}
       Content-Type: application/json
     Body:
       {"email":"${TEST_EMAIL}","password":"${TEST_PASSWORD}"}
   - Parse JSON with jq:
     access_token = .access_token
     refresh_token = .refresh_token
   - Determine the cookie names used by our server client.
     Search the repo for where cookies are read/written for supabase auth (createClient helper).
     Prefer names like "sb-access-token" and "sb-refresh-token" if that’s what the app uses.
   - Build COOKIE string like:
     "sb-access-token=${access_token}; sb-refresh-token=${refresh_token}"
   - (Optional) print a short message: "Generated COOKIE via Supabase login"

3) Use the resulting COOKIE for all API calls (curl -b "$COOKIE").
4) Keep existing DB assertions via service-role REST as-is.
5) Add clear failures:
   - If login fails or tokens missing, exit with message.
6) Verify:
   - bash -n scripts/demo-smoke.sh
   - ./scripts/verify.sh (if it includes shellcheck-like checks) and existing lint/typecheck if needed.

Output:
- Patch diff
- Short run instructions, e.g.
  SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_EMAIL=... TEST_PASSWORD=... IMPORT_ID=... bash scripts/demo-smoke.sh
Suggested commit:
test(smoke): auto-login to avoid manual cookies
```
#### Result
- Added auto-login path in `scripts/demo-smoke.sh` that uses Supabase password grant to generate `sb-<project>-auth-token` cookies (base64url, chunked).
- Added required env wiring (`TEST_EMAIL`, `TEST_PASSWORD`, `SUPABASE_ANON_KEY`) and jq/error checks for missing tokens.
- Verification: `bash -n scripts/demo-smoke.sh`, `npm run lint`, `npm run typecheck`, `./scripts/verify.sh`.
#### Manual Checklist
- [x] `bash -n scripts/demo-smoke.sh`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Run `scripts/demo-smoke.sh` with auto-login env vars
#### Commit Link
- TODO

### Prompt ID: Auto-seed workspace membership in smoke (commit: TODO)
#### Prompt
```text
목표: 매뉴얼 테스트(워크스페이스 멤버십 추가/쿠키 복사/SQL Editor 작업) 전부 중지.
Codex가 service_role 권한으로 “테스트 유저 멤버십 자동 주입 + propose-transform/fork 테스트”를 무조건 통과시키는 자동화만 만든다.

현상:
- scripts/demo-smoke.sh는 Supabase password grant로 COOKIE 생성까지는 성공하지만,
  /api/threads/propose-transform 호출에서 {"ok":false,"error":"No workspace membership."}로 500이 난다.
- 원인: smoke가 로그인한 TEST_EMAIL 유저가 import의 workspace에 멤버가 아니거나, active workspace 유도 이전에 멤버십이 없어 막힘.

요구사항(강제):
1) scripts/demo-smoke.sh에서 COOKIE가 없으면 자동 로그인(password grant) 후 access_token을 얻는다(이미 있음).
2) access_token(JWT)에서 user_id를 자동 추출한다(수동으로 auth.users 조회 금지):
   - JWT payload의 "sub"가 user UUID다.
   - base64url 디코딩은 bash로 처리하거나 node/python one-liner 사용해도 됨.
3) service_role 키로 DB를 직접 조작해서, 이 TEST 유저를 “import가 속한 workspace”의 멤버로 자동 등록한다.
   - 테이블: public.workspace_members
   - 유니크: (workspace_id, user_id)
   - role은 'member'(기본값 있지만 명시해도 됨)
   - 중복이어도 실패하지 않게 upsert 또는 on_conflict do nothing 동작으로.
4) import의 workspace_id는 service_role로 public.metric_imports에서 가져온다:
   - metric_imports.id == IMPORT_ID
   - select workspace_id
5) 위 멤버십 주입이 끝난 뒤에야 기존 propose-transform API 호출을 진행한다.
6) 절대 매뉴얼(브라우저 쿠키 복사/SQL Editor insert)을 요구하지 않는다.
7) 시크릿은 절대 echo로 출력하지 말고, 실패 시에도 키/토큰은 마스킹한다.

구현 상세:
A) demo-smoke.sh에 env 추가/정리:
- 필수: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TEST_EMAIL, TEST_PASSWORD, IMPORT_ID
- 선택: BASE_URL (default http://localhost:3000)
- COOKIE는 optional (없으면 자동 로그인)

B) helper 함수 추가:
- decode_jwt_sub(access_token) -> user_id
- supabase_rest_get(path, use_service_role=1) / supabase_rest_post(...)

C) workspace_id 조회(service role):
GET ${SUPABASE_URL}/rest/v1/metric_imports?id=eq.${IMPORT_ID}&select=workspace_id

D) workspace_members upsert(service role):
POST ${SUPABASE_URL}/rest/v1/workspace_members?on_conflict=workspace_id,user_id

E) propose-transform 호출은 기존대로(쿠키 기반)
F) propose-transform 호출 전에 workspace_members row 존재 assert

검증:
- bash -n scripts/demo-smoke.sh
- 실제 실행에서 PASS가 나와야 한다.

실행 커맨드(문서에 적어줘):
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=... TEST_PASSWORD=... IMPORT_ID=... BASE_URL=http://localhost:3000 bash scripts/demo-smoke.sh

Output:
- demo-smoke.sh patch(diff)
- 간단한 README 주석(필요 env와 실행법)
- Suggested commit: test(smoke): auto-seed workspace membership with service role
```
#### Result
- Reworked `scripts/demo-smoke.sh` to always run password grant login, decode `access_token` JWT `sub` into `user_id`, and auto-seed workspace membership with `service_role` before any propose-transform call.
- Added helper functions `decode_jwt_sub`, `supabase_rest_get`, `supabase_rest_post`, plus service-role checks for:
  - `metric_imports(id=IMPORT_ID) -> workspace_id`
  - upsert into `workspace_members` (`on_conflict=workspace_id,user_id`, role=`member`)
  - preflight assert that membership row exists.
- Added secret masking helper so failure logs redact keys/tokens/JWT-like payloads.
- Added README section for required env and exact smoke command.
#### Manual Checklist
- [x] `bash -n scripts/demo-smoke.sh`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Real smoke run with valid Supabase creds/import id (blocked: required env not present in current shell)
#### Commit Link
- TODO

### Prompt ID: Fix ThreadDetailPage performance measure runtime error (commit: TODO)
#### Prompt
```text
Fix runtime error on /threads/[id]:
"Failed to execute 'measure' on 'Performance': 'ThreadDetailPage' cannot have a negative time stamp."

Goal:
Remove or harden any client-side Performance API instrumentation that measures "ThreadDetailPage" and causes negative timestamps.

Tasks:
1) Search the repo for any of:
   - "ThreadDetailPage"
   - performance.measure(
   - performance.mark(
   - "measure('ThreadDetailPage"
   - "mark('ThreadDetailPage"
   Use ripgrep and show the exact file+line you find.

2) Fix:
   - Prefer removing the measurement entirely (fastest, safest for hackathon).
   - If you keep it, NEVER pass startTime/endTime as numbers derived from epoch timestamps.
     Use marks without explicit startTime (performance.mark("...")) and measure via mark names:
       performance.mark("ThreadDetailPage:start")
       performance.mark("ThreadDetailPage:end")
       performance.measure("ThreadDetailPage", "ThreadDetailPage:start", "ThreadDetailPage:end")
     Wrap in try/catch so it can never crash the page.

3) Ensure this fix applies to the thread detail page that currently crashes:
   - statrumble/app/threads/[id]/page.tsx and any related client components.

4) Verification:
   - npm run lint
   - npm run typecheck
   - ./scripts/verify.sh
   - Manual quick: open /threads/<id> pages should render (no Runtime TypeError).

Output:
- Patch diff
- Short explanation of the root cause and what was changed.
Suggested commit:
fix(ui): remove unsafe performance.measure instrumentation
```
#### Result
- Searched all requested patterns with ripgrep; the only match was `ThreadDetailPage` function name at `statrumble/app/threads/[id]/page.tsx:215`.
- No direct `performance.measure` / `performance.mark` calls were found in app code.
- Renamed the page export from `ThreadDetailPage` to `Page` in `statrumble/app/threads/[id]/page.tsx` to remove the crashing measurement label from runtime instrumentation paths.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Manual quick check: open `/threads/<id>` and confirm no runtime TypeError
#### Commit Link
- TODO

### Prompt ID: Public Decision 페이지: transform payload 공개 노출 + UI 섹션 선명화 (commit: TODO)
#### Prompt
```text
[Prompt] Public Decision 페이지: transform payload 공개 노출 + UI 섹션 선명화

Context / Repo rules
- Next.js(App Router) 앱 루트: statrumble/
- Supabase migrations: statrumble/supabase/migrations/
- Public decision page: statrumble/app/p/decisions/[publicId]/page.tsx
- Public decision 기본 조회는 decision_cards RLS의 decision_cards_select_public( is_public=true )로 가능하지만,
  arena_threads는 멤버 전용이므로 공개 페이지에서 transform_* 컬럼 접근은 RPC로 우회해야 함.
- “No new deps”. Tailwind로만 UI 정리.

Goal
- Public decision 페이지에서 해당 decision이 연결된 thread가 transform_proposal인 경우,
  transform payload( prompt/spec/sql_preview/stats/diff_report )를 보기 좋게 노출한다.
- 동시에 Public decision UI에서 각 정보 덩어리(메타/요약/Referee/Transform)가 카드처럼 “선명”하게 보이도록 계층을 강화한다.

Tasks

A) DB: Public 전용 RPC 추가 (최소 공개 필드만 반환)
1) 새 migration 파일 생성:
   - statrumble/supabase/migrations/019_public_decision_detail_rpc.sql
2) 아래 함수를 idempotent하게 추가:
   - create or replace function public.get_public_decision_detail(p_public_id uuid)
   - returns table(
       id uuid,
       title text,
       summary text,
       created_at timestamptz,
       snapshot_start timestamptz,
       snapshot_end timestamptz,
       referee_report jsonb,
       thread_id uuid,
       thread_kind text,
       transform_prompt text,
       transform_spec jsonb,
       transform_sql_preview text,
       transform_stats jsonb,
       transform_diff_report jsonb
     )
   - language sql
   - security definer
   - set search_path = public, pg_temp
3) Implementation detail:
   - select from public.decision_cards dc
   - left join public.arena_threads t on t.id = dc.thread_id and t.workspace_id = dc.workspace_id
   - where dc.is_public = true and dc.public_id = p_public_id and dc.public_id is not null
   - return exactly 0 or 1 row
4) 권한:
   - revoke all on function public.get_public_decision_detail(uuid) from public;
   - grant execute on function public.get_public_decision_detail(uuid) to anon;
   - grant execute on function public.get_public_decision_detail(uuid) to authenticated;
5) 주의:
   - 이 RPC는 “public decision(= is_public=true)”인 경우에만 데이터가 나오게 해야 함.
   - arena_threads의 다른 민감 데이터(메시지/투표/스냅샷 등)를 추가로 노출하지 말 것.

B) Server helper: public decision detail 조회 함수 추가
1) 파일 수정: statrumble/lib/db/decisions.ts
2) 타입/함수 추가:
   - export type PublicDecisionDetail (위 RPC 반환 형태에 맞춰 string/null로 안전하게)
   - export async function getPublicDecisionDetailByPublicId(publicId: string): Promise<PublicDecisionDetail | null>
3) 구현:
   - const supabase = await createAnonClient(); (createAnonClient는 statrumble/lib/supabase/server.ts에 이미 있음)
   - const { data, error } = await supabase.rpc("get_public_decision_detail", { p_public_id: publicId });
   - error면 throw
   - data는 배열로 올 것이므로 첫 row를 반환 (없으면 null)
4) 기존 getPublicDecisionByPublicId는 다른 곳에서 쓸 수 있으니 유지 (필요하면 내부에서 anon을 쓰도록 바꿔도 됨)

C) UI: Public decision page에서 transform 섹션 렌더 + 시각적 계층 강화
1) 파일 수정: statrumble/app/p/decisions/[publicId]/page.tsx
2) getPublicDecisionByPublicId 대신 getPublicDecisionDetailByPublicId를 사용하도록 변경
3) UI 개선(“선명하게”):
   - 페이지 배경: min-h-screen + bg-zinc-50
   - 카드 스타일: rounded-xl, border-zinc-200, bg-white, shadow-sm
   - 섹션별로 카드 분리(기존 Public Decision 카드 + Referee Summary 카드 + Transform Proposal 카드)
4) Transform Proposal 섹션(조건부):
   - 조건: decision.thread_kind === "transform_proposal" && (transform_spec || transform_sql_preview || transform_stats)
   - 섹션 스타일: border-emerald-200 + bg-emerald-50/60 + shadow-sm 로 다른 톤
   - 상단에 “Transform Proposal” 제목 + ops 칩( transform_spec.ops 의 op 값들 )
   - stats 요약: transform_stats.transformed.count_before/count_after/outliers_removed/mean/std/slope 중 핵심을 표 형태로 2~3열 grid로 표시
     (값이 없으면 숨기거나 “-” 처리)
   - 긴 payload는 <details> 로 접어두기:
     - Prompt (whitespace-pre-wrap)
     - SQL Preview (pre, overflow-auto)
     - Transform Spec JSON (JSON.stringify(spec, null, 2) pre)
     - Diff Report JSON (있을 때만)
   - “SQL preview is for review only; not executed.” 같은 경고 문구를 작은 텍스트로 표시
5) Referee Summary 섹션은 기존 extractRefereeSummary 로직 유지하되, 카드 계층(heading/spacing)만 정리

D) Docs: CODEX_LOG 업데이트
- docs/CODEX_LOG.md에 새 엔트리 추가:
  - Prompt 원문(이 프롬프트)
  - Result: 어떤 파일이 바뀌었는지, RPC 추가/페이지 표시/섹션 UI 개선 요약
  - Manual Checklist: 공개 decision 링크 하나 열어서 transform 섹션 노출 확인
  - Suggested commit message: feat(public): expose transform payload on public decision page

Verification (필수)
- ./scripts/verify.sh
- (선택) 로컬에서 공개 decision URL로 접속해 렌더 확인:
  - /p/decisions/<publicId> 로 들어가서 Transform Proposal 카드가 뜨는지 확인

Output format
- 변경 파일 목록
- 핵심 diff 요약(특히 019 migration의 함수 시그니처/권한, public decision page의 transform 섹션)
- verify 결과(통과 여부)
```
#### Result
- Added `statrumble/supabase/migrations/019_public_decision_detail_rpc.sql` with `public.get_public_decision_detail(p_public_id uuid)` as a `security definer` SQL RPC that returns only public decision fields plus transform payload fields via a constrained `left join` to `arena_threads`.
- Applied function permissions as requested: `revoke all ... from public`, `grant execute ... to anon`, and `grant execute ... to authenticated`.
- Added `PublicDecisionDetail` and `getPublicDecisionDetailByPublicId(publicId)` in `statrumble/lib/db/decisions.ts`, using `createAnonClient()` and RPC first-row/null handling.
- Updated `statrumble/app/p/decisions/[publicId]/page.tsx` to use detail RPC data, strengthen section hierarchy with card UI, keep `extractRefereeSummary`, and conditionally render a Transform Proposal card with ops chips, stats grid, collapsible payload details, and SQL preview warning text.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Open one public decision URL (`/p/decisions/<publicId>`) and confirm Transform Proposal card rendering
#### Suggested Commit Message
- feat(public): expose transform payload on public decision page
#### Commit Link
- TODO

### Prompt ID: Translate Korean UI strings to English (commit: TODO)
#### Prompt
```text
현재 statrumble의 모든 공개 요소에서 한글을 영문으로 번역하여 치환할 것. 사용자 입장에서 한글이 안 보이도록 조치할 것
```
#### Result
- Replaced user-facing Korean strings across pages/components with English equivalents (decisions, workspaces, portal, threads, onboarding, chart, messaging, voting).
- Updated the Referee judge route prompt to request English-only JSON output.
- Switched date-time labels from 오전/오후 to AM/PM and updated `scripts/verify-date-format.mjs` expectations accordingly.
#### Manual Checklist
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `./scripts/verify.sh`
- [ ] Spot-check public pages (`/portal`, `/p/w/<slug>`, `/p/decisions/<publicId>`) for any remaining Korean
#### Suggested Commit Message
- chore(i18n): replace Korean UI strings with English
#### Commit Link
- TODO
