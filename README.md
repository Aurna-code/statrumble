# StatRumble

StatRumble is a one-week MVP for data debate workflows. A user uploads a CSV series, selects a segment on the chart, opens an arena thread, and gets a Referee decision that can be promoted to a public decision page.

The product scope is intentionally narrow: upload -> chart -> segment select -> arena thread -> referee -> decision. This keeps the path to demo stable while still proving collaborative analysis and adjudication.

## What Works Now (2-3 Min Demo)
- Create workspace + invite code + join
- Import CSV + pick range + create thread
- Comments + votes
- Run Referee/Judge (demo mode by default; real mode via BYOK)
- Promote to decision + share `/p/decisions/<publicId>`

Short overview: see Discord post; full roadmap and setup live here.

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
> If the anon key is missing, the app may boot but auth/DB can fail silently.
> Before submitting, run `./scripts/contest-preflight.sh` for a final check.

Equivalent from inside `statrumble/`: `cp .env.example .env.local` (or set env vars directly).
This flow starts in demo mode by default when `OPENAI_API_KEY` is not set.

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
- `[TODO]` Arena chart + range selection
- `[TODO]` Thread: comments/votes + Referee
- `[TODO]` Decision publish + public decision page

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
