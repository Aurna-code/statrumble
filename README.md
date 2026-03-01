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

## Modes
- Demo mode (default for reviewers): no API keys required, no API calls, full collaboration flow still works.
- API mode (BYOK): OpenAI calls are enabled and actions may incur costs.

Reviewer demo mode (hosted/local safe default):
- `DEMO_MODE=1`
- `NEXT_PUBLIC_DEMO_MODE=1`
- `OPENAI_API_KEY` unset

BYOK real mode:
- `OPENAI_API_KEY` set
- `DEMO_MODE` unset or `0`
- `NEXT_PUBLIC_DEMO_MODE` optional (unset is recommended)

## Environment Variables
Use `statrumble/.env.local` and never commit real keys.

- `NEXT_PUBLIC_SUPABASE_URL` (local default: `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (copy from `supabase status`)
- `OPENAI_API_KEY` (optional; required only for real API mode)
- `DEMO_MODE` (`1` forces deterministic mock AI responses on the server)
- `NEXT_PUBLIC_DEMO_MODE` (`1` forces demo mode via shared runtime mode logic)
- `NEXT_PUBLIC_DEV_PASSWORD_LOGIN` (optional toggle to show password login UI)

If `OPENAI_API_KEY` is set and `DEMO_MODE` is not `1`, server routes use real AI.
If `OPENAI_API_KEY` is missing, the app falls back to demo mode automatically.
AI action buttons show `(demo)` or `(API)` and helper text (`No API calls.` / `May incur costs.`).

Password login only works for accounts that already have an email+password set in Supabase Auth. This repo does not include password sign-up or password-setting flows. For first-time demos, prefer email OTP (magic link) login.

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
- `[TODO]` Arena with chart and selected segment
- `[TODO]` Thread with comments, votes, and referee report
- `[TODO]` Public decision page

## Repository Notes
- App code lives in `statrumble/`.
- Verification script: `scripts/verify.sh`.
- Prompt-by-prompt history is logged in `docs/CODEX_LOG.md`.
- The app uses system font stacks, so `next build` does not require remote font downloads.
