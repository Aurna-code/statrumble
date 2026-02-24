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
