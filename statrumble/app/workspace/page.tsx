import Link from "next/link";
import InviteCodeCopyButton from "@/app/components/InviteCodeCopyButton";
import OnboardingCard from "@/app/components/OnboardingCard";
import {
  listMemberWorkspaceSummaries,
  listMemberWorkspaces,
  type MemberWorkspaceRow,
} from "@/lib/db/workspaces";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let workspaces: MemberWorkspaceRow[] = [];
  let membershipCount = 0;
  let loadError: string | null = null;

  try {
    const memberships = await listMemberWorkspaceSummaries();
    membershipCount = memberships.length;

    if (membershipCount > 0) {
      workspaces = await listMemberWorkspaces();
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="mt-2 text-sm text-zinc-600">현재 워크스페이스의 초대 코드로 멤버를 추가할 수 있습니다.</p>

      {loadError ? (
        <section className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-700">워크스페이스 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
        </section>
      ) : null}

      {!loadError && membershipCount === 0 ? (
        <OnboardingCard
          title="No workspace membership"
          description="먼저 Join 하거나 새 워크스페이스를 만들어야 초대 코드/멤버 정보를 볼 수 있습니다."
        />
      ) : null}

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        {!loadError && workspaces.length > 0 ? (
          <>
            <p className="text-sm text-zinc-600">내가 속한 workspace 목록입니다.</p>
            <ul className="mt-4 space-y-4">
              {workspaces.map((workspace) => (
                <li key={workspace.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <p className="font-medium">{workspace.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">role: {workspace.role}</p>
                  <p className="mt-3 text-xs text-zinc-500">Invite code</p>
                  <p className="mt-1 font-mono text-xl font-semibold tracking-wide">{workspace.invite_code}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    초대 상태: {workspace.invite_enabled ? "enabled" : "disabled"}
                  </p>
                  <InviteCodeCopyButton inviteCode={workspace.invite_code} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {!loadError && membershipCount === 0 ? (
        <div className="mt-4 flex gap-3">
          <Link
            href="/join"
            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Go to Join
          </Link>
          <Link
            href="/create-workspace"
            className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Create workspace
          </Link>
        </div>
      ) : null}
    </main>
  );
}
