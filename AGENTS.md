# StatRumble Agent Rules

## Goal
- Build and iterate StatRumble as a hackathon prototype (built in ~1 week).
- Keep scope focused on the single loop: upload -> chart -> segment select -> arena thread -> referee -> decision.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + ESLint
- No `src/` directory
- Import alias must remain `@/*`
- Supabase (Postgres + Auth + RLS)
- Recharts for charting
- PapaParse for CSV parsing
- OpenAI Responses API for Referee (`gpt-5.2-codex`)

## Security
- Never expose API keys to the client.
- OpenAI calls must run only on the server (route handlers/server actions).
- Never commit `.env.local` or any real secrets.
- Commit only `.env.example` placeholders.

## Commit Rules
- One prompt completion equals one commit.
- Propose a commit message at the end of each prompt.
- Keep changes minimal and directly tied to the prompt scope.

## Schema Change Protocol
- Any schema/data-structure change must be delivered as one set in one commit:
  1. Supabase migration files
  2. Type/model updates
  3. Related app/server code updates
  4. Verification updates/tests
- Do not leave schema migrations without corresponding type/code updates.

## Verification
- Required checks per prompt:
  - `npm run lint`
  - `npm run typecheck`
  - `./scripts/verify.sh`
- If tests exist, include them in verification.

## Logging
- After every prompt, append to `docs/CODEX_LOG.md`:
  - Prompt ID
  - Original prompt text
  - Change summary
  - Manual checklist
  - Commit hash if known; otherwise omit the commit line.

## Out-of-Scope (until later phase)
- Canonical vs User Overlay patching system
- Approver/curator proposal-review-merge workflow
- Runtime schema rewrite / auto-rebase logic
