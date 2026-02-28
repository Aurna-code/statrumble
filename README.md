# StatRumble

StatRumble is a one-week MVP for data debate workflows. A user uploads a CSV series, selects a segment on the chart, opens an arena thread, and gets a Referee decision that can be promoted to a public decision page.

The product scope is intentionally narrow: upload -> chart -> segment select -> arena thread -> referee -> decision. This keeps the path to demo stable while still proving collaborative analysis and adjudication.

## How Codex Is Used
- Transform proposals: users can propose transformed series, and Codex produces structured outputs that become candidate threads.
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

Equivalent from inside `statrumble/`: `cp .env.example .env.local` (or set env vars directly).

To fetch local Supabase keys:

```bash
pnpm -C statrumble exec supabase status
```

## Environment Variables
Use `statrumble/.env.local` and never commit real keys.

- `NEXT_PUBLIC_SUPABASE_URL` (local default: `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (copy from `supabase status`)
- `OPENAI_API_KEY` (user-provided API key)
- `NEXT_PUBLIC_DEV_PASSWORD_LOGIN` (optional demo toggle)

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

## Demo Script (Two Users)
1. User A signs in and creates a workspace.
2. User A copies the workspace invite code.
3. User B signs in and joins via invite code.
4. User A uploads CSV data and creates a thread from a selected chart segment.
5. User A and User B comment and vote in the same thread.
6. User A runs Referee/Judge to generate the decision report.
7. User A promotes the thread to decision and publishes it.
8. Share the public decision link from the portal.

## Screenshots
- `[TODO]` Arena with chart and selected segment
- `[TODO]` Thread with comments, votes, and referee report
- `[TODO]` Public decision page

## Repository Notes
- App code lives in `statrumble/`.
- Verification script: `scripts/verify.sh`.
- Prompt-by-prompt history is logged in `docs/CODEX_LOG.md`.
- The app uses system font stacks, so `next build` does not require remote font downloads.
