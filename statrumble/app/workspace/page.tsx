import Link from "next/link";
import InviteCodeCopyButton from "@/app/components/InviteCodeCopyButton";
import { listMemberWorkspaces, type MemberWorkspaceRow } from "@/lib/db/workspaces";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let workspaces: MemberWorkspaceRow[] = [];
  let loadError: string | null = null;

  try {
    workspaces = await listMemberWorkspaces();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="mt-2 text-sm text-zinc-600">현재 워크스페이스의 초대 코드로 멤버를 추가할 수 있습니다.</p>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        {loadError ? (
          <p className="text-sm text-red-600">조회 실패: {loadError}</p>
        ) : workspaces.length > 0 ? (
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
        ) : (
          <>
            <p className="text-sm text-zinc-700">No workspace membership. Invite code로 먼저 Join 하세요.</p>
            <Link
              href="/join"
              className="mt-3 inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Go to Join
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
