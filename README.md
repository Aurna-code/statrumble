# StatRumble

## What StatRumble Is
StatRumble is a collaborative data debate app where teams upload metrics, create a Transform Proposal from natural language, branch ideas with Fork, compare Deltas, and close with a Referee Decision.

## How Codex Enables Collaboration
- Codex converts natural-language prompts into a Transform Proposal with a safe `TransformSpec` and SQL preview for review.
- Any proposal can be Forked so multiple alternatives can be explored in parallel.
- Child proposals surface Deltas in the `Compare to parent` panel for transparent change review.
- Arena threads keep messages, votes, Referee output, and final Decision in one place.
- The `Proposal` badge makes proposal threads obvious during a live demo.

## Demo Flow
1. Open `http://localhost:3000/` and upload a CSV metric series.
2. On `/`, submit a prompt to create a Transform Proposal.
3. Confirm the new thread card shows the `Proposal` badge.
4. Open the proposal thread at `http://localhost:3000/threads/<id>`.
5. Create a Fork from that proposal.
6. Review Deltas in the `Compare to parent` panel.
7. Add discussion messages and votes in the thread.
8. Run the Referee and review the final Decision.

## Local Setup
1. Install dependencies.
```bash
pnpm install
```
2. Create local environment file.
```bash
cp .env.example statrumble/.env.local
```
3. Set required values in `statrumble/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`.
4. Optional values: `CODEX_MODEL` (default `gpt-5.1-codex-mini`), `NEXT_PUBLIC_DEFAULT_WORKSPACE_ID`, `NEXT_PUBLIC_DEV_PASSWORD_LOGIN`.
5. Start the app.
```bash
pnpm dev
```

## Smoke Test
Use `scripts/demo-smoke.sh` to verify Transform Proposal creation, Fork creation, Deltas generation, and invalid-parent rejection.

Required env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_EMAIL`, `TEST_PASSWORD`, `IMPORT_ID`.

Optional env vars: `BASE_URL` (default `http://localhost:3000`), `COOKIE`, `PARENT_THREAD_ID`.

The script auto-seeds workspace membership before proposal requests.

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
TEST_EMAIL=... \
TEST_PASSWORD=... \
IMPORT_ID=... \
BASE_URL=http://localhost:3000 \
bash scripts/demo-smoke.sh
```

## Safety Note
SQL preview is NOT executed. Runtime transforms use a safe TransformSpec DSL, and every Transform Proposal is validated server-side before persistence, comparison, and Referee evaluation.
