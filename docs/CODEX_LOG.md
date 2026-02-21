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
