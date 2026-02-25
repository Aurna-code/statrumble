"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InviteCodeCopyButton from "@/app/components/InviteCodeCopyButton";
import WorkspacePublicPortalControls from "@/app/components/WorkspacePublicPortalControls";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";
import type { MemberWorkspaceRow, WorkspaceMemberRow, WorkspacePublicProfile } from "@/lib/db/workspaces";
import { formatDateTimeLabel as formatJoinedAt } from "@/lib/formatDate";

type WorkspacesHubProps = {
  workspaces: MemberWorkspaceRow[];
  activeWorkspaceId: string | null;
  workspaceMembers: WorkspaceMemberRow[];
  membersWorkspaceId: string | null;
  membersError: string | null;
  workspacePublicProfile: WorkspacePublicProfile | null;
};

type SetActiveWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  error?: string;
};

type LeaveWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  active_workspace_id?: string | null;
  error?: string;
};

type PromoteWorkspaceMemberResponse = {
  ok: boolean;
  error?: string;
};

export default function WorkspacesHub({
  workspaces,
  activeWorkspaceId,
  workspaceMembers,
  membersWorkspaceId,
  membersError,
  workspacePublicProfile,
}: WorkspacesHubProps) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(activeWorkspaceId);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [members, setMembers] = useState(workspaceMembers);

  const activeWorkspace = useMemo(
    () => memberships.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [memberships, selectedWorkspaceId],
  );

  useEffect(() => {
    setMemberships(workspaces);
  }, [workspaces]);

  useEffect(() => {
    setSelectedWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    setMembers(workspaceMembers);
  }, [workspaceMembers]);

  async function handleSwitch(workspaceId: string) {
    if (switchingId || workspaceId === selectedWorkspaceId) {
      return;
    }

    setSwitchingId(workspaceId);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
        }),
      });
      const payload = (await response.json()) as SetActiveWorkspaceResponse;

      if (!response.ok || !payload.ok || !payload.workspace_id) {
        setErrorMessage(payload.error ?? "Failed to switch workspace.");
        return;
      }

      setSelectedWorkspaceId(payload.workspace_id);
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, payload.workspace_id);
      router.refresh();
    } catch {
      setErrorMessage("Network error.");
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleLeave(workspaceId: string) {
    if (leavingId) {
      return;
    }

    setLeavingId(workspaceId);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
        }),
      });
      const payload = (await response.json()) as LeaveWorkspaceResponse;

      if (!response.ok || !payload.ok) {
        setErrorMessage(payload.error ?? "Failed to leave workspace.");
        return;
      }

      setMemberships((prev) => prev.filter((workspace) => workspace.id !== workspaceId));
      const nextActiveWorkspaceId = payload.active_workspace_id ?? null;
      setSelectedWorkspaceId(nextActiveWorkspaceId);

      if (nextActiveWorkspaceId) {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, nextActiveWorkspaceId);
      } else {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      }

      router.refresh();
    } catch {
      setErrorMessage("Network error.");
    } finally {
      setLeavingId(null);
    }
  }

  async function handlePromote(workspaceId: string, userId: string) {
    if (promotingId) {
      return;
    }

    setPromotingId(userId);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspaces/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          user_id: userId,
          role: "owner",
        }),
      });
      const payload = (await response.json()) as PromoteWorkspaceMemberResponse;

      if (!response.ok || !payload.ok) {
        setErrorMessage(payload.error ?? "Failed to promote member.");
        return;
      }

      setMembers((prev) => {
        const updated = prev.map((member) =>
          member.user_id === userId ? { ...member, role: "owner" } : member,
        );
        const ownerCount = updated.filter((member) => member.role === "owner").length;

        setMemberships((prevWorkspaces) =>
          prevWorkspaces.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, owner_count: ownerCount } : workspace,
          ),
        );

        return updated;
      });
    } catch {
      setErrorMessage("Network error.");
    } finally {
      setPromotingId(null);
    }
  }

  const canShowMembers = membersWorkspaceId !== null && membersWorkspaceId === selectedWorkspaceId;
  const isActiveOwner = activeWorkspace?.role === "owner";

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active workspace</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900">
              {activeWorkspace ? activeWorkspace.name : "No active workspace"}
            </p>
            {activeWorkspace ? (
              <p className="mt-1 text-sm text-zinc-600">
                role: {activeWorkspace.role} · joined {formatJoinedAt(activeWorkspace.joined_at)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">워크스페이스를 선택해 주세요.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/join"
              className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Join workspace
            </Link>
            <Link
              href="/create-workspace"
              className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create workspace
            </Link>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {activeWorkspace && isActiveOwner ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Workspace Public Portal</h2>
              <p className="mt-1 text-sm text-zinc-600">공개 워크스페이스 포털을 설정합니다.</p>
            </div>
          </div>
          <div className="mt-4">
            <WorkspacePublicPortalControls
              workspaceId={activeWorkspace.id}
              workspaceName={activeWorkspace.name}
              initialProfile={workspacePublicProfile}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Your workspaces</h2>
            <p className="mt-1 text-sm text-zinc-600">role, joined_at, invite 상태를 확인하고 전환하세요.</p>
          </div>
          <p className="text-xs text-zinc-500">{memberships.length} total</p>
        </div>

        <ul className="mt-4 space-y-4">
          {memberships.map((workspace) => {
            const isActive = workspace.id === selectedWorkspaceId;
            const isSwitching = switchingId === workspace.id;
            const isLeaving = leavingId === workspace.id;
            const isLastOwner = workspace.role === "owner" && workspace.owner_count === 1;
            const isLeaveDisabled = isLeaving || isSwitching || isLastOwner;

            return (
              <li key={workspace.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900">{workspace.name}</p>
                      {isActive ? (
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      role: {workspace.role} · joined {formatJoinedAt(workspace.joined_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSwitch(workspace.id)}
                      disabled={isActive || isSwitching || isLeaving}
                      className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSwitching ? "Switching..." : isActive ? "Active" : "Switch"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLeave(workspace.id)}
                      disabled={isLeaveDisabled}
                      className="inline-flex items-center rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLeaving ? "Leaving..." : "Leave"}
                    </button>
                  </div>
                </div>
                {isLastOwner ? (
                  <p className="mt-2 text-xs text-amber-700">
                    마지막 owner라서 나갈 수 없습니다. 다른 owner를 지정하거나 워크스페이스를 삭제하세요.
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
                  <div>
                    <p className="text-zinc-500">Invite code</p>
                    <p className="mt-1 font-mono text-base font-semibold tracking-wide text-zinc-900">
                      {workspace.invite_code}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Invite status</p>
                    <p className="mt-1 text-sm text-zinc-700">
                      {workspace.invite_enabled ? "enabled" : "disabled"}
                    </p>
                  </div>
                </div>
                <InviteCodeCopyButton inviteCode={workspace.invite_code} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="mt-1 text-sm text-zinc-600">active workspace 멤버를 확인하고 owner로 승격하세요.</p>
          </div>
          <p className="text-xs text-zinc-500">{canShowMembers ? members.length : 0} total</p>
        </div>

        {membersError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {membersError}
          </div>
        ) : null}

        {!activeWorkspace ? (
          <p className="mt-3 text-sm text-zinc-600">워크스페이스를 선택해 주세요.</p>
        ) : !isActiveOwner ? (
          <p className="mt-3 text-sm text-zinc-600">owner만 멤버를 승격할 수 있습니다.</p>
        ) : membersError ? (
          <p className="mt-3 text-sm text-zinc-600">멤버를 불러오지 못했습니다.</p>
        ) : !canShowMembers ? (
          <p className="mt-3 text-sm text-zinc-600">멤버를 불러오는 중입니다.</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">표시할 멤버가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {members.map((member) => {
              const isPromoting = promotingId === member.user_id;

              return (
                <li
                  key={member.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-xs text-zinc-500">User ID</p>
                    <p className="mt-1 break-all font-mono text-sm text-zinc-900">{member.user_id}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      role: {member.role} · joined {formatJoinedAt(member.joined_at)}
                    </p>
                  </div>
                  <div>
                    {member.role === "owner" ? (
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                        Owner
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handlePromote(membersWorkspaceId ?? "", member.user_id)}
                        disabled={isPromoting || !membersWorkspaceId}
                        className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPromoting ? "Promoting..." : "Promote to owner"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
