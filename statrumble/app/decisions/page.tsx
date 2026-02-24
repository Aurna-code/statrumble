import Link from "next/link";
import OnboardingCard from "@/app/components/OnboardingCard";
import { listDecisions, type DecisionCardListItem } from "@/lib/db/decisions";
import { listMemberWorkspaceSummaries } from "@/lib/db/workspaces";

export const dynamic = "force-dynamic";

function formatDateLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export default async function DecisionsPage() {
  let hasMembership = false;

  try {
    const memberships = await listMemberWorkspaceSummaries();
    hasMembership = memberships.length > 0;
  } catch {
    hasMembership = false;
  }

  if (!hasMembership) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Decisions</h1>
        <p className="mt-2 text-sm text-zinc-600">워크스페이스에 참여해야 Decision을 확인할 수 있습니다.</p>
        <OnboardingCard />
      </main>
    );
  }

  let decisions: DecisionCardListItem[] = [];
  let loadError: Error | null = null;

  try {
    decisions = await listDecisions(50);
  } catch (error) {
    loadError = error instanceof Error ? error : new Error("Unknown error");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Decisions</h1>
      <p className="mt-2 text-sm text-zinc-600">워크스페이스 단위 Decision 카드 목록입니다.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        {loadError ? (
          <p className="text-sm text-red-600">
            조회 실패: {loadError.message}
          </p>
        ) : decisions.length === 0 ? (
          <p className="text-sm text-zinc-600">아직 Decision 카드가 없습니다.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {decisions.map((decision) => (
              <li key={decision.id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/decisions/${decision.id}`} className="text-base font-semibold hover:underline">
                    {decision.title}
                  </Link>
                  <span className="text-xs text-zinc-500">{formatDateLabel(decision.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">
                  {decision.summary ? decision.summary : "요약 없음"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                  <span>Created by: {decision.created_by ?? "-"}</span>
                  {decision.thread_id ? (
                    <Link href={`/threads/${decision.thread_id}`} className="hover:underline">
                      Thread 이동
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
