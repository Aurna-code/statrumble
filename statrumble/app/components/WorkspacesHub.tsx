"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DisplayNameEditor from "@/app/components/DisplayNameEditor";
import InviteCodeCopyButton from "@/app/components/InviteCodeCopyButton";
import MetaChipsRow from "@/app/components/MetaChipsRow";
import WorkspacePublicPortalControls from "@/app/components/WorkspacePublicPortalControls";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace/active";
import { membersLabel, portalStatusLabel, roleLabel } from "@/lib/workspaceLabel";
import type { MemberWorkspaceRow, WorkspaceMemberRow, WorkspacePublicProfile } from "@/lib/db/workspaces";
import { formatDateTimeLabel as formatJoinedAt } from "@/lib/formatDate";

type WorkspacesHubProps = {
  workspaces: MemberWorkspaceRow[];
  activeWorkspaceId: string | null;
  workspaceMembers: WorkspaceMemberRow[];
  membersWorkspaceId: string | null;
  membersError: string | null;
  workspacePublicProfile: WorkspacePublicProfile | null;
  portalStatusByWorkspaceId: Record<string, boolean>;
  initialDisplayName: string | null;
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

type DeleteWorkspaceResponse = {
  ok: boolean;
  workspace_id?: string;
  active_workspace_id?: string | null;
  error?: string;
};

export default function WorkspacesHub({
  workspaces,
  activeWorkspaceId,
  workspaceMembers,
  membersWorkspaceId,
  membersError,
  workspacePublicProfile,
  portalStatusByWorkspaceId,
  initialDisplayName,
}: WorkspacesHubProps) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(activeWorkspaceId);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [members, setMembers] = useState(workspaceMembers);
  const [viewerDisplayName, setViewerDisplayName] = useState(initialDisplayName?.trim() ?? "");
  const [portalStatusByWorkspace, setPortalStatusByWorkspace] = useState(portalStatusByWorkspaceId);

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

  useEffect(() => {
    setViewerDisplayName(initialDisplayName?.trim() ?? "");
  }, [initialDisplayName]);

  useEffect(() => {
    setPortalStatusByWorkspace(portalStatusByWorkspaceId);
  }, [portalStatusByWorkspaceId]);

  useEffect(() => {
    if (!deleteTargetId) {
      return;
    }

    if (memberships.some((workspace) => workspace.id === deleteTargetId)) {
      return;
    }

    setDeleteTargetId(null);
    setDeleteConfirmName("");
    setDeleteErrorMessage(null);
  }, [deleteTargetId, memberships]);

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
      setPortalStatusByWorkspace((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });

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

  function openDeletePanel(workspaceId: string) {
    if (deletingId) {
      return;
    }

    setDeleteTargetId(workspaceId);
    setDeleteConfirmName("");
    setDeleteErrorMessage(null);
  }

  function closeDeletePanel() {
    if (deletingId) {
      return;
    }

    setDeleteTargetId(null);
    setDeleteConfirmName("");
    setDeleteErrorMessage(null);
  }

  async function handleDelete(workspaceId: string) {
    if (deletingId) {
      return;
    }

    setDeletingId(workspaceId);
    setDeleteErrorMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmName: deleteConfirmName,
        }),
      });
      const payload = (await response.json()) as DeleteWorkspaceResponse;

      if (!response.ok || !payload.ok) {
        setDeleteErrorMessage(payload.error ?? "Failed to delete workspace.");
        return;
      }

      setMemberships((prev) => prev.filter((workspace) => workspace.id !== workspaceId));
      setPortalStatusByWorkspace((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });

      const nextActiveWorkspaceId = payload.active_workspace_id ?? null;
      setSelectedWorkspaceId(nextActiveWorkspaceId);

      if (nextActiveWorkspaceId) {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, nextActiveWorkspaceId);
      } else {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      }

      setDeleteTargetId(null);
      setDeleteConfirmName("");
      setDeleteErrorMessage(null);
      router.refresh();
      router.push("/workspaces");
    } catch {
      setDeleteErrorMessage("Network error.");
    } finally {
      setDeletingId(null);
    }
  }

  const canShowMembers = membersWorkspaceId !== null && membersWorkspaceId === selectedWorkspaceId;
  const isActiveOwner = activeWorkspace?.role === "owner";
  const activeWorkspacePortalStatus = portalStatusLabel(
    activeWorkspace ? portalStatusByWorkspace[activeWorkspace.id] ?? workspacePublicProfile?.is_public : false,
  );
  const activeMembersCount = canShowMembers && !membersError ? members.length : undefined;

  return (
    <section className="mt-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active workspace</p>

          {activeWorkspace ? (
            <div className="mt-3 space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">{activeWorkspace.name}</h2>
                <p className="mt-1 text-xs text-zinc-500">Joined {formatJoinedAt(activeWorkspace.joined_at)}</p>
              </div>

              <MetaChipsRow
                chips={[
                  {
                    label: `You: ${viewerDisplayName || "(set a display name)"}`,
                    tone: viewerDisplayName ? "default" : "warning",
                  },
                  { label: `Role: ${roleLabel(activeWorkspace.role)}` },
                  { label: `Members: ${membersLabel(activeMembersCount)}` },
                  {
                    label: `Portal: ${activeWorkspacePortalStatus.text}`,
                    tone: activeWorkspacePortalStatus.tone,
                  },
                ]}
              />

              <DisplayNameEditor embedded onDisplayNameChange={setViewerDisplayName} />

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">Invite code</p>
                <p className="mt-1 font-mono text-base font-semibold tracking-wide text-zinc-900">
                  {activeWorkspace.invite_code}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Invites are {activeWorkspace.invite_enabled ? "enabled" : "disabled"}.
                </p>
                <InviteCodeCopyButton inviteCode={activeWorkspace.invite_code} />
              </div>

              {isActiveOwner ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Workspace Public Portal</p>
                  <p className="mt-1 text-xs text-zinc-600">Publish or unpublish your workspace portal.</p>
                  <div className="mt-3">
                    <WorkspacePublicPortalControls
                      workspaceId={activeWorkspace.id}
                      workspaceName={activeWorkspace.name}
                      initialProfile={workspacePublicProfile}
                      onStatusChange={(isPublic) => {
                        setPortalStatusByWorkspace((prev) => ({
                          ...prev,
                          [activeWorkspace.id]: isPublic,
                        }));
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  Only workspace owners can change portal visibility.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <h2 className="text-lg font-semibold text-zinc-900">No active workspace</h2>
              <p className="mt-1 text-sm text-zinc-600">Create or join a workspace to continue.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/create-workspace"
                  className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Create workspace
                </Link>
                <Link
                  href="/join"
                  className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
                >
                  Join workspace
                </Link>
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Quick actions</h2>
          <p className="mt-1 text-sm text-zinc-600">Jump to key workflow steps.</p>
          <div className="mt-4 space-y-2">
            <Link
              href="/create-workspace"
              className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create workspace
            </Link>
            <Link
              href="/join"
              className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Join workspace
            </Link>
            <Link
              href="/#chart"
              className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Go to Arena
            </Link>
            <Link
              href="/threads"
              className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Threads
            </Link>
            <Link
              href="/decisions"
              className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Decisions
            </Link>
          </div>
          {!activeWorkspace ? (
            <p className="mt-3 text-xs text-zinc-600">Start by creating or joining a workspace.</p>
          ) : null}
        </aside>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">My workspaces</h2>
            <p className="mt-1 text-sm text-zinc-600">Switch between workspaces you belong to.</p>
          </div>
          <p className="text-xs text-zinc-500">{memberships.length} total</p>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white shadow-sm">
          {memberships.length === 0 ? (
            <p className="p-5 text-sm text-zinc-600">No workspaces yet. Create or join one above.</p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {memberships.map((workspace) => {
                const isActive = workspace.id === selectedWorkspaceId;
                const isSwitching = switchingId === workspace.id;
                const isLeaving = leavingId === workspace.id;
                const isDeleting = deletingId === workspace.id;
                const isDeletePanelOpen = deleteTargetId === workspace.id;
                const canDeleteWorkspace = workspace.role === "owner";
                const hasAnyPendingDelete = deletingId !== null;
                const isLastOwner = workspace.role === "owner" && workspace.owner_count === 1;
                const isSwitchDisabled = isActive || isSwitching || isLeaving || isDeleting || hasAnyPendingDelete;
                const isLeaveDisabled = isLeaving || isSwitching || isDeleting || isLastOwner || hasAnyPendingDelete;
                const isDeleteToggleDisabled = isSwitching || isLeaving || hasAnyPendingDelete;
                const isDeleteSubmitDisabled = isDeleting;
                const workspacePortalStatus = portalStatusLabel(portalStatusByWorkspace[workspace.id]);
                const workspaceMembersCount =
                  canShowMembers && workspace.id === selectedWorkspaceId && !membersError ? members.length : undefined;

                return (
                  <li key={workspace.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-zinc-900">{workspace.name}</p>
                          {isActive ? (
                            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                              Active
                            </span>
                          ) : null}
                        </div>

                        <MetaChipsRow
                          chips={[
                            { label: `Role: ${roleLabel(workspace.role)}` },
                            { label: `Members: ${membersLabel(workspaceMembersCount)}` },
                            {
                              label: `Portal: ${workspacePortalStatus.text}`,
                              tone: workspacePortalStatus.tone,
                            },
                          ]}
                        />

                        <p className="text-xs text-zinc-500">Joined {formatJoinedAt(workspace.joined_at)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSwitch(workspace.id)}
                          disabled={isSwitchDisabled}
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
                        {canDeleteWorkspace ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isDeletePanelOpen) {
                                closeDeletePanel();
                                return;
                              }

                              openDeletePanel(workspace.id);
                            }}
                            disabled={isDeleteToggleDisabled}
                            className="inline-flex items-center rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeletePanelOpen ? "Close delete" : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isLastOwner ? (
                      <p className="mt-2 text-xs text-amber-700">
                        You cannot leave as the last owner. Promote another owner, or use Delete for this workspace.
                      </p>
                    ) : null}

                    {isDeletePanelOpen ? (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                        <p className="text-sm font-semibold text-red-800">Delete workspace</p>
                        <p className="mt-1 text-xs text-red-700">Type the workspace name to confirm deletion.</p>
                        <p className="mt-1 text-xs text-red-700">
                          This will permanently delete threads, imports, decisions, and memberships.
                        </p>
                        <label className="mt-3 block text-xs font-medium text-red-800">
                          Workspace name
                          <input
                            type="text"
                            value={deleteConfirmName}
                            onChange={(event) => setDeleteConfirmName(event.target.value)}
                            placeholder={workspace.name}
                            disabled={isDeleting}
                            className="mt-1 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                        {deleteErrorMessage ? (
                          <p className="mt-2 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700">
                            {deleteErrorMessage}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={closeDeletePanel}
                            disabled={isDeleting}
                            className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(workspace.id)}
                            disabled={isDeleteSubmitDisabled}
                            className="inline-flex items-center rounded-md border border-red-200 bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeleting ? "Deleting..." : "Delete workspace"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="mt-1 text-sm text-zinc-600">Review active workspace members and promote owners.</p>
          </div>
          <p className="text-xs text-zinc-500">{canShowMembers ? members.length : 0} total</p>
        </div>

        {membersError ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{membersError}</div>
        ) : null}

        {!activeWorkspace ? (
          <p className="mt-3 text-sm text-zinc-600">Select a workspace.</p>
        ) : !isActiveOwner ? (
          <p className="mt-3 text-sm text-zinc-600">Only owners can promote members.</p>
        ) : membersError ? (
          <p className="mt-3 text-sm text-zinc-600">Failed to load members.</p>
        ) : !canShowMembers ? (
          <p className="mt-3 text-sm text-zinc-600">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No members to display.</p>
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
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">Owner</span>
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
      </section>
    </section>
  );
}
