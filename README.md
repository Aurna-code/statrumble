# StatRumble

StatRumble is a collaborative data debate arena for CSV and time-series analysis. Teams upload data, select a chart segment, debate in an arena thread, and run a Referee that produces a decision that can be published as a public page.

The product scope is intentionally focused: upload -> chart -> segment select -> arena thread -> referee -> decision. This boundary keeps the demo path stable while proving collaborative analysis and adjudication.

## Status
- Hackathon prototype (built in ~1 week).
- Scope is intentionally narrow to keep the demo path stable.
- See [Roadmap](#roadmap) for planned expansion.

## What Works Now (2-3 Min Demo)
- Create workspace + invite code + join
- Import CSV + pick range + create thread
- Comments + votes
- Run Referee/Judge (demo mode by default; real mode via BYOK)
- Promote to decision + share `/p/decisions/<publicId>`

## How Codex Is Used
- Transform proposals: users can propose transformed series, and Codex produces structured outputs that become candidate threads.
- Transform proposals are generated as `TransformSpec` JSON via Structured Outputs (`json_schema` strict) and validated server-side.
- Proposal threads surface both a readable transform plan and the raw `transform_spec` JSON for review/debugging.
- Diff summaries: transform proposal threads include parent-vs-child summary data to show what changed and why it matters.
- Referee/Judge: the thread judge route calls the OpenAI Responses API on the server and stores a referee report and decision outcome.

## Prerequisites
- Node.js 20+
- pnpm 10+
- Docker (required for local Supabase)
- Supabase CLI (used through `pnpm -C statrumble exec supabase ...`)

## Run Locally (Fresh Clone)
Run from repository root:

```bash
pnpm install
pnpm -C statrumble exec supabase start
pnpm -C statrumble exec supabase db reset
cp statrumble/.env.example statrumble/.env.local
pnpm -C statrumble dev
```

> Quick pitfalls:
> After `supabase start`, run `pnpm -C statrumble exec supabase status` and set `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `statrumble/.env.local`.
> OTP/magic-link emails appear in the local inbox URL shown by `supabase status` (for example, Inbucket).
> If auth or data requests fail before reaching Supabase, open `/setup` or `/healthz` to inspect the required env vars.
> Before submitting, run `./scripts/contest-preflight.sh` for a final check.

Equivalent from inside `statrumble/`: `cp .env.example .env.local` (or set env vars directly).
This flow starts in demo mode by default when `OPENAI_API_KEY` is not set.

### CSV Format
CSV must include header columns: `ts,value`.
`ts` should be ISO8601 timestamp; `value` must be numeric.
See `docs/sample.csv` for an example.

To fetch local Supabase keys:

```bash
pnpm -C statrumble exec supabase status
```

## Demo Mode vs Real Mode
- Demo mode is the default when `OPENAI_API_KEY` is empty, or when `DEMO_MODE=1`.
- Real mode requires `OPENAI_API_KEY` to be set and `DEMO_MODE` unset or `0`.
- Keep `NEXT_PUBLIC_DEMO_MODE=1` in hosted reviewer environments for clear, safe defaults.
- UI badges show `(demo)` or `(API)` with matching cost/safety helper text.

## Environment Variables
Use `statrumble/.env.local` and never commit real keys.

- `NEXT_PUBLIC_SUPABASE_URL` (local default: `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (copy from `supabase status`)
- `OPENAI_API_KEY` (optional; required only for real API mode)
- `DEMO_MODE` (`1` forces deterministic mock AI responses on the server)
- `NEXT_PUBLIC_DEMO_MODE` (`1` forces demo mode via shared runtime mode logic)
- `NEXT_PUBLIC_DEV_PASSWORD_LOGIN` (optional toggle to show password login UI)

Password login stays hidden unless `NEXT_PUBLIC_DEV_PASSWORD_LOGIN=1`. Hosted and production auth behavior is unchanged. For deterministic local demos, seed the local demo users described below and then enable the flag in `statrumble/.env.local`.

Local diagnostics:
- `/setup` shows the current Supabase env status and recommended local fix steps.
- `/healthz` returns a lightweight JSON health check with env validation results.

## What Reviewers Should Do
- Run locally with the standard setup commands.
- Do not add API keys.
- Use the app normally; AI-related flows run in demo mode by default.

## Enable Real AI (Optional)
1. Set `OPENAI_API_KEY` in `statrumble/.env.local`.
2. Ensure `DEMO_MODE` is unset or `0`.
3. Optionally unset `NEXT_PUBLIC_DEMO_MODE` (recommended).
4. Restart the dev server if it is already running.

## Hosted Demo Note
- Hosted demo environments should run in demo mode (`DEMO_MODE=1`, `NEXT_PUBLIC_DEMO_MODE=1`, and no `OPENAI_API_KEY`).

## Contest Preflight
- Standard preflight:

```bash
./scripts/contest-preflight.sh
```

- Include local Supabase smoke test:

```bash
./scripts/contest-preflight.sh --with-local-supabase
```

`--with-local-supabase` requires Docker; if unavailable, the smoke step is skipped with a warning.

## Deterministic README Demo Smoke
Run the full two-user README demo path in demo mode against local Supabase:

```bash
pnpm -C statrumble smoke:readme
```

What the suite does:
- starts local Supabase and resets the database
- starts the Next app in demo mode (`DEMO_MODE=1`, `NEXT_PUBLIC_DEMO_MODE=1`)
- creates deterministic local users for User A and User B
- runs the README path end-to-end:
  workspace create -> invite join -> CSV import -> chart segment/thread create -> comments/votes -> judge -> promote -> publish -> public decision page render

Notes:
- This suite is intentionally separate from `npm test` because it requires Docker and boots a real Next dev server.
- Docker must be installed and the Docker daemon must be running before you start the suite.
- It uses `docs/sample.csv` as the import fixture.
- The smoke runner starts and stops local Supabase itself; no `.env.local` editing is required for the smoke run.

### CI
In CI, run the same command on a Linux runner with Docker available:

```bash
pnpm install
pnpm -C statrumble smoke:readme
```

If your CI job already runs `pnpm -C statrumble exec supabase ...` successfully, no extra secrets are required for this smoke suite.

## Deterministic Two-User Local Demo
This flow creates two stable local-only Supabase Auth users and keeps password login hidden until you explicitly enable it.

1. Start local Supabase:

```bash
pnpm -C statrumble exec supabase start
```

2. Reset the local database:

```bash
pnpm -C statrumble exec supabase db reset --yes
```

3. Seed the deterministic local demo users:

```bash
pnpm -C statrumble demo:seed-users
```

The seed command fails fast with a short message if Docker is unavailable, the Supabase CLI is missing, or local Supabase is not running.

4. Create `statrumble/.env.local` and set the local anon key plus the password-login toggle:

```bash
cp statrumble/.env.example statrumble/.env.local
pnpm -C statrumble exec supabase status
```

Copy `ANON_KEY` from `supabase status` into `statrumble/.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`, then set:

```dotenv
NEXT_PUBLIC_DEV_PASSWORD_LOGIN=1
```

5. Start the app:

```bash
pnpm -C statrumble dev
```

6. Log in in two separate browser sessions:
- User A: `demo-a@local.statrumble.test` / `StatRumbleLocalA!2026`
- User B: `demo-b@local.statrumble.test` / `StatRumbleLocalB!2026`

Exact reproducible command list:

```bash
pnpm install
pnpm -C statrumble exec supabase start
pnpm -C statrumble exec supabase db reset --yes
pnpm -C statrumble demo:seed-users
cp statrumble/.env.example statrumble/.env.local
pnpm -C statrumble exec supabase status
pnpm -C statrumble dev
```

## Demo Script (Two Users)
1. User A signs in and creates a workspace.
2. User A copies the workspace invite code.
3. User B signs in and joins via invite code.
4. User A uploads CSV data and creates a thread from a selected chart segment.
5. User A and User B comment and vote in the same thread.
6. User A runs Referee/Judge to generate the decision report.
7. User A promotes the thread to a decision.
8. User A publishes the decision and shares `/p/decisions/<publicId>`.
9. Optional: User A enables the workspace public portal so the workspace appears on `/portal`, then anonymous viewers can navigate to the public decision from there.

## Screenshots
<img width="1415" height="880" alt="Screenshot001" src="https://github.com/user-attachments/assets/ec123a77-ed4d-4305-9fda-6a054e4e5cd8" />
<img width="942" height="740" alt="Screenshot002" src="https://github.com/user-attachments/assets/97400677-8a43-4b4d-a970-3820a51eea6a" />
<img width="1372" height="773" alt="Screenshot003" src="https://github.com/user-attachments/assets/ee873f99-a2e1-4529-80f2-5b52456a9eb6" />
<img width="1368" height="546" alt="Screenshot004" src="https://github.com/user-attachments/assets/41776bfe-c9ec-49ca-9f44-b5a82d202a2b" />




## Repository Notes
- App code lives in `statrumble/`.
- Verification script: `scripts/verify.sh`.
- Prompt-by-prompt history is logged in `docs/CODEX_LOG.md`.
- The app uses system font stacks, so `next build` does not require remote font downloads.

## Roadmap
### Now
- Improve collaboration UX (author display names, better commenting flow).
- Stronger navigation/context (breadcrumbs, workspace visibility).
- Better guardrails + demo UX (mode/cost clarity).

### Next
- Realtime updates (Supabase Realtime) instead of polling.
- User profiles (display names for all authors) + mentions.
- More review tooling around proposal diffs.

### Later
- More data formats (events/logs, richer metadata).
- More visualizations (comparisons, overlays, scenarios).
- Codex-agentic pipelines to generate/apply transformations with approvals.
